import { Body,Controller,Get,Param,Post,Put,Req,UseGuards, Inject } from '@nestjs/common';import {Request} from 'express';import {AuthGuard} from '../auth/auth.guard';import {CreateSafetyTripDto,LocationUpdateDto,SafetySettingsDto,ShareTripDto,SosDto} from './safety.dto';import {SafetyService} from './safety.service';type AR=Request&{user:{id:string;accessToken:string}};
@Controller('safety')export class SafetyController{constructor(@Inject(SafetyService) private readonly safety:SafetyService){}
@Get('settings')@UseGuards(AuthGuard)getSettings(@Req()r:AR){return this.safety.getSettings(r.user.id,r.user.accessToken);}
@Put('settings')@UseGuards(AuthGuard)saveSettings(@Req()r:AR,@Body()d:SafetySettingsDto){return this.safety.saveSettings(r.user.id,r.user.accessToken,d);}
@Get('drivers/verified')@UseGuards(AuthGuard)getVerifiedDrivers(@Req()r:AR){return this.safety.getVerifiedDrivers(r.user.accessToken);}
@Post('trips')@UseGuards(AuthGuard)startTrip(@Req()r:AR,@Body()d:CreateSafetyTripDto){return this.safety.startTrip(r.user.id,r.user.accessToken,d);}
@Get('trips/active')@UseGuards(AuthGuard)getActiveTrips(@Req()r:AR){return this.safety.getActiveTrips(r.user.id,r.user.accessToken);}
@Post('trips/:tripId/share')@UseGuards(AuthGuard)shareTrip(@Req()r:AR,@Param('tripId')id:string,@Body()d:ShareTripDto){return this.safety.shareTrip(r.user.id,r.user.accessToken,id,d.contactIds);}
@Post('trips/:tripId/location')@UseGuards(AuthGuard)updateLocation(@Req()r:AR,@Param('tripId')id:string,@Body()d:LocationUpdateDto){return this.safety.updateLocation(r.user.id,r.user.accessToken,id,d);}
@Post('trips/:tripId/complete')@UseGuards(AuthGuard)completeTrip(@Req()r:AR,@Param('tripId')id:string){return this.safety.completeTrip(r.user.id,r.user.accessToken,id);}
@Post('sos')@UseGuards(AuthGuard)createSos(@Req()r:AR,@Body()d:SosDto){return this.safety.createSos(r.user.id,r.user.accessToken,d);}
@Get('alerts')@UseGuards(AuthGuard)getAlerts(@Req()r:AR){return this.safety.getAlerts(r.user.id,r.user.accessToken);}
@Get('shared/:token')getSharedTrip(@Param('token')token:string){return this.safety.getSharedTrip(token);}
}