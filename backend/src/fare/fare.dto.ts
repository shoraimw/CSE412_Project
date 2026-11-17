import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const VEHICLE_RATES = {
  bike: { base: 30, perKm: 12, speedKmh: 25 },
  cng: { base: 40, perKm: 18, speedKmh: 20 },
  car: { base: 60, perKm: 25, speedKmh: 20 },
} as const;

export class EstimateFareDto {
  @Type(() => Number) @IsNumber() @Min(0.1) distanceKm!: number;
  @IsIn(['bike', 'cng', 'car']) vehicleType!: keyof typeof VEHICLE_RATES;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) durationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) staticDurationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) trafficRatio?: number;
  @IsOptional() @IsBoolean() trafficDataAvailable?: boolean;

}
