import { Body,Controller,Get,Post,Param,Req,UseGuards, Inject } from '@nestjs/common';import {Request} from 'express';import {AuthGuard} from '../auth/auth.guard';import {CreatePaymentIntentDto,CreatePaymentQuoteDto,SubmitPaymentReferenceDto} from './payments.dto';import {PaymentsService} from './payments.service';type AR=Request&{user:{id:string;accessToken:string}};
@Controller('payments')export class PaymentsController{constructor(@Inject(PaymentsService) private readonly payments:PaymentsService){}
@Get('currencies')currencies(){return {currencies:this.payments.supportedCurrencies(),baseCurrency:'BDT'};}
@Get('rates')rates(){return this.payments.getRates();}
@Post('quote')quote(@Body()d:CreatePaymentQuoteDto){return this.payments.createQuote(d.amountBDT,d.currency,d.rideId);}
@Post('intent')@UseGuards(AuthGuard)intent(@Req()r:AR,@Body()d:CreatePaymentIntentDto){return this.payments.createIntent(r.user.id,r.user.accessToken,d);}
@Post(':id/reference')@UseGuards(AuthGuard)submitReference(@Req()r:AR,@Param('id')id:string,@Body()d:SubmitPaymentReferenceDto){return this.payments.submitReference(r.user.id,r.user.accessToken,id,d.reference);}
@Get('me')@UseGuards(AuthGuard)history(@Req()r:AR){return this.payments.history(r.user.id,r.user.accessToken);}
}