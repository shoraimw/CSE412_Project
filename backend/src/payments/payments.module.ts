import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { PaymentsController, SslcommerzController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports:[DatabaseModule,AuthModule],
  controllers:[PaymentsController,SslcommerzController],
  providers:[PaymentsService],
})
export class PaymentsModule {}
