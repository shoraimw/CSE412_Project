import {BadRequestException,Body,Controller,Get,Post,Query,Req,UseGuards,ServiceUnavailableException} from '@nestjs/common';
import {Request} from 'express';
import {DatabaseService} from '../database/database.service';
import {AuthGuard} from '../auth/auth.guard';
import {CreateBookingDto} from './dto/create-booking.dto';
type AuthReq=Request&{user:{id:string;accessToken:string}};
function validDate(s:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3];}
function dhakaToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return p;}
@Controller('rental')
export class RentalController{
 constructor(private readonly database:DatabaseService){}
 @Get('vehicles')async getVehicles(@Query('type')type='All',@Query('location')location='',@Query('max_price')maxPrice=''){
  const max=maxPrice===''?null:Number(maxPrice);if(max!==null&&(!Number.isFinite(max)||max<0))throw new BadRequestException('Maximum price must be a valid positive number.');
  let query=this.database.publicClient().from('vehicles').select('id,make,model,vehicle_type,city,seats,price_per_day,price_per_km,photo_paths,description,model_year,color').eq('is_verified',true).eq('is_available',true);
  if(type!=='All')query=query.eq('vehicle_type',type.toLowerCase());if(location.trim())query=query.ilike('city','%'+location.trim()+'%');if(max!==null)query=query.lte('price_per_day',max);
  const {data,error}=await query.order('created_at',{ascending:false});if(error)throw new ServiceUnavailableException(error.message);
  return (data||[]).map(v=>({id:v.id,name:[v.make,v.model].filter(Boolean).join(' '),type:v.vehicle_type,location:v.city,seats:v.seats,price:Number(v.price_per_day||0),image:v.photo_paths?.[0]||'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=900',images:v.photo_paths||[],description:v.description,year:v.model_year,color:v.color,pricePerKm:v.price_per_km}));
 }
 @Get('bookings')@UseGuards(AuthGuard)async listBookings(@Req()r:AuthReq){const {data,error}=await this.database.userClient(r.user.accessToken).from('rental_bookings').select('*,vehicles(make,model,city,photo_paths)').eq('renter_id',r.user.id).order('created_at',{ascending:false});if(error)throw new ServiceUnavailableException(error.message);return data||[];}
 @Post('bookings')@UseGuards(AuthGuard)async createBooking(@Req()r:AuthReq,@Body()dto:CreateBookingDto){
  const name=dto.customer_name.trim();if(!name||!validDate(dto.start_date)||!validDate(dto.end_date)||dto.start_date<dhakaToday()||dto.end_date<dto.start_date)throw new BadRequestException('Please provide valid rental dates and customer details.');
  const db=this.database.userClient(r.user.accessToken);const {data:vehicle,error:vehicleError}=await db.from('vehicles').select('id,owner_id,price_per_day,is_verified,is_available').eq('id',dto.vehicle_id).maybeSingle();
  if(vehicleError||!vehicle||!vehicle.is_verified||!vehicle.is_available)throw new BadRequestException('This vehicle is not currently available for booking.');
  if(vehicle.owner_id===r.user.id)throw new BadRequestException('You cannot rent your own vehicle.');
  if(vehicle.price_per_day===null)throw new BadRequestException('This vehicle does not have a daily rental price.');
  const start=new Date(dto.start_date+'T00:00:00+06:00');const end=new Date(dto.end_date+'T23:59:59+06:00');const days=Math.max(1,Math.ceil((Date.parse(dto.end_date)-Date.parse(dto.start_date))/86400000)+1);const total=Number((Number(vehicle.price_per_day)*days).toFixed(2));
  const {data,error}=await db.from('rental_bookings').insert({vehicle_id:vehicle.id,renter_id:r.user.id,start_at:start.toISOString(),end_at:end.toISOString(),total_amount:total,currency:'BDT',pickup_note:name}).select('*').single();
  if(error||!data)throw new BadRequestException(error?.message||'Rental booking could not be created.');
  return {message:'Rental request submitted. The vehicle owner must approve it before it is confirmed.',booking:data};
 }
}