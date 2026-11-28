import {BadRequestException,Injectable,ServiceUnavailableException,Inject} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {CreateTouristPlanDto} from './tourist.dto';
type Point={lat:number;lng:number};
function distance(a:Point,b:Point){const rad=(n:number)=>n*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
@Injectable()
export class TouristService{
 constructor(@Inject(DatabaseService) private readonly database:DatabaseService){}
 private mapPlace(p:any){return {id:p.id,name:p.name,city:p.city,category:p.category||'Explore',description:p.description||'',address:p.address||'',lat:p.latitude,lng:p.longitude,tags:p.tags||[],nearbyFacilities:p.nearby_facilities||[],estimatedVisitHours:Number(p.estimated_visit_hours||1.5),imageUrl:p.image_url||null,imageAlt:p.image_alt||p.name,imageCredit:p.image_credit||null,imageSourceUrl:p.image_source_url||null};}
 async getPlaces(city?:string,category?:string,search?:string){let q=this.database.publicClient().from('tourist_places').select('*').eq('is_active',true);if(city&&city!=='All Bangladesh')q=q.ilike('city',city);if(category&&category!=='All')q=q.ilike('category',category);const {data,error}=await q.order('name');if(error)throw new ServiceUnavailableException(error.message);const needle=search?.trim().toLowerCase();return (data||[]).map(x=>this.mapPlace(x)).filter(p=>!needle||(p.name+' '+p.description+' '+p.tags.join(' ')).toLowerCase().includes(needle));}
 async getRecommendations(city:string,interests:string,origin?:Point){const selected=interests.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);const places=await this.getPlaces(city);return places.map(p=>({...p,matchScore:p.tags.filter(t=>selected.includes(t)).length,distanceFromCurrentLocationKm:origin&&p.lat!==null&&p.lng!==null?Number(distance(origin,{lat:p.lat,lng:p.lng}).toFixed(2)):null})).sort((a,b)=>b.matchScore-a.matchScore||(origin?(a.distanceFromCurrentLocationKm??Infinity)-(b.distanceFromCurrentLocationKm??Infinity):a.name.localeCompare(b.name))).slice(0,8);}
 private async optimizeCarStops(points:Point[]){
  if(points.length<2)throw new Error('At least two route points are required.');
  const coordinates=points.map(p=>p.lng+','+p.lat).join(';');
  const url='https://router.project-osrm.org/trip/v1/driving/'+coordinates
    +'?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson&steps=false';
  const response=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'DRIVE-CSE412-Academic-Project/1.0'}});
  if(!response.ok)throw new Error('Road routing service is unavailable.');
  const data:any=await response.json();
  const trip=data.trips?.[0];
  if(data.code!=='Ok'||!trip||!Array.isArray(data.waypoints)||data.waypoints.length!==points.length)throw new Error('No optimized road route was returned.');
  const order=data.waypoints.map((waypoint:any,index:number)=>({inputIndex:index,order:Number(waypoint.waypoint_index)}))
    .sort((a:any,b:any)=>a.order-b.order);
  return {order,legs:trip.legs||[],distanceKm:Number((trip.distance/1000).toFixed(2)),durationMinutes:Math.max(1,Math.round(trip.duration/60)),geometry:trip.geometry||null};
 }
 async createPlan(userId:string,token:string,dto:CreateTouristPlanDto){
  const {data,error}=await this.database.userClient(token).from('tourist_places').select('*').in('id',dto.placeIds).eq('city',dto.city).eq('is_active',true);
  if(error)throw new ServiceUnavailableException(error.message);
  if(!data||data.length!==dto.placeIds.length)throw new BadRequestException('One or more selected destinations do not belong to the selected city.');
  const byId=new Map(data.map(x=>[x.id,this.mapPlace(x)]));
  const selected=dto.placeIds.map(id=>byId.get(id)!);
  const mode=dto.transportPreference||'Car';
  const hasOrigin=Boolean(dto.origin);
  const points:Point[]=[...(dto.origin?[dto.origin]:[]),...selected.map(p=>({lat:p.lat,lng:p.lng})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng))];
  let orderedPlaces=selected;
  let road:any=null;
  let routeProvider='Straight-line estimate';
  let estimate='Approximate straight-line distances and rough travel times; not live road routing or traffic.';
  if((mode==='Car'||mode==='Bike')&&points.length>=2){
   try{
    road=await this.optimizeCarStops(points);
    const offset=hasOrigin?1:0;
    const order=road.order.filter((x:any)=>x.inputIndex>=offset);
    orderedPlaces=order.map((x:any)=>selected[x.inputIndex-offset]).filter(Boolean);
    routeProvider='OpenStreetMap OSRM optimized road route';
    estimate='Optimized multi-stop road route using OpenStreetMap OSRM. Standard duration only; live traffic is not included. Bike mode uses the standard driving road network, not a dedicated motorcycle profile.';
   }catch{
    routeProvider='Straight-line fallback';
    estimate='The road-routing service was unavailable. Distances are straight-line approximations and are not road directions or turn-by-turn navigation.';
   }
  }else if(mode==='Walking'||mode==='Public Transport'){
   estimate='Approximate straight-line distance with a rough mode-based travel-time estimate; this public routing service does not provide pedestrian or public-transport routing.';
  }
  const speed=mode==='Walking'?4.5:mode==='Bike'?22:mode==='Public Transport'?18:25;
  let total=0;
  const stops=orderedPlaces.map((p,i)=>{
   const legIndex=hasOrigin?i:i-1;
   const leg=road?.legs?.[legIndex];
   const previous=i===0?(dto.origin||null):orderedPlaces[i-1];
   const km=leg?Number((leg.distance/1000).toFixed(2)):(previous?distance(previous,p):0);
   const travelMinutes=leg?Math.max(1,Math.round(leg.duration/60)):(i===0&&!hasOrigin?0:Math.max(1,Math.round(km/speed*60)));
   total+=km;
   return {...p,order:i+1,distanceFromPreviousKm:km,estimatedTravelMinutes:travelMinutes};
  });
  const totalKm=road?road.distanceKm:Number(total.toFixed(2));
  const minutes=road?road.durationMinutes:stops.reduce((sum,x)=>sum+x.estimatedTravelMinutes,0);
  const {data:plan,error:pe}=await this.database.userClient(token).from('tourist_plans').insert({
   user_id:userId,city:dto.city,place_ids:orderedPlaces.map(p=>p.id),transport_preference:mode,travel_date:dto.travelDate||null,
   origin_lat:dto.origin?.lat??null,origin_lng:dto.origin?.lng??null,total_distance_km:totalKm,
   approximate_travel_minutes:minutes,estimate_type:estimate,
  }).select('*').single();
  if(pe||!plan)throw new BadRequestException(pe?.message||'Tourist plan could not be saved.');
  return {id:plan.id,city:plan.city,travelDate:plan.travel_date,transportPreference:plan.transport_preference,
   origin:dto.origin||null,stops,totalDistanceKm:totalKm,approximateTravelMinutes:minutes,estimateType:estimate,
   routeProvider,routeGeometry:road?.geometry||null,optimizedStopOrder:Boolean(road),createdAt:plan.created_at};
 }
 async getPlans(userId:string,token:string){const {data,error}=await this.database.userClient(token).from('tourist_plans').select('*').eq('user_id',userId).order('created_at',{ascending:false});if(error)throw new ServiceUnavailableException(error.message);const plans=data||[];const result:any[]=[];for(const plan of plans){const ids=(plan.place_ids||[]) as string[];const {data:places,error:placeError}=await this.database.publicClient().from('tourist_places').select('*').in('id',ids as any);if(placeError)throw new ServiceUnavailableException(placeError.message);const byId:Record<string,any>={};for(const place of (places||[]) as any[])byId[String(place.id)]=this.mapPlace(place);const stops=ids.map(id=>byId[id]).filter((place:any)=>Boolean(place));result.push({...plan,stops});}return result;}
}