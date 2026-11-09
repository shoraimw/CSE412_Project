import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
export class RegisterDto {
  @IsString() @MaxLength(80) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsIn(['Passenger', 'Driver', 'Vehicle Owner']) role?: 'Passenger' | 'Driver' | 'Vehicle Owner';
}