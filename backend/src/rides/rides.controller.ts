import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreateRideDto, RideLocationDto, RideStatusDto } from './rides.dto';
import { RidesService } from './rides.service';
type AuthReq=Request&{user:{id:number}};
@Controller('rides') @UseGuards(AuthGuard)
export class RidesController{
 constructor(private readonly rides:RidesService){}
 @Get() list(@Req() req:AuthReq){return this.rides.list(req.user.id);}
 @Post() create(@Req() req:AuthReq,@Body() dto:CreateRideDto){return this.rides.create(req.user.id,dto);}
 @Get('shared/open') openShared(){return this.rides.openShared();}
 @Post(':id/match') match(@Req() req:AuthReq,@Param('id') id:string){return this.rides.match(req.user.id,id);}
 @Post(':id/share') share(@Req() req:AuthReq,@Param('id') id:string){return this.rides.joinShared(req.user.id,id);}
 @Get(':id') get(@Req() req:AuthReq,@Param('id') id:string){return this.rides.get(req.user.id,id);}
 @Patch(':id/status') status(@Req() req:AuthReq,@Param('id') id:string,@Body() dto:RideStatusDto){return this.rides.updateStatus(req.user.id,id,dto.status);}
 @Post(':id/location') location(@Req() req:AuthReq,@Param('id') id:string,@Body() dto:RideLocationDto){return this.rides.updateLocation(req.user.id,id,dto);}
 @Get(':id/track') track(@Req() req:AuthReq,@Param('id') id:string){return this.rides.tracking(req.user.id,id);}
}