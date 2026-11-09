import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RentalModule } from './rental/rental.module';

@Module({ imports: [AuthModule, UsersModule, RentalModule] })
export class AppModule {}