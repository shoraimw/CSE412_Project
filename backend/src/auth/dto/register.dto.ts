import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

// Public registration always creates a Passenger account. Driver and Vehicle Owner
// privileges must only be granted after a separate verification/admin workflow.
export class RegisterDto {
  @IsString() @MaxLength(80) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
