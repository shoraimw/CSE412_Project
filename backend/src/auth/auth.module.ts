import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'DRIVE_LOCAL_DEMO_SECRET_CHANGE_BEFORE_DEPLOY', signOptions: { expiresIn: '1d' } })],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard]
})
export class AuthModule {}