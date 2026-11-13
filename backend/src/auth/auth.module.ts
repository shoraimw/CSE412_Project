import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'DRIVE_LOCAL_DEMO_SECRET_CHANGE_BEFORE_DEPLOY');
if (!jwtSecret) throw new Error('JWT_SECRET must be configured in production.');
if (process.env.NODE_ENV === 'production' && Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes in production.');
}

@Module({
  imports: [JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1d', issuer: 'drive-api', audience: 'drive-client' } })],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, JwtModule]
})
export class AuthModule {}
