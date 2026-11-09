import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude,
  IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength,
  Min, ValidateNested
} from 'class-validator';

export class SafetyContactDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(80) name!: string;
  @IsString() @Matches(/^\+?[0-9][0-9\s-]{6,18}$/) phone!: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
}

export class SafetySettingsDto {
  @IsOptional() @IsBoolean() womenSafetyEnabled?: boolean;
  @IsOptional() @IsBoolean() preferVerifiedDrivers?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SafetyContactDto)
  trustedContacts?: SafetyContactDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SafetyContactDto)
  emergencyContacts?: SafetyContactDto[];
}

export class GeoPointDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) @IsLatitude() lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) @IsLongitude() lng!: number;
}

export class CreateSafetyTripDto {
  @IsString() @MaxLength(120) destination!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) estimatedDurationMinutes!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => GeoPointDto)
  plannedRoute?: GeoPointDto[];
  @IsOptional() @ValidateNested() @Type(() => GeoPointDto)
  initialLocation?: GeoPointDto;
}

export class ShareTripDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true })
  contactIds!: string[];
}

export class LocationUpdateDto extends GeoPointDto {}

export class SosDto {
  @IsOptional() @IsString() @MaxLength(300) message?: string;
  @IsOptional() @IsString() tripId?: string;
  @IsOptional() @ValidateNested() @Type(() => GeoPointDto) location?: GeoPointDto;
}
