import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsUUID() rideId!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
export class CreateSupportCaseDto {
  @IsIn(['safety','payment','driver','rental','account','app','other']) category!: string;
  @IsString() @Min(3) @MaxLength(120) subject!: string;
  @IsString() @Min(10) @MaxLength(3000) description!: string;
  @IsOptional() @IsUUID() rideId?: string;
  @IsOptional() @IsUUID() rentalBookingId?: string;
}
export class UpdateSupportCaseDto {
  @IsIn(['open','in_review','resolved','rejected']) status!: string;
  @IsOptional() @IsIn(['low','normal','high','urgent']) priority?: string;
  @IsOptional() @IsString() @MaxLength(2000) adminNote?: string;
}
export class UpdateFareRuleDto {
  @IsOptional() @Min(0) base_fare?: number;
  @IsOptional() @Min(0) per_km?: number;
  @IsOptional() @Min(0) per_minute?: number;
  @IsOptional() @Min(1) @Max(3) peak_hour_multiplier?: number;
  @IsOptional() @Min(1) @Max(3) demand_multiplier_cap?: number;
  @IsOptional() is_active?: boolean;
}
