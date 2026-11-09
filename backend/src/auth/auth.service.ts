import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { users } from '../data/store';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (users.some(user => user.email === email)) throw new BadRequestException('This email is already registered.');
    const user = {
      id: users.length ? Math.max(...users.map(item => item.id)) + 1 : 1,
      name: dto.name.trim(), email, phone: dto.phone?.trim() ?? '',
      role: dto.role ?? 'Passenger',
      passwordHash: await bcrypt.hash(dto.password, 10)
    };
    users.push(user);
    return this.makeLoginResponse(user);
  }

  async login(dto: LoginDto) {
    const user = users.find(item => item.email === dto.email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return this.makeLoginResponse(user);
  }

  private async makeLoginResponse(user: (typeof users)[number]) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    const { passwordHash, ...safeUser } = user;
    return { message: 'Login successful.', accessToken, user: safeUser };
  }
}