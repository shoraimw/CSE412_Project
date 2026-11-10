import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreatePaymentQuoteDto } from './payments.dto';
import { PaymentsService } from './payments.service';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get('currencies') currencies() { return { currencies: this.payments.supportedCurrencies(), baseCurrency: 'BDT' }; }
  @Get('rates') rates() { return this.payments.getRates(); }
  @Post('quote') quote(@Body() body: CreatePaymentQuoteDto) { return this.payments.createQuote(body.amountBDT, body.currency, body.rideId); }
}