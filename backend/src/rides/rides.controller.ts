import {Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';import {Request} from 'express';import {AuthGuard} from '../auth/auth.guard';import {CreateRideDto,RideLocationDto,RideStatusDto} from './rides.dto';import {RidesService} from './rides.service';
type AuthReq=Request&{user:{id:string;accessToken:string;role:'passenger'|'driver'|'vehicle_owner'|'admin'}};
@Controller('rides')@UseGuards(AuthGuard)export class RidesController{constructor(private readonly rides:RidesService){}
@Get()list(@Req()r:AuthReq){return this.rides.list(r.user.id,r.user.accessToken,r.user.role);}
@Get('open-requests')open(@Req()r:AuthReq){return this.rides.openRequests(r.user.accessToken,r.user.role);}
@Get('shared')shared(@Req()r:AuthReq){return this.rides.openShared(r.user.accessToken,r.user.role);}
@Post()create(@Req()r:AuthReq,@Body()d:CreateRideDto){return this.rides.create(r.user.id,r.user.accessToken,d);}
@Post('requests/:id/claim')claim(@Req()r:AuthReq,@Param('id')id:string){return this.rides.claimRequest(r.user.accessToken,r.user.role,id);}
@Post(':id/share')share(@Req()r:AuthReq,@Param('id')id:string){return this.rides.joinShared(r.user.id,r.user.accessToken,id,r.user.role);}
@Get(':id')get(@Req()r:AuthReq,@Param('id')id:string){return this.rides.get(r.user.id,r.user.accessToken,id);}
@Patch(':id/status')status(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideStatusDto){return this.rides.updateStatus(r.user.id,r.user.accessToken,id,d.status,r.user.role);}
@Post(':id/location')location(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideLocationDto){return this.rides.updateLocation(r.user.id,r.user.accessToken,id,d);}
@Get(':id/track')track(@Req()r:AuthReq,@Param('id')id:string){return this.rides.tracking(r.user.id,r.user.accessToken,id);}
}