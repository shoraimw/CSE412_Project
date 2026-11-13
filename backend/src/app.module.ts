import {Module} from '@nestjs/common';
import {DatabaseModule} from './database/database.module';
import {AuthModule} from './auth/auth.module';
import {PlatformModule} from './platform/platform.module';
import {HealthController} from './health.controller';
@Module({imports:[DatabaseModule,AuthModule,PlatformModule],controllers:[HealthController]}) export class AppModule {}