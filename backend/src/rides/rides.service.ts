import { BadRequestException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException, Inject } from '@nestjs/common';
import {createHash,randomBytes} from 'crypto';
import {DatabaseService} from '../database/database.service';
import {FareService} from '../fare/fare.service';
import {RoutesService} from '../routes/routes.service';
import {getDriveRuntimeConfig} from '../config/runtime-config';
import {CreateRideDto,RideLocationDto} from './rides.dto';

type Role='passenger'|'driver'|'vehicle_owner'|'admin';
function haversine(a:{lat:number;lng:number},b:{lat:number;lng:number}){const rad=(n:number)=>n*Math.PI/180;const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
@Injectable()
export class RidesService{
 constructor(@Inject(DatabaseService) private readonly database:DatabaseService,@Inject(FareService) private readonly fare:FareService,@Inject(RoutesService) private readonly routes:RoutesService){}
 private db(token:string){return this.database.userClient(token);}
 private async geocode(address:string){const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=bd&q='+encodeURIComponent(address+', Bangladesh');const response=await fetch(url,{headers:{'User-Agent':process.env.NOMINATIM_USER_AGENT||'DRIVE-CSE412-Academic-Project/1.0'},signal:AbortSignal.timeout(8000)});if(!response.ok)throw new ServiceUnavailableException('Map geocoding is temporarily unavailable.');const rows:any[]=await response.json();if(!rows.length)throw new BadRequestException('Could not find this location. Add a more specific Dhaka address.');return {lat:Number(rows[0].lat),lng:Number(rows[0].lon)};}
 async create(userId:string,token:string,dto:CreateRideDto){
  if(!dto.pickupAddress?.trim()||!dto.destinationAddress?.trim())throw new BadRequestException('Pickup and destination are required.');

  const pickup=dto.pickupLat!==undefined&&dto.pickupLng!==undefined
    ?{lat:dto.pickupLat,lng:dto.pickupLng}
    :await this.geocode(dto.pickupAddress);
  const destination=dto.destinationLat!==undefined&&dto.destinationLng!==undefined
    ?{lat:dto.destinationLat,lng:dto.destinationLng}
    :await this.geocode(dto.destinationAddress);

  const straightKm=haversine(pickup,destination);
  if(!Number.isFinite(straightKm)||straightKm<=0)throw new BadRequestException('Pickup and destination must be different valid locations.');

  // The server computes the authoritative road route and fare. The browser
  // no longer supplies a hand-entered distance, traffic level or demand level.
  // Always obtain the authoritative route on the server. Browser-supplied
  // distance, duration or traffic values are never trusted for the fare.
  const routeResult=await this.routes.optimize({
    pickupLat:pickup.lat,
    pickupLng:pickup.lng,
    destinationLat:destination.lat,
    destinationLng:destination.lng,
    preference:dto.routePreference||'balanced',
  });
  const selectedRoute=routeResult.selectedRoute;
  const proposedKm=Number(selectedRoute?.distanceKm);
  const validRouteQuote=Number.isFinite(proposedKm)&&proposedKm>=straightKm*0.95&&proposedKm<=straightKm*5;
  const estimatedKm=Number((validRouteQuote?proposedKm:straightKm*1.25).toFixed(2));
  const durationMinutes=validRouteQuote&&Number.isFinite(Number(selectedRoute.durationMinutes))
    ?Math.max(1,Math.round(Number(selectedRoute.durationMinutes)))
    :Math.max(1,Math.round(estimatedKm/25*60));
  let demandRow:any=null;
  try{
    const demandResult=await this.db(token).rpc('drive_demand_snapshot',{
      p_lat:pickup.lat,p_lng:pickup.lng,p_vehicle_type:dto.vehicleType,p_radius_km:5,
    });
    if(!demandResult.error)demandRow=Array.isArray(demandResult.data)?demandResult.data[0]:demandResult.data;
  }catch{}
  const fareEstimate=await this.fare.estimate({
    distanceKm:estimatedKm,
    vehicleType:dto.vehicleType,
    durationMinutes,
  },demandRow?{
    openRequests:Number(demandRow.open_requests||0),
    availableDrivers:Number(demandRow.available_drivers||0),
  }:undefined);
  const fare=fareEstimate.estimatedFare;

  const payload={
    passenger_id:userId,
    pickup_label:dto.pickupAddress.trim(),
    pickup_lat:pickup.lat,
    pickup_lng:pickup.lng,
    destination_label:dto.destinationAddress.trim(),
    destination_lat:destination.lat,
    destination_lng:destination.lng,
    requested_vehicle:dto.vehicleType,
    is_shared:!!dto.isShared,
    women_safety_preference:!!dto.womenSafetyPreference,
    estimated_distance_km:estimatedKm,
    estimated_duration_minutes:durationMinutes,
    estimated_fare:fare,
    currency:'BDT',
    notes:dto.notes?.trim()||null,
    seats_requested:dto.seatsRequested||1,
  };

  const db=this.db(token);
  const {data,error}=await db.from('ride_requests').insert(payload).select('*').single();
  if(error||!data)throw new BadRequestException(error?.message||'Ride request could not be saved.');

  const {data:preference,error:preferenceError}=await db.from('user_safety_preferences')
    .select('women_safety_enabled').eq('user_id',userId).maybeSingle();
  if(preferenceError)throw new ServiceUnavailableException(preferenceError.message);
  const womenSafetyEnabled=!!dto.womenSafetyPreference||!!preference?.women_safety_enabled;

  let womenSafety:any=null;
  if(womenSafetyEnabled){
   try{
    const now=new Date();
    const expected=new Date(now.getTime()+(durationMinutes+10)*60000);
    const point=dto.safetyInitialLocation;
    const routeCoordinates=selectedRoute?.geometry?.coordinates;
    const plannedRoute=dto.safetyPlannedRoute?.length
      ?dto.safetyPlannedRoute
      :(Array.isArray(routeCoordinates)&&routeCoordinates.length>1
        ?(routeCoordinates.length>100
          ?Array.from({length:100},(_,i)=>routeCoordinates[Math.round(i*(routeCoordinates.length-1)/99)])
          :routeCoordinates).map(([lng,lat]:number[])=>({lat,lng}))
        :[]);
    const {data:session,error:sessionError}=await db.from('safety_trip_sessions').insert({
      user_id:userId,
      ride_request_id:data.id,
      destination:dto.destinationAddress.trim(),
      started_at:now.toISOString(),
      expected_arrival_at:expected.toISOString(),
      status:'ACTIVE',
      current_lat:point?.lat??null,
      current_lng:point?.lng??null,
      planned_route:plannedRoute,
      warnings:[],
    }).select('*').single();
    if(sessionError||!session)throw new Error(sessionError?.message||'Women Safety session could not be created.');

    if(point){
      const {error:locationError}=await db.from('safety_trip_locations').insert({
        safety_trip_id:session.id,user_id:userId,latitude:point.lat,longitude:point.lng,
      });
      if(locationError)throw new Error(locationError.message);
    }

    const {data:contacts,error:contactsError}=await db.from('trusted_contacts')
      .select('id,contact_name,phone,contact_type')
      .eq('user_id',userId).eq('contact_type','trusted').order('created_at');
    if(contactsError)throw new Error(contactsError.message);

    let shareToken:string|null=null,expiresAt:string|null=null;
    if(contacts?.length){
      shareToken=randomBytes(32).toString('hex');
      const tokenHash=createHash('sha256').update(shareToken).digest('hex');
      expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
      const {error:shareError}=await db.from('trip_shares').insert({
        safety_trip_id:session.id,
        user_id:userId,
        token_hash:tokenHash,
        contact_ids:contacts.map(contact=>contact.id),
        expires_at:expiresAt,
      });
      if(shareError)throw new Error(shareError.message);
    }
    womenSafety={
      enabled:true,
      sessionId:session.id,
      sessionStarted:true,
      shareToken,
      expiresAt,
      initialLocationReceived:!!point,
      contacts:(contacts||[]).map(contact=>({
        id:contact.id,name:contact.contact_name,phone:contact.phone,type:contact.contact_type,
      })),
    };
   }catch(safetyError){
    // A secondary safety-share setup problem must not silently discard the
    // primary ride request. Tell the passenger exactly what still needs work.
    womenSafety={
      enabled:true,
      sessionStarted:false,
      warning:safetyError instanceof Error?safetyError.message:'Women Safety could not be initialized.',
    };
   }
  }

  return {
    ...this.formatRequest(data,null),
    womenSafety,
    routeSummary:{
      provider:routeResult.provider,
      trafficStatus:routeResult.trafficStatus,
      distanceKm:estimatedKm,
      durationMinutes,
      note:routeResult.note,
    },
    fareEstimate,
  };
 }
 async list(userId:string,token:string,role:Role){
  if(role==='passenger'){
   const db=this.db(token);
   const [{data:owned,error:ownedError},{data:memberships,error:membershipError}]=await Promise.all([
    db.from('ride_requests').select('*,rides(id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare,ride_passengers(passenger_id,fare_share))').eq('passenger_id',userId).order('created_at',{ascending:false}),
    db.from('ride_passengers').select('ride_id,seats,fare_share,rides(id,request_id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare,ride_requests(*))').eq('passenger_id',userId)
   ]);
   if(ownedError||membershipError)throw new ServiceUnavailableException(ownedError?.message||membershipError?.message);
   const rows=new Map<string,any>();
   for(const item of owned||[]){
    const ride=Array.isArray(item.rides)?item.rides[0]||null:item.rides;
    const membership=(ride?.ride_passengers||[]).find((p:any)=>p.passenger_id===userId);
    const formatted=this.formatRequest(item,ride);
    if(membership){formatted.passengerFare=Number(membership.fare_share);formatted.seats=Number(membership.seats||1);}
    rows.set(item.id,formatted);
   }
   for(const membership of memberships||[]){
    const ride=Array.isArray(membership.rides)?membership.rides[0]||null:membership.rides;
    const request=Array.isArray(ride?.ride_requests)?ride.ride_requests[0]||null:ride?.ride_requests;
    if(!ride||!request)continue;
    const existing=rows.get(request.id);
    if(existing){existing.passengerFare=Number(membership.fare_share);existing.seats=Number(membership.seats||1);}
    else{const formatted=this.formatRequest(request,ride);formatted.passengerFare=Number(membership.fare_share);formatted.seats=Number(membership.seats||1);rows.set(request.id,formatted);}
   }
   return Array.from(rows.values()).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  }
  if(role==='driver'){const {data,error}=await this.db(token).from('rides').select('*,ride_requests(*)').eq('driver_id',userId).order('created_at',{ascending:false});if(error)throw new ServiceUnavailableException(error.message);return (data||[]).map(x=>this.formatDriverRide(x));}
  if(role==='admin'){const {data,error}=await this.db(token).from('ride_requests').select('*,rides(id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare)').order('created_at',{ascending:false}).limit(200);if(error)throw new ServiceUnavailableException(error.message);return (data||[]).map(x=>this.formatRequest(x,Array.isArray(x.rides)?x.rides[0]||null:x.rides));}
  return [];
 }
 async myBookings(userId:string,token:string,role:Role){
  if(!['passenger','driver','vehicle_owner'].includes(role))throw new ForbiddenException('Ride booking history is available to customer accounts.');
  const db=this.db(token);
  const [{data:owned,error:ownedError},{data:memberships,error:membershipError}]=await Promise.all([
   db.from('ride_requests').select('*,rides(id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare,actual_fare_breakdown,ride_passengers(passenger_id,seats,fare_share))').eq('passenger_id',userId).order('created_at',{ascending:false}),
   db.from('ride_passengers').select('ride_id,seats,fare_share,rides(id,request_id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare,actual_fare_breakdown,ride_requests(*))').eq('passenger_id',userId)
  ]);
  if(ownedError||membershipError)throw new ServiceUnavailableException(ownedError?.message||membershipError?.message);
  const rows=new Map<string,any>();
  for(const item of owned||[]){
   const ride=Array.isArray(item.rides)?item.rides[0]||null:item.rides;
   const membership=(ride?.ride_passengers||[]).find((p:any)=>p.passenger_id===userId);
   const formatted=this.formatRequest(item,ride);
   if(membership){formatted.passengerFare=Number(membership.fare_share);formatted.seats=Number(membership.seats||1);}
   rows.set(item.id,formatted);
  }
  for(const membership of memberships||[]){
   const ride=Array.isArray(membership.rides)?membership.rides[0]||null:membership.rides;
   const request=Array.isArray(ride?.ride_requests)?ride.ride_requests[0]||null:ride?.ride_requests;
   if(!ride||!request)continue;
   const existing=rows.get(request.id);
   if(existing){existing.passengerFare=Number(membership.fare_share);existing.seats=Number(membership.seats||1);}
   else{const formatted=this.formatRequest(request,ride);formatted.passengerFare=Number(membership.fare_share);formatted.seats=Number(membership.seats||1);rows.set(request.id,formatted);}
  }
  return Array.from(rows.values()).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
 }
 async openRequests(userId:string,token:string,role:Role){
  if(role!=='driver')throw new ForbiddenException('Only drivers can view open ride requests.');
  const db=this.db(token);
  const {data:application,error:applicationError}=await db.from('driver_applications')
    .select('requested_vehicle_type,status').eq('user_id',userId).maybeSingle();
  if(applicationError||!application||application.status!=='approved'){
    throw new ForbiddenException('Your approved driver application is required to view ride requests.');
  }
  const {data,error}=await db.rpc('drive_nearby_ride_requests',{p_radius_km:20});
  if(error)throw new ServiceUnavailableException(error.message);
  const {data:rejected,error:rejectedError}=await db.from('ride_request_rejections')
    .select('request_id').eq('driver_id',userId);
  if(rejectedError)throw new ServiceUnavailableException(rejectedError.message);
  const rejectedIds=new Set((rejected||[]).map((row:any)=>row.request_id));
  return (data||[]).filter((request:any)=>!rejectedIds.has(request.id));
 }
 async rejectRequest(userId:string,token:string,role:Role,requestId:string){
  if(role!=='driver')throw new ForbiddenException('Only drivers can pass on ride requests.');
  const db=this.db(token);
  const available=await this.openRequests(userId,token,role);
  if(!available.some((request:any)=>request.id===requestId)){
    throw new BadRequestException('This request is no longer available to you.');
  }
  const {data,error}=await db.from('ride_request_rejections')
    .insert({request_id:requestId,driver_id:userId}).select('id').single();
  if(error){
    if(error.code==='23505')return {message:'You have already passed on this request.'};
    throw new BadRequestException(error.message);
  }
  return {message:'Request passed. It remains available to other eligible drivers.',rejectionId:data.id};
 }
 async cancelRequest(userId:string,token:string,requestId:string,role:Role){
  if(!['passenger','driver','vehicle_owner'].includes(role))throw new ForbiddenException('Only customer accounts can cancel their own unaccepted ride requests.');
  const {data,error}=await this.db(token).from('ride_requests').update({status:'cancelled',cancelled_at:new Date().toISOString()})
   .eq('id',requestId).eq('passenger_id',userId).eq('status','requested').select('id,status').maybeSingle();
  if(error)throw new BadRequestException(error.message);
  if(!data)throw new BadRequestException('This ride can no longer be cancelled. It may already have been accepted or cancelled.');
  return {requestId:data.id,status:data.status,message:'Ride request cancelled.'};
 }
 async claimRequest(userId:string,token:string,role:Role,requestId:string){
  if(role!=='driver')throw new ForbiddenException('Only drivers can accept ride requests.');
  const db=this.db(token);
  const {data:rejection,error:rejectionError}=await db.from('ride_request_rejections')
    .select('id').eq('request_id',requestId).eq('driver_id',userId).maybeSingle();
  if(rejectionError)throw new ServiceUnavailableException(rejectionError.message);
  if(rejection)throw new ForbiddenException('You already passed on this request.');
  const {data,error}=await db.rpc('drive_claim_request',{p_request_id:requestId});
  if(error)throw new BadRequestException(error.message);
  const rideId=data as string;
  // Seed the passenger's tracking map with the driver's latest online position
  // immediately after acceptance; subsequent GPS updates keep this row fresh.
  const {data:location}=await db.from('driver_locations')
    .select('latitude,longitude,heading,speed_kph,updated_at')
    .eq('driver_id',userId).maybeSingle();
  if(location){
    const {error:locationError}=await db.from('trip_locations').upsert({
      ride_id:rideId,
      driver_id:userId,
      latitude:location.latitude,
      longitude:location.longitude,
      heading:location.heading,
      speed_kph:location.speed_kph,
      recorded_at:location.updated_at||new Date().toISOString(),
    },{onConflict:'ride_id'});
    if(locationError){
      // The claim is already committed; do not report it as failed because a
      // best-effort first GPS point could not be copied.
    }
  }
  return {rideId,message:'Ride request accepted.'};
 }
 async get(userId:string,token:string,id:string){
  const db=this.db(token);
  const {data,error}=await db.from('rides').select('*,ride_requests(*)').eq('id',id).maybeSingle();
  if(error||!data)throw new NotFoundException('Ride not found.');
  const request=Array.isArray(data.ride_requests)?data.ride_requests[0]:data.ride_requests;
  let participant=data.driver_id===userId||request?.passenger_id===userId;
  if(!participant){
    const {data:membership,error:membershipError}=await db.from('ride_passengers')
      .select('ride_id').eq('ride_id',id).eq('passenger_id',userId).maybeSingle();
    if(membershipError)throw new ServiceUnavailableException(membershipError.message);
    participant=!!membership;
  }
  if(!participant)throw new NotFoundException('Ride not found.');
  return this.formatDriverRide({...data,ride_requests:request});
 }
 async messages(userId:string,token:string,id:string){
  const ride=await this.get(userId,token,id);
  const {data,error}=await this.db(token).from('ride_messages')
    .select('id,ride_id,sender_id,body,created_at,profiles:profiles!ride_messages_sender_id_fkey(full_name)')
    .eq('ride_id',id).order('created_at',{ascending:true}).limit(200);
  if(error)throw new ServiceUnavailableException(error.message);
  return {rideId:id,status:ride.status,messages:data||[]};
 }
 async sendMessage(userId:string,token:string,id:string,body:string){
  const ride=await this.get(userId,token,id);
  if(!['matched','driver_arriving','in_progress'].includes(ride.status))throw new BadRequestException('Chat is closed because this ride is no longer active.');
  const clean=body.trim();
  if(clean.length<1||clean.length>2000)throw new BadRequestException('Message must contain 1–2000 characters.');
  const {data,error}=await this.db(token).from('ride_messages').insert({ride_id:id,sender_id:userId,body:clean})
    .select('id,ride_id,sender_id,body,created_at,profiles:profiles!ride_messages_sender_id_fkey(full_name)').single();
  if(error||!data)throw new BadRequestException(error?.message||'Message could not be sent.');
  return data;
 }
 async requestCancellation(userId:string,token:string,id:string,role:Role,reason:string,emergency=false,location?:{lat:number;lng:number}){
  if(!['passenger','driver','vehicle_owner'].includes(role))throw new ForbiddenException('Only a passenger, driver or vehicle owner who joined this ride can request cancellation.');
  const clean=reason.trim();
  if(clean.length<8||clean.length>500)throw new BadRequestException('Please provide a cancellation reason between 8 and 500 characters.');
  const {data,error}=await this.db(token).rpc('drive_request_ride_cancellation',{
   p_ride_id:id,p_reason:clean,p_emergency:emergency,
   p_lat:location?.lat??null,p_lng:location?.lng??null,
  });
  if(error||!data)throw new BadRequestException(error?.message||'Cancellation request could not be recorded.');
  return data;
 }
 async driverCancelRide(userId:string,token:string,id:string,role:Role,reason:string){
  if(role!=='driver')throw new ForbiddenException('Only the assigned driver can end an active ride.');
  const clean=reason.trim();
  if(clean.length<8||clean.length>500)throw new BadRequestException('Please provide a cancellation reason between 8 and 500 characters.');
  const {data,error}=await this.db(token).rpc('drive_driver_cancel_ride',{p_ride_id:id,p_reason:clean});
  if(error||!data)throw new BadRequestException(error?.message||'Ride could not be cancelled.');
  return data;
 }
 async cancellationRequests(userId:string,token:string,role:Role){
  if(role!=='driver')throw new ForbiddenException('Only drivers can review cancellation requests.');
  const {data,error}=await this.db(token).from('ride_cancellation_requests')
    .select('id,ride_id,requester_id,requester_role,reason,status,created_at,rides!inner(driver_id,status,request_id)')
    .eq('status','pending').eq('rides.driver_id',userId).order('created_at',{ascending:false});
  if(error)throw new ServiceUnavailableException(error.message);
  return data||[];
 }
 async respondCancellation(userId:string,token:string,id:string,role:Role,approve:boolean,note?:string){
  if(role!=='driver')throw new ForbiddenException('Only the assigned driver can respond to a cancellation request.');
  const {data,error}=await this.db(token).rpc('drive_respond_ride_cancellation',{
   p_cancellation_id:id,p_approve:approve,p_note:note?.trim()||null,
  });
  if(error||!data)throw new BadRequestException(error?.message||'Cancellation decision could not be saved.');
  return data;
 }
 async updateStatus(userId:string,token:string,id:string,status:string,role:Role){
  if(role!=='driver')throw new ForbiddenException('Only the assigned driver can update trip status.');
  const ride=await this.get(userId,token,id);
  const allowed:Record<string,string[]>={matched:['driver_arriving'],driver_arriving:['in_progress'],in_progress:['completed'],completed:[],cancelled:[]};
  if(!allowed[ride.status]?.includes(status))throw new BadRequestException('Invalid ride status transition.');

  // If a fresh GPS fix exists, do not let a Driver manually mark a distant
  // ride as completed. Manual completion remains a fallback when GPS is
  // unavailable or the last fix is stale.
  if(status==='completed'){
    const request=ride.request||{};
    const destinationLat=Number(request.destination_lat);
    const destinationLng=Number(request.destination_lng);
    const hasDestination=Number.isFinite(destinationLat)&&Number.isFinite(destinationLng)
      &&destinationLat>=-90&&destinationLat<=90&&destinationLng>=-180&&destinationLng<=180;
    if(hasDestination){
      const {data:location,error:locationError}=await this.db(token).from('trip_locations')
        .select('latitude,longitude,recorded_at')
        .eq('ride_id',id)
        .maybeSingle();
      if(locationError)throw new ServiceUnavailableException('Could not verify the latest trip GPS fix.');
      if(location){
        const ageMs=Date.now()-new Date(location.recorded_at).getTime();
        if(Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=30000){
          const distanceToDestination=haversine(
            {lat:Number(location.latitude),lng:Number(location.longitude)},
            {lat:destinationLat,lng:destinationLng},
          );
          if(Number.isFinite(distanceToDestination)&&distanceToDestination>0.15){
            throw new BadRequestException('The latest GPS fix is still more than 150 metres from the destination. Keep sharing GPS until arrival; manual completion is available only when GPS is unavailable or stale.');
          }
        }
      }
    }
  }

  const patch:any={status,updated_at:new Date().toISOString()};
  if(status==='driver_arriving')patch.accepted_at=new Date().toISOString();
  if(status==='in_progress')patch.started_at=new Date().toISOString();
  if(status==='completed')patch.completed_at=new Date().toISOString();
  const {data,error}=await this.db(token).from('rides').update(patch).eq('id',id).eq('driver_id',userId).eq('status',ride.status).select('*').single();
  if(error||!data)throw new BadRequestException(error?.message||'Trip status could not be updated.');
  if(status==='completed'){
    try{
      const finalFare=await this.finalizeFare(userId,token,id,role);
      return {...ride,...data,actualFare:finalFare.actualFare,actualFareBreakdown:finalFare.breakdown};
    }catch(error){
      return {...ride,...data,fareFinalizationPending:true,fareWarning:error instanceof Error?error.message:'Final fare calculation is pending.'};
    }
  }
  return {...ride,...data};
 }
 async finalizeFare(userId:string,token:string,id:string,role:Role){
  if(role!=='driver')throw new ForbiddenException('Only the assigned driver can finalize a ride fare.');
  const ride=await this.get(userId,token,id);
  if(ride.driver_id!==userId||ride.status!=='completed')throw new BadRequestException('Only the assigned driver can finalize a completed trip.');
  const db=this.db(token);
  const {data:points,error:pointsError}=await db.from('trip_location_history')
    .select('latitude,longitude,recorded_at').eq('ride_id',id).order('recorded_at',{ascending:true}).limit(2000);
  if(pointsError)throw new ServiceUnavailableException(pointsError.message);
  const samples=points||[];
  let gpsDistance=0;
  let acceptedSegments=0;
  for(let i=1;i<samples.length;i++){
    const previous=samples[i-1],current=samples[i];
    const segment=haversine({lat:Number(previous.latitude),lng:Number(previous.longitude)},{lat:Number(current.latitude),lng:Number(current.longitude)});
    const elapsedHours=Math.max(0,(new Date(current.recorded_at).getTime()-new Date(previous.recorded_at).getTime())/3600000);
    const plausibleLimit=Math.max(0.15,elapsedHours*150);
    if(Number.isFinite(segment)&&segment>=0.005&&segment<=plausibleLimit){gpsDistance+=segment;acceptedSegments++;}
  }
  const estimatedDistance=Number(ride.request?.estimated_distance_km||ride.distanceKm||0);
  const useGps=acceptedSegments>0&&gpsDistance>=0.1;
  const distanceKm=Number((useGps?gpsDistance:estimatedDistance).toFixed(2));
  if(!Number.isFinite(distanceKm)||distanceKm<=0)throw new BadRequestException('Neither GPS samples nor a valid route estimate are available for final fare calculation.');
  const startedAt=ride.ride?.started_at?new Date(ride.ride.started_at).getTime():Date.now();
  const durationMinutes=Math.max(1,Math.ceil((Date.now()-startedAt)/60000));
  const estimate=await this.fare.estimate({distanceKm,vehicleType:ride.vehicleType,durationMinutes},{openRequests:0,availableDrivers:1});
  const breakdown={
    ...estimate.breakdown,
    distanceKm,
    durationMinutes,
    distanceSource:useGps?'driver_gps_samples':'estimated_route_fallback',
    gpsSamples:samples.length,
    acceptedGpsSegments:acceptedSegments,
    estimatedRouteDistanceKm:estimatedDistance,
    note:useGps?'Final distance uses accepted GPS segments.':'GPS samples were insufficient; the server route estimate was used.',
  };
  const serverSecret=getDriveRuntimeConfig().driveFareFinalizationSecret;
  if(!serverSecret)throw new ServiceUnavailableException('Dedicated server-side fare finalization secret is not configured on the API.');
  const {data,error}=await this.database.publicClient().rpc('drive_finalize_ride_fare',{
    p_secret:serverSecret,p_driver_id:userId,p_ride_id:id,
    p_actual_fare:estimate.estimatedFare,p_breakdown:breakdown,
  });
  if(error||!data)throw new BadRequestException(error?.message||'Final fare could not be recorded.');
  return data;
 }

 async updateLocation(userId:string,token:string,id:string,point:RideLocationDto,role:Role){
  if(role!=='driver')throw new ForbiddenException('Only driver accounts can share trip GPS.');
  const ride=await this.get(userId,token,id);
  if(ride.driver_id!==userId)throw new ForbiddenException('Only the assigned driver can share live location.');
  if(!['matched','driver_arriving','in_progress'].includes(ride.status))throw new BadRequestException('Driver GPS is available while approaching pickup and during an active trip.');

  const db=this.db(token);
  const recordedAt=new Date().toISOString();
  const {error:historyError}=await db.from('trip_location_history').insert({
    ride_id:id,driver_id:userId,latitude:point.lat,longitude:point.lng,recorded_at:recordedAt,
  });
  if(historyError)throw new BadRequestException(historyError.message);

  const {data,error}=await db.from('trip_locations').upsert({
    ride_id:id,driver_id:userId,latitude:point.lat,longitude:point.lng,
    heading:point.heading??null,speed_kph:point.speedKph??null,recorded_at:recordedAt,
  },{onConflict:'ride_id'}).select('latitude,longitude,recorded_at').single();
  if(error||!data)throw new BadRequestException(error?.message||'Location update failed.');

  let autoCompleted=false;
  let autoCompletionError:string|undefined;
  const destinationLat=Number(ride.request?.destination_lat);
  const destinationLng=Number(ride.request?.destination_lng);
  const hasDestination=Number.isFinite(destinationLat)&&Number.isFinite(destinationLng)
    &&destinationLat>=-90&&destinationLat<=90&&destinationLng>=-180&&destinationLng<=180;
  const speedIsSafe=point.speedKph===undefined||point.speedKph===null||point.speedKph<=15;

  if(ride.status==='in_progress'&&hasDestination&&speedIsSafe){
    const cutoff=new Date(Date.now()-60000).toISOString();
    const {data:recent,error:recentError}=await db.from('trip_location_history')
      .select('latitude,longitude,recorded_at')
      .eq('ride_id',id)
      .gte('recorded_at',cutoff)
      .order('recorded_at',{ascending:false})
      .limit(100);

    if(recentError){
      autoCompletionError=recentError.message;
    }else{
      const samples=(recent||[]).slice().reverse();
      const destination={lat:destinationLat,lng:destinationLng};
      const end=samples[samples.length-1];
      const endTime=end?new Date(end.recorded_at).getTime():0;
      let dwellStart:number|null=null;
      let previousTime=endTime;

      // Walk backward through the continuous suffix of GPS samples inside
      // the 75m destination geofence. Require 15s of uninterrupted evidence.
      for(let i=samples.length-1;i>=0;i--){
        const sample=samples[i];
        const timestamp=new Date(sample.recorded_at).getTime();
        const distance=haversine(
          {lat:Number(sample.latitude),lng:Number(sample.longitude)},
          destination,
        );
        if(!Number.isFinite(distance)||distance>0.075)break;
        if(previousTime-timestamp>15000)break;
        dwellStart=timestamp;
        previousTime=timestamp;
      }

      if(dwellStart!==null&&endTime-dwellStart>=15000){
        try{
          await this.updateStatus(userId,token,id,'completed',role);
          autoCompleted=true;
        }catch(completionError){
          const latest=await this.get(userId,token,id).catch(()=>null);
          if(latest?.status==='completed')autoCompleted=true;
          else autoCompletionError=completionError instanceof Error
            ?completionError.message:'Automatic arrival completion is pending.';
        }
      }
    }
  }

  return {...data,historyRecorded:true,autoCompleted,autoCompletionError};
 }
 async tracking(userId:string,token:string,id:string){const ride=await this.get(userId,token,id);const {data,error}=await this.db(token).from('trip_locations').select('latitude,longitude,recorded_at,heading,speed_kph').eq('ride_id',id).order('recorded_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new ServiceUnavailableException(error.message);const request=ride.request||{};return {rideId:ride.id,status:ride.status,driverId:ride.driver_id,currentLocation:data?{lat:data.latitude,lng:data.longitude,updatedAt:data.recorded_at,heading:data.heading,speedKph:data.speed_kph}:null,pickup:{lat:request.pickup_lat,lng:request.pickup_lng},destination:{lat:request.destination_lat,lng:request.destination_lng},updatedAt:data?.recorded_at||null};}
 async openShared(token:string,role:Role){if(role!=='passenger')throw new ForbiddenException('Only passengers can join shared rides.');const {data,error}=await this.db(token).rpc('drive_list_shared_rides');if(error)throw new ServiceUnavailableException(error.message);return data||[];}
 async joinShared(userId:string,token:string,id:string,role:Role){if(role!=='passenger')throw new ForbiddenException('Only passengers can join shared rides.');const {data,error}=await this.db(token).rpc('drive_join_shared_ride',{p_ride_id:id});if(error||!data)throw new BadRequestException(error?.message||'Could not join this shared ride.');return data;}
 private formatRequest(r:any,ride:any):any{return {id:ride?.id||r.id,requestId:r.id,rideId:ride?.id||null,passengerId:r.passenger_id,pickupAddress:r.pickup_label,destinationAddress:r.destination_label,vehicleType:r.requested_vehicle,isShared:r.is_shared,womenSafetyPreference:r.women_safety_preference,status:ride?.status||r.status,requestStatus:r.status,estimatedFare:Number(r.estimated_fare||0),actualFare:ride?.actual_fare==null?null:Number(ride.actual_fare),actualFareBreakdown:ride?.actual_fare_breakdown||{},fareFinalizationPending:ride?.status==='completed'&&ride?.actual_fare==null,distanceKm:r.estimated_distance_km,etaMinutes:r.estimated_duration_minutes,createdAt:r.created_at,driver_id:ride?.driver_id||null,request:r,ride};}
 private formatDriverRide(r:any){const q=r.ride_requests||{};return {id:r.id,requestId:r.request_id,rideId:r.id,passengerId:q.passenger_id,pickupAddress:q.pickup_label,destinationAddress:q.destination_label,vehicleType:q.requested_vehicle,isShared:q.is_shared,status:r.status,estimatedFare:Number(q.estimated_fare||0),actualFare:r.actual_fare==null?null:Number(r.actual_fare),actualFareBreakdown:r.actual_fare_breakdown||{},fareFinalizationPending:r.status==='completed'&&r.actual_fare==null,distanceKm:q.estimated_distance_km,createdAt:r.created_at,driver_id:r.driver_id,request:q,ride:r};}
}