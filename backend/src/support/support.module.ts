import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SupportService } from './support.service';
import { ReviewsController, SupportController, AdminSupportController } from './support.controller';
@Module({
  imports:[DatabaseModule,AuthModule],
  controllers:[ReviewsController,SupportController,AdminSupportController],
  providers:[SupportService],
})
export class SupportModule {}
