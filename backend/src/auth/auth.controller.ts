import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, EmailOtpDto, VerifyEmailOtpDto } from './dto/login.dto';

class RefreshDto { @IsString() @MinLength(20) refreshToken!: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('email-otp') sendEmailOtp(@Body() dto: EmailOtpDto) { return this.auth.sendEmailOtp(dto); }
  @Post('verify-email-otp') verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) { return this.auth.verifyEmailOtp(dto); }
  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post('logout') logout() { return { message: 'Clear the local session. The refresh token is rotated and expires according to Supabase Auth policy.' }; }
}