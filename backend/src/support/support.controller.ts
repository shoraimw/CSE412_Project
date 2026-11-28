import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { SupportService } from './support.service';
import { CreateReviewDto, CreateSupportCaseDto, UpdateSupportCaseDto, UpdateFareRuleDto } from './support.dto';

type AuthRequest=Request&{user:{id:string;role:string;accessToken:string}};
@Controller('reviews')
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(@Inject(SupportService) private readonly service:SupportService){}
  @Post() create(@Req()r:AuthRequest,@Body()dto:CreateReviewDto){return this.service.createReview(r.user.id,r.user.accessToken,dto);}
  @Get('me') mine(@Req()r:AuthRequest){return this.service.myReviews(r.user.id,r.user.accessToken);}
}
@Controller('support')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(@Inject(SupportService) private readonly service:SupportService){}
  @Post('cases') create(@Req()r:AuthRequest,@Body()dto:CreateSupportCaseDto){return this.service.createCase(r.user.id,r.user.accessToken,dto);}
  @Get('cases') mine(@Req()r:AuthRequest){return this.service.myCases(r.user.id,r.user.accessToken);}
}
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminSupportController {
  constructor(@Inject(SupportService) private readonly service:SupportService){}
  private assertAdmin(r:AuthRequest){if(r.user.role!=='admin')throw new ForbiddenException('Administrator access required.');}
  @Get('support-cases') cases(@Req()r:AuthRequest){this.assertAdmin(r);return this.service.adminCases(r.user.accessToken);}
  @Patch('support-cases/:id') updateCase(@Req()r:AuthRequest,@Param('id')id:string,@Body()dto:UpdateSupportCaseDto){
    this.assertAdmin(r);return this.service.updateCase(r.user.accessToken,r.user.id,id,dto);
  }
  @Get('reviews') reviews(@Req()r:AuthRequest){this.assertAdmin(r);return this.service.adminReviews(r.user.accessToken);}
  @Get('fare-rules') fareRules(@Req()r:AuthRequest){this.assertAdmin(r);return this.service.fareRules(r.user.accessToken);}
  @Patch('fare-rules/:vehicleType') updateFareRule(@Req()r:AuthRequest,@Param('vehicleType')type:string,@Body()dto:UpdateFareRuleDto){
    this.assertAdmin(r);return this.service.updateFareRule(r.user.accessToken,r.user.id,type,dto);
  }
}
