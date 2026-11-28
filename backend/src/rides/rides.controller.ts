import { Body,Controller,Get,Param,Patch,Post,Req,UseGuards, Inject } from '@nestjs/common';import {Request} from 'express';import {AuthGuard} from '../auth/auth.guard';import {CreateRideDto,RideLocationDto,RideStatusDto,RideMessageDto,RideCancellationDto,RideCancellationResponseDto} from './rides.dto';import {RidesService} from './rides.service';
type AuthReq=Request&{user:{id:string;accessToken:string;role:'passenger'|'driver'|'vehicle_owner'|'admin'}};
@Controller('rides')@UseGuards(AuthGuard)export class RidesController{constructor(@Inject(RidesService) private readonly rides:RidesService){}
@Get()list(@Req()r:AuthReq){return this.rides.list(r.user.id,r.user.accessToken,r.user.role);}
@Get('my-bookings')myBookings(@Req()r:AuthReq){return this.rides.myBookings(r.user.id,r.user.accessToken,r.user.role);}
@Get('open-requests')open(@Req()r:AuthReq){return this.rides.openRequests(r.user.id,r.user.accessToken,r.user.role);}
@Get('cancellation-requests')cancellationRequests(@Req()r:AuthReq){return this.rides.cancellationRequests(r.user.id,r.user.accessToken,r.user.role);}
@Post('cancellation-requests/:id/respond')respondCancellation(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideCancellationResponseDto){return this.rides.respondCancellation(r.user.id,r.user.accessToken,id,r.user.role,d.approve,d.note);}
@Get('shared')shared(@Req()r:AuthReq){return this.rides.openShared(r.user.accessToken,r.user.role);}
@Post()create(@Req()r:AuthReq,@Body()d:CreateRideDto){return this.rides.create(r.user.id,r.user.accessToken,d);}
@Post('requests/:id/cancel')cancel(@Req()r:AuthReq,@Param('id')id:string){return this.rides.cancelRequest(r.user.id,r.user.accessToken,id,r.user.role);}
@Post('requests/:id/claim')claim(@Req()r:AuthReq,@Param('id')id:string){return this.rides.claimRequest(r.user.id,r.user.accessToken,r.user.role,id);}
@Post('requests/:id/reject')reject(@Req()r:AuthReq,@Param('id')id:string){return this.rides.rejectRequest(r.user.id,r.user.accessToken,r.user.role,id);}
@Post(':id/share')share(@Req()r:AuthReq,@Param('id')id:string){return this.rides.joinShared(r.user.id,r.user.accessToken,id,r.user.role);}
@Get(':id/messages')messages(@Req()r:AuthReq,@Param('id')id:string){return this.rides.messages(r.user.id,r.user.accessToken,id);}
@Post(':id/messages')sendMessage(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideMessageDto){return this.rides.sendMessage(r.user.id,r.user.accessToken,id,d.body);}
@Post(':id/cancellation-request')requestCancellation(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideCancellationDto){return this.rides.requestCancellation(r.user.id,r.user.accessToken,id,r.user.role,d.reason,d.emergency,d.location);}
@Post(':id/cancel')driverCancel(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideCancellationDto){return this.rides.driverCancelRide(r.user.id,r.user.accessToken,id,r.user.role,d.reason);}
@Get(':id')get(@Req()r:AuthReq,@Param('id')id:string){return this.rides.get(r.user.id,r.user.accessToken,id);}
@Patch(':id/status')status(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideStatusDto){return this.rides.updateStatus(r.user.id,r.user.accessToken,id,d.status,r.user.role);}
@Post(':id/finalize-fare')finalizeFare(@Req()r:AuthReq,@Param('id')id:string){return this.rides.finalizeFare(r.user.id,r.user.accessToken,id,r.user.role);}
@Post(':id/location')location(@Req()r:AuthReq,@Param('id')id:string,@Body()d:RideLocationDto){return this.rides.updateLocation(r.user.id,r.user.accessToken,id,d);}
@Get(':id/track')track(@Req()r:AuthReq,@Param('id')id:string){return this.rides.tracking(r.user.id,r.user.accessToken,id);}
}