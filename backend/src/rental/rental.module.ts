import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RentalController } from './rental.controller';
@Module({ imports: [AuthModule], controllers: [RentalController] })
export class RentalModule {}