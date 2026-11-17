import { BadRequestException, Injectable } from '@nestjs/common';
import { EstimateFareDto, VEHICLE_RATES } from './fare.dto';

@Injectable()
export class FareService {
  estimate(input: EstimateFareDto) {
    const rate = VEHICLE_RATES[input.vehicleType];
    if (!rate || !Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
      throw new BadRequestException('A positive route distance and supported vehicle type are required.');
    }

    const durationMinutes = Math.max(
      1,
      Math.round(input.durationMinutes || input.distanceKm / rate.speedKmh * 60),
    );
    const distanceFare = input.distanceKm * rate.perKm;
    const estimatedFare = Math.round(rate.base + distanceFare);

    return {
      currency: 'BDT',
      estimatedFare,
      estimatedRange: {
        min: Math.round(estimatedFare * 0.95),
        max: Math.round(estimatedFare * 1.1),
      },
      route: {
        distanceKm: Number(input.distanceKm.toFixed(2)),
        durationMinutes,
      },
      breakdown: {
        baseFare: rate.base,
        distanceFare: Math.round(distanceFare),
      },
      trafficStatus: 'unavailable',
      calculationMethod: 'OpenStreetMap OSRM standard road route + transparent BDT fare formula. Live traffic is not included.',
      disclaimer: 'This is an estimate. Final fare may differ due to waiting time, route changes and operational charges.',
    };
  }
}
