import { Body, Controller, Post, Inject } from '@nestjs/common';
import { FareService } from './fare.service';
import { EstimateFareDto } from './fare.dto';

@Controller('fare')
export class FareController {
  constructor(@Inject(FareService) private readonly fare: FareService) {}
  @Post('estimate') estimate(@Body() body: EstimateFareDto) { return this.fare.estimate(body); }
}