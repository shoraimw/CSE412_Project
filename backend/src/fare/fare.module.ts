import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FareController } from './fare.controller';
import { FareService } from './fare.service';
@Module({ imports:[DatabaseModule],controllers:[FareController],providers:[FareService],exports:[FareService] })
export class FareModule {}
