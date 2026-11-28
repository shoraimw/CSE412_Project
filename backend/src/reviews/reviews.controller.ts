import { Body, Controller, Get, Param, Post, Req, UseGuards, Inject } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreateReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

type ReviewRequest = Request & { user: { id: string; accessToken: string } };

@Controller('reviews')
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Post()
  create(@Req() request: ReviewRequest, @Body() dto: CreateReviewDto) {
    return this.reviews.create(request.user.id, request.user.accessToken, dto);
  }

  @Get('me')
  mine(@Req() request: ReviewRequest) {
    return this.reviews.mine(request.user.id, request.user.accessToken);
  }

  @Get('driver/:driverId')
  driverSummary(@Req() request: ReviewRequest, @Param('driverId') driverId: string) {
    return this.reviews.driverSummary(driverId, request.user.accessToken);
  }
}
