import {BadRequestException,ConflictException,Body,Controller,ForbiddenException,Get,Post,Req,UseGuards,Inject} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '../auth/auth.guard';
import {DatabaseService} from '../database/database.service';
import {OwnerApplicationDto} from './owner.dto';
type AR=Request&{user:{id:string;accessToken:string;role:string}};
@Controller('owners') @UseGuards(AuthGuard)
export class OwnersController {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
  @Get('application') async getApplication(@Req()r:AR){
    const {data,error}=await this.db.userClient(r.user.accessToken).from('vehicle_owner_applications').select('*').eq('user_id',r.user.id).maybeSingle();
    if(error)throw new BadRequestException(error.message);return data;
  }
  @Post('application') async apply(@Req()r:AR,@Body()d:OwnerApplicationDto){
    if(r.user.role!=='passenger')throw new ForbiddenException('Only Passenger accounts can apply to become a Vehicle Owner.');
    const db=this.db.userClient(r.user.accessToken);
    const {data:existing,error:lookupError}=await db.from('vehicle_owner_applications')
      .select('id,status').eq('user_id',r.user.id).maybeSingle();
    if(lookupError)throw new BadRequestException(lookupError.message);
    const payload={
      business_name:d.business_name.trim(),
      contact_phone:d.contact_phone.trim(),
      business_address:d.business_address.trim(),
      note:d.note?.trim()||null,
    };
    if(existing?.status==='pending')throw new ConflictException('Your Vehicle Owner application is already pending administrator review.');
    if(existing?.status==='approved')throw new ConflictException('Your Vehicle Owner application has already been approved.');
    if(existing?.status==='rejected'){
      const {data,error}=await db.from('vehicle_owner_applications')
        .update({...payload,status:'pending',reviewer_id:null,reviewed_at:null,rejection_reason:null})
        .eq('id',existing.id).eq('user_id',r.user.id).eq('status','rejected')
        .select('*').single();
      if(error||!data)throw new BadRequestException(error?.message||'Your application could not be resubmitted.');
      return {message:'Your updated Vehicle Owner application has been resubmitted for administrator review.',application:data,resubmitted:true};
    }
    const {data,error}=await db.from('vehicle_owner_applications')
      .insert({user_id:r.user.id,...payload}).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Owner application could not be submitted.');
    return {message:'Vehicle Owner application submitted for administrator review.',application:data,resubmitted:false};
  }
}