import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { VerificationService } from './verification.service';
import { VerificationUploadUrlDto, RegisterVerificationDocumentDto, ReviewVerificationDocumentDto } from './verification.dto';

type AuthRequest=Request&{user:{id:string;role:string;accessToken:string}};
@Controller('verification')
@UseGuards(AuthGuard)
export class VerificationController {
  constructor(@Inject(VerificationService) private readonly service:VerificationService) {}
  @Post('upload-url') createUploadUrl(@Req()r:AuthRequest,@Body()dto:VerificationUploadUrlDto) {
    return this.service.createUploadUrl(r.user.id,r.user.accessToken,r.user.role,dto);
  }
  @Post('documents') registerDocument(@Req()r:AuthRequest,@Body()dto:RegisterVerificationDocumentDto) {
    return this.service.registerDocument(r.user.id,r.user.accessToken,r.user.role,dto);
  }
  @Get('documents') listMine(@Req()r:AuthRequest) {
    return this.service.listMine(r.user.id,r.user.accessToken);
  }
}
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminVerificationController {
  constructor(@Inject(VerificationService) private readonly service:VerificationService) {}
  private assertAdmin(r:AuthRequest){if(r.user.role!=='admin')throw new ForbiddenException('Administrator access required.');}
  @Get('driver-documents') listDriverDocuments(@Req()r:AuthRequest){this.assertAdmin(r);return this.service.listForAdmin(r.user.accessToken,'driver');}
  @Get('owner-documents') listOwnerDocuments(@Req()r:AuthRequest){this.assertAdmin(r);return this.service.listForAdmin(r.user.accessToken,'owner');}
  @Patch('driver-documents/:id') reviewDriverDocument(@Req()r:AuthRequest,@Param('id')id:string,@Body()dto:ReviewVerificationDocumentDto){
    this.assertAdmin(r);return this.service.review(r.user.accessToken,'driver',id,dto,r.user.id);
  }
  @Patch('owner-documents/:id') reviewOwnerDocument(@Req()r:AuthRequest,@Param('id')id:string,@Body()dto:ReviewVerificationDocumentDto){
    this.assertAdmin(r);return this.service.review(r.user.accessToken,'owner',id,dto,r.user.id);
  }
}
