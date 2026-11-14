import {BadRequestException,Body,Controller,ForbiddenException,Get,Post,Req,UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '../auth/auth.guard';
import {DatabaseService} from '../database/database.service';
import {OwnerApplicationDto} from './owner.dto';
type AR=Request&{user:{id:string;accessToken:string;role:string}};
@Controller('owners') @UseGuards(AuthGuard)
export class OwnersController {
  constructor(private readonly db:DatabaseService){}
  @Get('application') async getApplication(@Req()r:AR){
    const {data,error}=await this.db.userClient(r.user.accessToken).from('vehicle_owner_applications').select('*').eq('user_id',r.user.id).maybeSingle();
    if(error)throw new BadRequestException(error.message);return data;
  }
  @Post('application') async apply(@Req()r:AR,@Body()d:OwnerApplicationDto){
    if(r.user.role!=='passenger')throw new ForbiddenException('Only passenger accounts can apply to become a vehicle owner.');
    const {data,error}=await this.db.userClient(r.user.accessToken).from('vehicle_owner_applications').insert({user_id:r.user.id,business_name:d.business_name.trim(),contact_phone:d.contact_phone.trim(),business_address:d.business_address.trim(),note:d.note?.trim()||null}).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Owner application could not be submitted.');return {message:'Vehicle owner application submitted for administrator review.',application:data};
  }
}