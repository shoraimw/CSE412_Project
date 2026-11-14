import { Body, Controller, Post, Inject } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { OptimizeRouteDto } from './routes.dto';
@Controller('routes')
export class RoutesController {
  constructor(@Inject(RoutesService) private readonly routes: RoutesService) {}
  @Post('optimize') optimize(@Body() body: OptimizeRouteDto) { return this.routes.optimize(body); }
}