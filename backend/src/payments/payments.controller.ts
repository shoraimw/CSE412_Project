import { Body, Controller, Get, Post, Param, Req, UseGuards, Inject, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreatePaymentIntentDto,CreatePaymentQuoteDto,SubmitPaymentReferenceDto } from './payments.dto';
import { PaymentsService } from './payments.service';

type AuthRequest=Request&{user:{id:string;email?:string;accessToken:string}};
@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments:PaymentsService){}
  @Get('currencies') currencies(){return {currencies:this.payments.supportedCurrencies(),baseCurrency:'BDT',gateway:'SSLCOMMERZ',gatewaySettlementCurrency:'BDT'};}
  @Get('rates') rates(){return this.payments.getRates();}
  @Post('quote') quote(@Body()d:CreatePaymentQuoteDto){return this.payments.createQuote(d.amountBDT,d.currency,d.rideId);}
  @Post('intent') @UseGuards(AuthGuard) intent(@Req()r:AuthRequest,@Body()d:CreatePaymentIntentDto){return this.payments.createIntent(r.user.id,r.user.accessToken,d,r.user.email);}
  @Post(':id/reference') @UseGuards(AuthGuard) submitReference(@Req()r:AuthRequest,@Param('id')id:string,@Body()d:SubmitPaymentReferenceDto){return this.payments.submitReference(r.user.id,r.user.accessToken,id,d.reference);}
  @Get('me') @UseGuards(AuthGuard) history(@Req()r:AuthRequest){return this.payments.history(r.user.id,r.user.accessToken);}
  @Get(':id/receipt') @UseGuards(AuthGuard) receipt(@Req()r:AuthRequest,@Param('id')id:string){return this.payments.receipt(r.user.id,r.user.accessToken,id);}
}
@Controller('payments/sslcommerz')
export class SslcommerzController {
  constructor(@Inject(PaymentsService) private readonly payments:PaymentsService){}
  private redirect(res:Response,result:any){
    const config=require('../config/runtime-config').getDriveRuntimeConfig();
    const status=result?.status==='paid'?'success':result?.status==='risk_hold'?'review':result?.status==='failed'?'failed':'pending';
    const query=new URLSearchParams({status,payment:String(result?.paymentId||'')});
    return res.redirect(302,config.appBaseUrl.replace(/\/+$/,'')+'/payment-result.html?'+query.toString());
  }
  @Post('ipn') async ipn(@Body()body:any){return this.payments.handleSslcommerzNotification(body);}
  @Post('success') async successPost(@Body()body:any,@Res()res:Response){const result=await this.payments.handleSslcommerzNotification(body);return this.redirect(res,result);}
  @Get('success') async successGet(@Req()r:Request,@Res()res:Response){const result=await this.payments.handleSslcommerzNotification(r.query);return this.redirect(res,result);}
  @Post('fail') async failPost(@Body()body:any,@Res()res:Response){const result=await this.payments.markSslcommerzFailed(body,'FAILED');return this.redirect(res,result);}
  @Get('fail') async failGet(@Req()r:Request,@Res()res:Response){const result=await this.payments.markSslcommerzFailed(r.query,'FAILED');return this.redirect(res,result);}
  @Post('cancel') async cancelPost(@Body()body:any,@Res()res:Response){const result=await this.payments.markSslcommerzFailed(body,'CANCELLED');return this.redirect(res,result);}
  @Get('cancel') async cancelGet(@Req()r:Request,@Res()res:Response){const result=await this.payments.markSslcommerzFailed(r.query,'CANCELLED');return this.redirect(res,result);}
}
