import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { users } from '../data/store';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Please log in first.');
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7));
      const user = users.find(item => item.id === Number(payload.sub));
      if (!user) throw new UnauthorizedException('User account was not found.');
      request.user = { id: user.id };
      return true;
    } catch {
      throw new UnauthorizedException('Your session is invalid. Please log in again.');
    }
  }
}