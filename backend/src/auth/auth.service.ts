import { BadRequestException, Inject, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { getDriveRuntimeConfig } from '../config/runtime-config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, EmailOtpDto, VerifyEmailOtpDto, PhoneOtpDto, VerifyPhoneOtpDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async register(dto: RegisterDto) {
    const { data, error } = await this.db.publicClient().auth.signUp({
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      options: { data: { full_name: dto.name.trim(), phone: dto.phone?.trim() || null } },
    });
    if (error) throw new BadRequestException(error.message);
    let profile: any = null;
    if (data.session && data.user) {
      const { data: p } = await this.db.userClient(data.session.access_token)
        .from('profiles').select('id,full_name,phone,avatar_path,role,is_verified,is_active,preferred_language,preferred_currency')
        .eq('id', data.user.id).maybeSingle();
      profile = p;
    }
    return {
      message: data.session ? 'Account created successfully.' : 'Account created. Confirm your email before logging in.',
      accessToken: data.session?.access_token ?? null,
      refreshToken: data.session?.refresh_token ?? null,
      expiresIn: data.session?.expires_in ?? null,
      user: data.user ? { ...(profile || { id: data.user.id, full_name: dto.name, role: 'passenger' }), email: data.user.email } : null,
      requiresEmailConfirmation: !data.session,
    };
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.db.publicClient().auth.signInWithPassword({
      email: dto.email.trim().toLowerCase(), password: dto.password,
    });
    if (error || !data.session) throw new UnauthorizedException('Incorrect credentials or email not confirmed.');
    return this.sessionPayload(data.session, data.user);
  }

  async sendEmailOtp(dto: EmailOtpDto) {
    const { error } = await this.db.publicClient().auth.signInWithOtp({
      email: dto.email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    if (error) throw new BadRequestException(error.message);
    return { message: 'If this email belongs to a DRIVE account, a sign-in email has been sent. Enter the 6-digit code if your Supabase email template is configured for OTP.' };
  }

  async verifyEmailOtp(dto: VerifyEmailOtpDto) {
    const { data, error } = await this.db.publicClient().auth.verifyOtp({
      email: dto.email.trim().toLowerCase(), token: dto.token.trim(), type: 'email',
    });
    if (error || !data.session || !data.user) throw new UnauthorizedException('The code is invalid or expired. Request a new code.');
    return this.sessionPayload(data.session, data.user);
  }

  async sendPhoneOtp(dto: PhoneOtpDto) {
    const { error } = await this.db.publicClient().auth.signInWithOtp({
      phone: dto.phone.trim(),
      options: { shouldCreateUser: false, channel: 'sms' },
    });
    if (error) {
      throw new ServiceUnavailableException('Phone OTP is not available. Configure an SMS provider in Supabase Auth and verify the phone number format.');
    }
    return { message: 'If this phone number belongs to a DRIVE account, an SMS code has been requested.' };
  }

  async verifyPhoneOtp(dto: VerifyPhoneOtpDto) {
    const { data, error } = await this.db.publicClient().auth.verifyOtp({
      phone: dto.phone.trim(), token: dto.token.trim(), type: 'sms',
    });
    if (error || !data.session || !data.user) throw new UnauthorizedException('The SMS code is invalid or expired. Request a new code.');
    return this.sessionPayload(data.session, data.user);
  }

  async recoverPassword(dto: EmailOtpDto) {
    const baseUrl = getDriveRuntimeConfig().appBaseUrl.replace(/\/+$/, '');
    const { error } = await this.db.publicClient().auth.resetPasswordForEmail(
      dto.email.trim().toLowerCase(),
      { redirectTo: baseUrl + '/reset-password.html' },
    );
    if (error) throw new BadRequestException('Password recovery could not be started. Check the Supabase Auth redirect allow-list and email provider settings.');
    return { message: 'If this email belongs to a DRIVE account, password reset instructions have been sent.' };
  }

  async updatePassword(token: string, password: string) {
    const { data, error } = await this.db.userClient(token).auth.updateUser({ password });
    if (error || !data.user) throw new BadRequestException(error?.message || 'Password could not be updated.');
    return { message: 'Password updated successfully. Please log in with your new password.' };
  }

  async logout(accessToken: string, refreshToken: string) {
    if (!refreshToken) return { message: 'Local session can now be cleared.' };
    const client = this.db.publicClient();
    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) return { message: 'Local session can now be cleared.' };
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new BadRequestException(error.message);
    return { message: 'Session signed out.' };
  }

  private async sessionPayload(session: any, user: any) {
    const { data: profile, error } = await this.db.userClient(session.access_token)
      .from('profiles').select('id,full_name,phone,avatar_path,role,is_verified,is_active,preferred_language,preferred_currency')
      .eq('id', user.id).single();
    if (error || !profile || !profile.is_active) throw new UnauthorizedException('Account is unavailable.');
    return {
      message: 'Login successful.',
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      user: { ...profile, email: user.email || null },
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.db.publicClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedException('Session expired. Please log in again.');
    return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresIn: data.session.expires_in };
  }
}
