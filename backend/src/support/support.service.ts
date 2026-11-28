import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SupportService {
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService){}
  private db(token:string){return this.database.userClient(token);}

  async createReview(userId:string,token:string,input:any){
    const db=this.db(token);
    const {data:ride,error:rideError}=await db.from('rides').select('id,driver_id,status').eq('id',input.rideId).maybeSingle();
    if(rideError||!ride)throw new NotFoundException('Ride not found.');
    if(ride.status!=='completed')throw new BadRequestException('A driver review is available only after the ride is completed.');
    const {data:membership,error:membershipError}=await db.from('ride_passengers').select('ride_id').eq('ride_id',input.rideId).eq('passenger_id',userId).maybeSingle();
    if(membershipError||!membership)throw new ForbiddenException('Only a passenger on this completed ride can review its driver.');
    const {data,error}=await db.from('reviews').insert({
      ride_id:input.rideId,reviewer_id:userId,reviewee_id:ride.driver_id,
      rating:input.rating,comment:input.comment?.trim()||null,
    }).select('*').single();
    if(error)throw new BadRequestException(error.code==='23505'?'You have already reviewed this ride.':error.message);
    return {message:'Thank you. Your driver feedback has been saved.',review:data};
  }

  async myReviews(userId:string,token:string){
    const {data,error}=await this.db(token).from('reviews').select('id,ride_id,reviewee_id,rating,comment,created_at').eq('reviewer_id',userId).order('created_at',{ascending:false});
    if(error)throw new ServiceUnavailableException(error.message);
    return data||[];
  }

  async createCase(userId:string,token:string,input:any){
    if(input.rideId&&input.rentalBookingId)throw new BadRequestException('Link a case to either a ride or a rental booking, not both.');
    const db=this.db(token);
    if(input.rideId){
      const {data:membership,error:membershipError}=await db.from('ride_passengers')
        .select('ride_id').eq('ride_id',input.rideId).eq('passenger_id',userId).maybeSingle();
      if(membershipError||!membership)throw new ForbiddenException('You can only link a support case to a ride you joined.');
    }
    if(input.rentalBookingId){
      const {data:booking,error:bookingError}=await db.from('rental_bookings')
        .select('id').eq('id',input.rentalBookingId).eq('renter_id',userId).maybeSingle();
      if(bookingError||!booking)throw new ForbiddenException('You can only link a support case to your own rental booking.');
    }
    const {data,error}=await db.from('support_cases').insert({
      user_id:userId,ride_id:input.rideId||null,rental_booking_id:input.rentalBookingId||null,
      category:input.category,subject:input.subject.trim(),description:input.description.trim(),
    }).select('*').single();
    if(error)throw new BadRequestException(error.message);
    return {message:'Your support case has been submitted.',case:data};
  }

  async myCases(userId:string,token:string){
    const {data,error}=await this.db(token).from('support_cases').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(100);
    if(error)throw new ServiceUnavailableException(error.message);
    return data||[];
  }

  async adminCases(token:string){
    const {data,error}=await this.db(token).from('support_cases')
      .select('*,profile:profiles!support_cases_user_id_fkey(full_name,phone)')
      .order('created_at',{ascending:false}).limit(200);
    if(error)throw new ServiceUnavailableException(error.message);
    return data||[];
  }

  async updateCase(token:string,adminId:string,id:string,input:any){
    const {data,error}=await this.db(token).rpc('drive_admin_update_support_case',{
      p_case_id:id,p_status:input.status,p_priority:input.priority||null,p_admin_note:input.adminNote?.trim()||null,
    });
    if(error||!data)throw new BadRequestException(error?.message||'Support case could not be updated.');
    return {message:'Support case updated and customer notified.',case:data};
  }

  async adminReviews(token:string){
    const {data,error}=await this.db(token).from('reviews')
      .select('id,ride_id,reviewer_id,reviewee_id,rating,comment,created_at')
      .order('created_at',{ascending:false}).limit(200);
    if(error)throw new ServiceUnavailableException(error.message);
    const rows=data||[];
    const ids=[...new Set(rows.flatMap((r:any)=>[r.reviewer_id,r.reviewee_id]))];
    const {data:profiles,error:profileError}=ids.length
      ?await this.db(token).from('profiles').select('id,full_name').in('id',ids)
      :{data:[],error:null};
    if(profileError)throw new ServiceUnavailableException(profileError.message);
    const map=new Map<string,any>((profiles||[]).map((p:any)=>[p.id,p] as [string,any]));
    return rows.map((r:any)=>({...r,reviewer:map.get(r.reviewer_id)||null,reviewee:map.get(r.reviewee_id)||null}));
  }

  async fareRules(token:string){
    const {data,error}=await this.db(token).from('fare_rules').select('*').order('vehicle_type');
    if(error)throw new ServiceUnavailableException(error.message);
    return data||[];
  }

  async updateFareRule(token:string,adminId:string,vehicleType:string,input:any){
    if(!['car','bike','cng'].includes(vehicleType))throw new BadRequestException('Unsupported fare vehicle type.');
    const patch:any={updated_by:adminId,updated_at:new Date().toISOString()};
    for(const key of ['base_fare','per_km','per_minute','peak_hour_multiplier','demand_multiplier_cap','is_active']){
      if(input[key]!==undefined)patch[key]=input[key];
    }
    if(Object.keys(patch).length===2)throw new BadRequestException('No fare rule fields were provided.');
    const {data,error}=await this.db(token).from('fare_rules').update(patch).eq('vehicle_type',vehicleType).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Fare rule could not be updated.');
    const {error:auditError}=await this.db(token).from('admin_audit_logs').insert({
      admin_id:adminId,action:'fare_rule.updated',entity_type:'fare_rule',entity_id:null,
      details:{vehicleType,changes:input},
    });
    if(auditError)console.error('[DRIVE fare audit]',auditError.message);
    return {message:'Fare rule updated.',rule:data};
  }
}
