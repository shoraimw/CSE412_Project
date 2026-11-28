import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength
} from 'class-validator';

export class TouristPlaceAdminDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  category?: string;

  @IsOptional() @IsString() @MaxLength(2400)
  description?: string;

  @IsOptional() @IsString() @MaxLength(240)
  address?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  longitude?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(60, { each: true })
  tags?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(100, { each: true })
  nearbyFacilities?: string[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(24)
  estimatedVisitHours?: number;

  @IsOptional() @IsString() @MaxLength(1200)
  imageUrl?: string;

  @IsOptional() @IsString() @MaxLength(240)
  imageAlt?: string;

  @IsOptional() @IsString() @MaxLength(240)
  imageCredit?: string;

  @IsOptional() @IsString() @MaxLength(1200)
  imageSourceUrl?: string;
}
