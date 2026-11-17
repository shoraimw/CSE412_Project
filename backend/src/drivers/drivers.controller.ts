import {BadRequestException,Controller,ForbiddenException,Get,Post,Body,Query,Req,UseGuards,Inject} from '@nestjs/common';
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
    if(r.user.role!=='passenger')throw new ForbiddenException('Only passengers can discover nearby drivers.');
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
    return {ok:true,isAvailable:d.isAvailable,vehicleType:application.requested_vehicle_type,updatedAt};
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
    if(r.user.role!=='passenger')throw new BadRequestException('Only passenger accounts can apply to become a driver.');
    const {data,error}=await this.db.userClient(r.user.accessToken).from('driver_applications').insert({
      user_id:r.user.id,
      license_number:d.license_number.trim(),
      verification_type:d.verification_type,
      experience_years:d.experience_years??0,
      requested_vehicle_type:d.requested_vehicle_type||'bike',
      note:d.note?.trim()||null,
    }).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Driver application could not be submitted.');
    return {message:'Driver application submitted for review.',application:data};
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
