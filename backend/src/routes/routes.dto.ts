import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class OptimizeRouteDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) pickupLat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) pickupLng!: number;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) destinationLat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) destinationLng!: number;
  @IsOptional() @IsIn(['fastest', 'shortest']) preference?: 'fastest' | 'shortest';
}