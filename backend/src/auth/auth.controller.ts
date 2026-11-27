import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, EmailOtpDto, VerifyEmailOtpDto, PhoneOtpDto, VerifyPhoneOtpDto, UpdatePasswordDto } from './dto/login.dto';

class RefreshDto { @IsString() @MinLength(20) refreshToken!: string; }
type AuthRequest = Request & { user: { id: string; accessToken: string } };

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('email-otp') sendEmailOtp(@Body() dto: EmailOtpDto) { return this.auth.sendEmailOtp(dto); }
  @Post('verify-email-otp') verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) { return this.auth.verifyEmailOtp(dto); }
  @Post('phone-otp') sendPhoneOtp(@Body() dto: PhoneOtpDto) { return this.auth.sendPhoneOtp(dto); }
  @Post('verify-phone-otp') verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) { return this.auth.verifyPhoneOtp(dto); }
  @Post('password-recovery') recoverPassword(@Body() dto: EmailOtpDto) { return this.auth.recoverPassword(dto); }
  @Post('password-update')
  @UseGuards(AuthGuard)
  updatePassword(@Req() request: AuthRequest, @Body() dto: UpdatePasswordDto) {
    return this.auth.updatePassword(request.user.accessToken, dto.password);
  }
  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthRequest, @Body() dto: RefreshDto) {
    return this.auth.logout(request.user.accessToken, dto.refreshToken);
  }
}
