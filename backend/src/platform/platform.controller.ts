import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';
import { PlatformService } from './platform.service';

type AuthenticatedRequest = Request & {
  user: { id: string; role: string; token: string; isVerified: boolean };
};

@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @UseGuards(AuthGuard)
  @Get('vehicles/mine')
  myVehicles(@Req() request: AuthenticatedRequest) { return this.service.myVehicles(request.user); }

  @Get('vehicles')
  vehicles(@Query() query: any) { return this.service.vehicles(query); }

  @Get('tourist/places')
  places(@Query('city') city?: string) { return this.service.places(city); }

  @Post('fare/estimate')
  fare(@Body() body: any) { return this.service.fare(body); }

  @Post('routes/optimize')
  route(@Body() body: any) { return this.service.route(body); }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) { return this.service.me(request.user); }

  @UseGuards(AuthGuard)
  @Patch('me')
  updateMe(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.updateMe(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('vehicles')
  addVehicle(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.addVehicle(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('rides')
  createRide(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.createRide(request.user, body); }

  @UseGuards(AuthGuard)
  @Get('rides')
  rides(@Req() request: AuthenticatedRequest) { return this.service.rides(request.user); }

  @UseGuards(AuthGuard)
  @Get('rides/open')
  openRequests(@Req() request: AuthenticatedRequest) { return this.service.openRequests(request.user); }

  @UseGuards(AuthGuard)
  @Get('rides/open-shared')
  openShared(@Req() request: AuthenticatedRequest) { return this.service.openShared(request.user); }

  @UseGuards(AuthGuard)
  @Get('rides/shared')
  sharedRides(@Req() request: AuthenticatedRequest) { return this.service.sharedRides(request.user); }

  @UseGuards(AuthGuard)
  @Get('rides/shared/me')
  mySharedRides(@Req() request: AuthenticatedRequest) { return this.service.mySharedRides(request.user); }

  @UseGuards(AuthGuard)
  @Post('rides/:id/join-shared')
  joinSharedRide(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.joinSharedRide(request.user, id); }

  @UseGuards(AuthGuard)
  @Post('rides/:id/leave-shared')
  leaveSharedRide(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.leaveSharedRide(request.user, id); }

  @UseGuards(AuthGuard)
  @Post('rides/:id/accept')
  accept(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.acceptRide(request.user, id); }

  @UseGuards(AuthGuard)
  @Patch('rides/:id/status')
  status(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.rideStatus(request.user, id, body); }

  @UseGuards(AuthGuard)
  @Get('rides/:id/locations')
  rideLocations(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.rideLocations(request.user, id); }

  @UseGuards(AuthGuard)
  @Post('rides/:id/location')
  location(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.location(request.user, id, body); }

  @UseGuards(AuthGuard)
  @Post('rentals')
  rental(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.rental(request.user, body); }

  @UseGuards(AuthGuard)
  @Patch('rentals/:id/status')
  updateRentalStatus(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.updateRentalStatus(request.user, id, body); }

  @UseGuards(AuthGuard)
  @Get('rentals')
  rentals(@Req() request: AuthenticatedRequest) { return this.service.rentals(request.user); }

  @UseGuards(AuthGuard)
  @Get('safety/preferences')
  safetyPreferences(@Req() request: AuthenticatedRequest) { return this.service.safetyPreferences(request.user); }

  @UseGuards(AuthGuard)
  @Patch('safety/preferences')
  saveSafetyPreferences(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.saveSafetyPreferences(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('safety/check-trip')
  checkTrip(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.checkTrip(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('safety/contacts')
  addContact(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.addContact(request.user, body); }

  @UseGuards(AuthGuard)
  @Get('safety/contacts')
  contacts(@Req() request: AuthenticatedRequest) { return this.service.contacts(request.user); }

  @UseGuards(AuthGuard)
  @Post('safety/sos')
  sos(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.sos(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('tourist/plans')
  plan(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.plan(request.user, body); }

  @Get('payments/rates')
  currencyRates(@Query('base') base?: string) { return this.service.currencyRates(base); }

  @Post('payments/convert')
  convertCurrency(@Body() body: any) { return this.service.convertCurrency(body); }

  @UseGuards(AuthGuard)
  @Post('payments/quote')
  quote(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.quote(request.user, body); }

  @UseGuards(AuthGuard)
  @Post('applications/driver')
  submitDriverApplication(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.submitDriverApplication(request.user, body); }

  @UseGuards(AuthGuard)
  @Get('applications/driver/me')
  myDriverApplication(@Req() request: AuthenticatedRequest) { return this.service.myDriverApplication(request.user); }

  @UseGuards(AuthGuard)
  @Post('applications/vehicle-owner')
  submitOwnerApplication(@Req() request: AuthenticatedRequest, @Body() body: any) { return this.service.submitOwnerApplication(request.user, body); }

  @UseGuards(AuthGuard)
  @Get('applications/vehicle-owner/me')
  myOwnerApplication(@Req() request: AuthenticatedRequest) { return this.service.myOwnerApplication(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/overview')
  adminOverview(@Req() request: AuthenticatedRequest) { return this.service.adminOverview(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/users')
  adminUsers(@Req() request: AuthenticatedRequest) { return this.service.adminUsers(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/users/:id/active')
  adminSetUserActive(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.adminSetUserActive(request.user, id, body.is_active); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/driver-applications')
  adminDriverApplications(@Req() request: AuthenticatedRequest) { return this.service.adminDriverApplications(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/driver-applications/:id')
  adminReviewDriver(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.adminReviewDriver(request.user, id, body); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/owner-applications')
  adminOwnerApplications(@Req() request: AuthenticatedRequest) { return this.service.adminOwnerApplications(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/owner-applications/:id')
  adminReviewOwner(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.adminReviewOwner(request.user, id, body); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/vehicles')
  adminVehicles(@Req() request: AuthenticatedRequest) { return this.service.adminVehicles(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/vehicles/:id/verification')
  adminVerifyVehicle(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { return this.service.adminVerifyVehicle(request.user, id, body.verified); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/rides')
  adminRides(@Req() request: AuthenticatedRequest) { return this.service.adminRides(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/safety-alerts')
  adminSafetyAlerts(@Req() request: AuthenticatedRequest) { return this.service.adminSafetyAlerts(request.user); }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/safety-alerts/:id/resolve')
  adminResolveSafetyAlert(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.adminResolveSafetyAlert(request.user, id); }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin/payments')
  adminPayments(@Req() request: AuthenticatedRequest) { return this.service.adminPayments(request.user); }
}
