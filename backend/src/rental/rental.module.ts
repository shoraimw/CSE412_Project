import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RentalController } from './rental.controller';
@Module({ imports: [AuthModule, DatabaseModule], controllers: [RentalController] })
export class RentalModule {}