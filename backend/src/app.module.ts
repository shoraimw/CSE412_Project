import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RentalModule } from './rental/rental.module';
import { FareModule } from './fare/fare.module';
import { RoutesModule } from './routes/routes.module';
import { PaymentsModule } from './payments/payments.module';
import { SafetyModule } from './safety/safety.module';
import { TouristModule } from './tourist/tourist.module';
import { RidesModule } from './rides/rides.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule, UsersModule, RentalModule, RidesModule, FareModule, RoutesModule, PaymentsModule, SafetyModule, TouristModule],
  controllers: [HealthController]
})
export class AppModule {}
