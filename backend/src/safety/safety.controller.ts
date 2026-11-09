import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreateSafetyTripDto, LocationUpdateDto, SafetySettingsDto, ShareTripDto, SosDto } from './safety.dto';
import { SafetyService } from './safety.service';

type AuthenticatedRequest = Request & { user: { id: number } };

@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('settings')
  @UseGuards(AuthGuard)
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.safety.getSettings(request.user.id);
  }

  @Put('settings')
  @UseGuards(AuthGuard)
  saveSettings(@Req() request: AuthenticatedRequest, @Body() dto: SafetySettingsDto) {
    return this.safety.saveSettings(request.user.id, dto);
  }

  @Get('drivers/verified')
  @UseGuards(AuthGuard)
  getVerifiedDrivers() {
    return this.safety.getVerifiedDrivers();
  }

  @Post('trips')
  @UseGuards(AuthGuard)
  startTrip(@Req() request: AuthenticatedRequest, @Body() dto: CreateSafetyTripDto) {
    return this.safety.startTrip(request.user.id, dto);
  }

  @Get('trips/active')
  @UseGuards(AuthGuard)
  getActiveTrips(@Req() request: AuthenticatedRequest) {
    return this.safety.getActiveTrips(request.user.id);
  }

  @Post('trips/:tripId/share')
  @UseGuards(AuthGuard)
  shareTrip(@Req() request: AuthenticatedRequest, @Param('tripId') tripId: string, @Body() dto: ShareTripDto) {
    return this.safety.shareTrip(request.user.id, tripId, dto.contactIds);
  }

  @Post('trips/:tripId/location')
  @UseGuards(AuthGuard)
  updateLocation(@Req() request: AuthenticatedRequest, @Param('tripId') tripId: string, @Body() dto: LocationUpdateDto) {
    return this.safety.updateLocation(request.user.id, tripId, dto);
  }

  @Post('trips/:tripId/complete')
  @UseGuards(AuthGuard)
  completeTrip(@Req() request: AuthenticatedRequest, @Param('tripId') tripId: string) {
    return this.safety.completeTrip(request.user.id, tripId);
  }

  @Post('sos')
  @UseGuards(AuthGuard)
  createSos(@Req() request: AuthenticatedRequest, @Body() dto: SosDto) {
    return this.safety.createSos(request.user.id, dto);
  }

  @Get('alerts')
  @UseGuards(AuthGuard)
  getAlerts(@Req() request: AuthenticatedRequest) {
    return this.safety.getAlerts(request.user.id);
  }

  @Get('shared/:token')
  getSharedTrip(@Param('token') token: string) {
    return this.safety.getSharedTrip(token);
  }
}
