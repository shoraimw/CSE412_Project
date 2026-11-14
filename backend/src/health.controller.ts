import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'DRIVE API',
      timestamp: new Date().toISOString(),
    };
  }

  // This endpoint intentionally reveals configuration state, never secret values.
  @Get('ready')
  async getReadiness() {
    const supabase = await this.database.checkConnection();
    const ready = supabase.status === 'connected';
    const result = {
      status: ready ? 'ready' : 'not_ready',
      service: 'DRIVE API',
      dependencies: { supabase },
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(result);
    return result;
  }
}
