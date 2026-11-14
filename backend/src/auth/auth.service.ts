import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, EmailOtpDto, VerifyEmailOtpDto } from './dto/login.dto';

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
        .from('profiles').select('id,full_name,phone,avatar_path,role,is_verified,is_active')
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

  private async sessionPayload(session: any, user: any) {
    const { data: profile, error } = await this.db.userClient(session.access_token)
      .from('profiles').select('id,full_name,phone,avatar_path,role,is_verified,is_active')
      .eq('id', user.id).single();
    if (error || !profile || !profile.is_active) throw new UnauthorizedException('Account is unavailable.');
    return {
      message: 'Login successful.',
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      user: { ...profile, email: user.email },
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.db.publicClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedException('Session expired. Please log in again.');
    return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresIn: data.session.expires_in };
  }
}