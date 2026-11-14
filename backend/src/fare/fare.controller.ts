import { Body, Controller, Post, Inject } from '@nestjs/common';
import { FareService } from './fare.service';
import { PredictFareDto } from './fare.dto';

@Controller('fare')
export class FareController {
  constructor(@Inject(FareService) private readonly fare: FareService) {}
  @Post('predict') predict(@Body() body: PredictFareDto) { return this.fare.predict(body); }
}