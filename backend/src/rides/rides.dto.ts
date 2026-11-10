import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRideDto {
  @IsString() @MaxLength(160) pickupAddress!: string;
  @IsString() @MaxLength(160) destinationAddress!: string;
  @IsIn(['car','bike','cng']) vehicleType!: 'car'|'bike'|'cng';
  @IsOptional() @IsBoolean() isShared?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) pickupLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) pickupLng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) destinationLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) destinationLng?: number;
}
export class RideLocationDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng!: number;
}
export class RideStatusDto { @IsIn(['accepted','ongoing','completed','cancelled']) status!: string; }
