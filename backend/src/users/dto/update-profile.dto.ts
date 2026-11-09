import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsIn(['Passenger', 'Driver', 'Vehicle Owner']) role?: 'Passenger' | 'Driver' | 'Vehicle Owner';
}