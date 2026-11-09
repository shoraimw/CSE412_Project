import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTouristPlanDto } from './tourist.dto';
import { TouristService } from './tourist.service';

type AuthenticatedRequest = Request & { user: { id: number } };

@Controller('tourist')
export class TouristController {
  constructor(private readonly tourist: TouristService) {}

  @Get('places')
  getPlaces(@Query('city') city?: string, @Query('category') category?: string, @Query('q') search?: string) {
    return this.tourist.getPlaces(city, category, search);
  }

  @Get('recommendations')
  getRecommendations(@Query('city') city = 'Dhaka', @Query('interests') interests = '') {
    return this.tourist.getRecommendations(city, interests);
  }

  @Post('plans')
  @UseGuards(AuthGuard)
  createPlan(@Req() request: AuthenticatedRequest, @Body() dto: CreateTouristPlanDto) {
    return this.tourist.createPlan(request.user.id, dto);
  }

  @Get('plans')
  @UseGuards(AuthGuard)
  getPlans(@Req() request: AuthenticatedRequest) {
    return this.tourist.getPlans(request.user.id);
  }
}
