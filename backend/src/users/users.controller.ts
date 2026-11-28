import { Body,Controller,Get,Patch,Req,UseGuards,Inject,UnauthorizedException,BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
type AuthRequest=Request&{user:{id:string;email?:string;accessToken:string}};
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(DatabaseService) private db:DatabaseService){}
  @Get('me')
  async getProfile(@Req()r:AuthRequest){
    const {data,error}=await this.db.userClient(r.user.accessToken).from('profiles')
      .select('id,full_name,phone,avatar_path,role,is_verified,is_active,preferred_language,preferred_currency,created_at,updated_at')
      .eq('id',r.user.id).single();
    if(error||!data)throw new UnauthorizedException('Profile not found.');
    return {...data,name:data.full_name,email:r.user.email??null};
  }
  @Patch('me')
  async updateProfile(@Req()r:AuthRequest,@Body()d:UpdateProfileDto){
    const changes:any={};
    if(d.name!==undefined)changes.full_name=d.name.trim();
    if(d.phone!==undefined)changes.phone=d.phone.trim()||null;
    if(d.preferred_language!==undefined)changes.preferred_language=d.preferred_language;
    if(d.preferred_currency!==undefined)changes.preferred_currency=d.preferred_currency;
    if(!Object.keys(changes).length)throw new BadRequestException('No profile fields provided.');
    changes.updated_at=new Date().toISOString();
    const {data,error}=await this.db.userClient(r.user.accessToken).from('profiles')
      .update(changes).eq('id',r.user.id)
      .select('id,full_name,phone,avatar_path,role,is_verified,is_active,preferred_language,preferred_currency')
      .single();
    if(error||!data)throw new BadRequestException(error?.message||'Profile update failed.');
    return {message:'Profile updated.',user:{...data,name:data.full_name,email:r.user.email??null}};
  }
}
