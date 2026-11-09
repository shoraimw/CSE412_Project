import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class TouristOriginDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng!: number;
}

export class CreateTouristPlanDto {
  @IsString() @MaxLength(60) city!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true })
  placeIds!: string[];
  @IsOptional() @IsDateString() travelDate?: string;
  @IsOptional() @IsIn(['Car', 'Bike', 'Public Transport', 'Walking'])
  transportPreference?: 'Car' | 'Bike' | 'Public Transport' | 'Walking';
  @IsOptional() @ValidateNested() @Type(() => TouristOriginDto)
  origin?: TouristOriginDto;
}
