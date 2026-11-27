import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { VerificationController, AdminVerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
@Module({
  imports:[DatabaseModule,AuthModule],
  controllers:[VerificationController,AdminVerificationController],
  providers:[VerificationService],
})
export class VerificationModule {}
