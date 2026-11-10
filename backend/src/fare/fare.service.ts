import { BadRequestException, Injectable } from '@nestjs/common';
import { PredictFareDto, VEHICLE_RATES } from './fare.dto';

@Injectable()
export class FareService {
  predict(input: PredictFareDto) {
    const rate = VEHICLE_RATES[input.vehicleType];
    if (!rate || !Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
      throw new BadRequestException('A positive distance and supported vehicle type are required.');
    }
    const traffic = { light: 1, moderate: 1.2, heavy: 1.5 }[input.traffic || 'moderate'];
    const demand = { low: 1, medium: 1.2, high: 1.5 }[input.demand || 'medium'];
    const time = { offPeak: 1, peak: 1.3 }[input.time || 'offPeak'];
    const distanceFare = input.distanceKm * rate.perKm;
    const subtotal = (rate.base + distanceFare) * traffic * demand * time;
    const estimatedFare = Math.round(subtotal);
    return {
      currency: 'BDT',
      estimatedFare,
      predictedRange: { min: Math.round(estimatedFare * 0.9), max: Math.round(estimatedFare * 1.15) },
      breakdown: {
        baseFare: rate.base, distanceFare: Math.round(distanceFare),
        trafficMultiplier: traffic, demandMultiplier: demand, timeMultiplier: time,
      },
      predictionMethod: 'Rule-based estimate; not a trained machine-learning model.',
      disclaimer: 'Final fare may differ based on actual route, waiting time and operational charges.',
    };
  }
}