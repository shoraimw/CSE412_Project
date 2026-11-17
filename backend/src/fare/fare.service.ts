import { BadRequestException, Injectable } from '@nestjs/common';
import { EstimateFareDto, VEHICLE_RATES } from './fare.dto';

@Injectable()
export class FareService {
  estimate(input: EstimateFareDto) {
    const rate = VEHICLE_RATES[input.vehicleType];
    if (!rate || !Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
      throw new BadRequestException('A positive route distance and supported vehicle type are required.');
    }

    const durationMinutes = Math.max(1, Math.round(input.durationMinutes || input.distanceKm / rate.speedKmh * 60));
    const staticDurationMinutes = Math.max(1, Math.round(input.staticDurationMinutes || durationMinutes));
    const trafficDataAvailable = input.trafficDataAvailable === true;
    const rawRatio = trafficDataAvailable ? Number(input.trafficRatio || 1) : 1;
    const trafficRatio = Math.max(1, Math.min(2.5, Number.isFinite(rawRatio) ? rawRatio : 1));
    const trafficMultiplier = trafficDataAvailable
      ? Math.min(1.35, 1 + Math.max(0, trafficRatio - 1) * 0.65)
      : 1;

    const distanceFare = input.distanceKm * rate.perKm;
    const subtotal = rate.base + distanceFare;
    const estimatedFare = Math.round(subtotal * trafficMultiplier);
    const trafficDelayMinutes = Math.max(0, durationMinutes - staticDurationMinutes);

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
        staticDurationMinutes,
        trafficDelayMinutes,
        trafficRatio: Number(trafficRatio.toFixed(2)),
      },
      breakdown: {
        baseFare: rate.base,
        distanceFare: Math.round(distanceFare),
        trafficMultiplier: Number(trafficMultiplier.toFixed(3)),
      },
      trafficStatus: trafficDataAvailable ? 'live' : 'unavailable',
      calculationMethod: trafficDataAvailable
        ? 'Google Maps live-traffic-aware route + transparent BDT fare formula.'
        : 'Automatic road-route estimate + transparent BDT fare formula; live traffic is unavailable until Google Routes API is configured.',
      disclaimer: 'This is an estimate. Final fare may differ due to waiting time, route changes and operational charges.',
    };
  }
}
