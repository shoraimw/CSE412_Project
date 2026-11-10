import { Body, Controller, Post } from '@nestjs/common';
import { FareService } from './fare.service';
import { PredictFareDto } from './fare.dto';

@Controller('fare')
export class FareController {
  constructor(private readonly fare: FareService) {}
  @Post('predict') predict(@Body() body: PredictFareDto) { return this.fare.predict(body); }
}