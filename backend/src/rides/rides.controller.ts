import {Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '../auth/auth.guard';
import {CreateRideDto,RideLocationDto,RideStatusDto} from './rides.dto';
import {RidesService} from './rides.service';
type AuthReq=Request&{user:{id:string;accessToken:string}};
@Controller('rides')@UseGuards(AuthGuard)
export class RidesController{
 constructor(private readonly rides:RidesService){}
 @Get()list(@Req()r:AuthReq){return this.rides.list(r.user.id,r.user.accessToken);}
 @Get('shared/open')openShared(@Req()r:AuthReq){return this.rides.openShared(r.user.accessToken);}
 @Post()create(@Req()r:AuthReq,@Body()d:CreateRideDto){return this.rides.create(r.user.id,r.user.accessToken,d);}
 @Post(':id/match')match(@Req()r:AuthReq,@Param('id')id:string){return this.rides.match(r.user.id,r.user.accessToken,id);}
 @Post(':id/share')share(@Req()r:AuthReq,@Param('id')id:string){return this.rides.joinShared(r.user.id,r.user.accessToken,id);}
 @Get(':id')get(@Req()r:AuthReq,@Param('id')id:string){return this.rides.get(r.user.id,r.user.accessToken,id);}
 @Patch(':id/status')status(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideStatusDto){return this.rides.updateStatus(r.user.id,r.user.accessToken,id,d.status);}
 @Post(':id/location')location(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideLocationDto){return this.rides.updateLocation(r.user.id,r.user.accessToken,id,d);}
 @Get(':id/track')track(@Req()r:AuthReq,@Param('id')id:string){return this.rides.tracking(r.user.id,r.user.accessToken,id);}
}