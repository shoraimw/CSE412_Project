import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

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
export class PhoneOtpDto {
  @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone!: string;
}
export class VerifyPhoneOtpDto extends PhoneOtpDto {
  @IsString() @Length(6, 6) token!: string;
}
export class UpdatePasswordDto {
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}

export class OAuthSessionDto {
  @IsString() @MinLength(20) @MaxLength(4096) accessToken!: string;
  @IsString() @MinLength(20) @MaxLength(4096) refreshToken!: string;
}
