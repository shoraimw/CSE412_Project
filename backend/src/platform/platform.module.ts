import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {PlatformController} from './platform.controller';
import {PlatformService} from './platform.service';
import {AdminGuard} from './admin.guard';

@Module({imports:[AuthModule],controllers:[PlatformController],providers:[PlatformService,AdminGuard]})
export class PlatformModule {}
