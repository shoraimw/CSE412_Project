import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RentalModule } from './rental/rental.module';
import { SafetyModule } from './safety/safety.module';
import { TouristModule } from './tourist/tourist.module';

@Module({
  imports: [AuthModule, UsersModule, RentalModule, SafetyModule, TouristModule]
})
export class AppModule {}
