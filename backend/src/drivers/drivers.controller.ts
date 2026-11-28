import {BadRequestException,ConflictException,Controller,ForbiddenException,Get,Post,Body,Query,Req,UseGuards,Inject} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '../auth/auth.guard';
import {DatabaseService} from '../database/database.service';
import {DriverApplicationDto,DriverDocumentDto,DriverLocationDto,NearbyDriversQuery} from './driver.dto';

type AR=Request&{user:{id:string;accessToken:string;role:string;isVerified:boolean}};

@Controller('drivers')
@UseGuards(AuthGuard)
export class DriversController {
  constructor(@Inject(DatabaseService) private db:DatabaseService){}

  @Get('nearby')
  async nearby(@Req()r:AR,@Query()q:NearbyDriversQuery){
    if(!['passenger','driver','vehicle_owner'].includes(r.user.role))throw new ForbiddenException('Only customer accounts can discover nearby drivers.');
    const {data,error}=await this.db.userClient(r.user.accessToken).rpc('drive_nearby_drivers',{
      p_lat:q.lat,
      p_lng:q.lng,
      p_vehicle_type:q.vehicleType||null,
      p_radius_km:q.radiusKm||15,
    });
    if(error)throw new BadRequestException(error.message);
    return data||[];
  }

  @Post('location')
  async updateLocation(@Req()r:AR,@Body()d:DriverLocationDto){
    if(r.user.role!=='driver'||!r.user.isVerified){
      throw new ForbiddenException('Only verified driver accounts can share availability.');
    }
    const db=this.db.userClient(r.user.accessToken);
    const {data:application,error:applicationError}=await db.from('driver_applications')
      .select('status,requested_vehicle_type').eq('user_id',r.user.id).maybeSingle();
    if(applicationError||!application||application.status!=='approved'){
      throw new ForbiddenException('Your driver application must be approved before going online.');
    }
    const {data:previous,error:previousError}=await db.from('driver_locations')
      .select('is_available,updated_at').eq('driver_id',r.user.id).maybeSingle();
    if(previousError)throw new BadRequestException(previousError.message);

    const updatedAt=new Date().toISOString();
    const {error}=await db.from('driver_locations').upsert({
      driver_id:r.user.id,
      latitude:d.lat,
      longitude:d.lng,
      heading:d.heading??null,
      speed_kph:d.speedKph??null,
      is_available:d.isAvailable,
      updated_at:updatedAt,
    },{onConflict:'driver_id'});
    if(error)throw new BadRequestException(error.message);

    let notifiedOpenRequests=0;
    let notificationWarning:string|null=null;
    const previousHeartbeat=previous?.updated_at?Date.parse(previous.updated_at):0;
    const shouldCatchUp=d.isAvailable&&(!previous?.is_available||!previousHeartbeat||Date.now()-previousHeartbeat>45_000);
    if(shouldCatchUp){
      const {data:count,error:notificationError}=await db.rpc('drive_notify_open_requests_to_driver');
      if(notificationError)notificationWarning=notificationError.message;
      else notifiedOpenRequests=Number(count||0);
    }

    return {
      ok:true,
      isAvailable:d.isAvailable,
      vehicleType:application.requested_vehicle_type,
      updatedAt,
      notifiedOpenRequests,
      notificationWarning,
    };
  }

  @Get('application')
  async getApplication(@Req()r:AR){
    const {data,error}=await this.db.userClient(r.user.accessToken).from('driver_applications')
      .select('*').eq('user_id',r.user.id).maybeSingle();
    if(error)throw new BadRequestException(error.message);
    return data;
  }

  @Post('application')
  async apply(@Req()r:AR,@Body()d:DriverApplicationDto){
    if(r.user.role!=='passenger'){
      throw new ForbiddenException('Only Passenger accounts can apply for Driver Partner access. New DRIVE registrations start as Passenger accounts.');
    }
    const db=this.db.userClient(r.user.accessToken);
    const {data:existing,error:lookupError}=await db.from('driver_applications')
      .select('id,status').eq('user_id',r.user.id).maybeSingle();
    if(lookupError)throw new BadRequestException(lookupError.message);

    const applicationPayload={
      license_number:d.license_number.trim(),
      experience_years:d.experience_years??0,
      requested_vehicle_type:d.requested_vehicle_type||'bike',
      note:d.note?.trim()||null,
    };

    if(existing?.status==='pending'){
      throw new ConflictException('Your Driver Partner application is already pending administrator review.');
    }
    if(existing?.status==='approved'){
      throw new ConflictException('Your Driver Partner application has already been approved. Sign in again to activate your Driver workspace.');
    }

    if(existing?.status==='rejected'){
      // A rejected applicant remains a Passenger and can correct their details
      // and resubmit. This uses the existing owner-scoped rejected->pending RLS policy.
      const {data,error}=await db.from('driver_applications')
        .update({
          ...applicationPayload,
          status:'pending',
          reviewer_id:null,
          reviewed_at:null,
          rejection_reason:null,
        })
        .eq('id',existing.id)
        .eq('user_id',r.user.id)
        .eq('status','rejected')
        .select('*')
        .single();
      if(error||!data)throw new BadRequestException(error?.message||'Your application could not be resubmitted. Please refresh and try again.');
      return {message:'Your updated Driver Partner application has been resubmitted for administrator review.',application:data,resubmitted:true};
    }

    const {data,error}=await db.from('driver_applications').insert({
      user_id:r.user.id,
      ...applicationPayload,
    }).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Driver application could not be submitted.');
    return {message:'Driver Partner application submitted for administrator review.',application:data,resubmitted:false};
  }

  @Post('documents')
  async submitDocument(@Req()r:AR,@Body()d:DriverDocumentDto){
    if(r.user.role!=='driver')throw new BadRequestException('Only approved driver applicants can submit verification documents.');
    const {data,error}=await this.db.userClient(r.user.accessToken).from('driver_documents').insert({
      driver_id:r.user.id,document_type:d.document_type,storage_path:d.storage_path.trim(),
    }).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Driver document could not be submitted.');
    return {message:'Document submitted for verification.',document:data};
  }
}
