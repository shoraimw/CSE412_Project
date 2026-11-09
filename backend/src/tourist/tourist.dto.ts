import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTouristPlanDto {
  @IsString() @MaxLength(60) city!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true })
  placeIds!: string[];
  @IsOptional() @IsDateString() travelDate?: string;
  @IsOptional() @IsIn(['Car', 'Bike', 'Public Transport', 'Walking'])
  transportPreference?: 'Car' | 'Bike' | 'Public Transport' | 'Walking';
}
