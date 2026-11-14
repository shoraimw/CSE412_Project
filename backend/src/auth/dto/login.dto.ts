import { IsEmail, IsString, Length, MinLength, MaxLength } from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(72) password!: string;
}
export class EmailOtpDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class VerifyEmailOtpDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(6, 6) token!: string;
}