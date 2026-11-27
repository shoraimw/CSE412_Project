import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDriveRuntimeConfig } from '../config/runtime-config';

@Injectable()
export class DatabaseService {
  private readonly config = getDriveRuntimeConfig();
  private readonly url = this.config.supabaseUrl;
  private readonly key = this.config.supabaseAnonKey;

  configurationStatus() {
    return {
      configured: Boolean(this.url && this.key),
      urlConfigured: Boolean(this.url),
      keyConfigured: Boolean(this.key),
    };
  }

  // The publishable/anon key is intended for public-client access protected by RLS.
  // A service-role key must never be exposed to browser code.
  publicRealtimeConfig() {
    this.assertConfigured();
    return { url: this.url, anonKey: this.key };
  }

  /**
   * Readiness verifies both Supabase Auth and the DRIVE application schema.
   * A reachable Auth endpoint alone does not mean the application database is ready.
   */
  async checkConnection() {
    if (!this.url || !this.key) {
      return { status: 'not_configured', ...this.configurationStatus() };
    }

    try {
      const authResponse = await fetch(
        this.url.replace(/\/+$/, '') + '/auth/v1/settings',
        { method: 'GET', headers: { apikey: this.key } },
      );

      if (!authResponse.ok) {
        return {
          status: 'unreachable',
          configured: true,
          authApi: 'unreachable',
          database: 'not_checked',
          httpStatus: authResponse.status,
        };
      }

      const { error } = await this.publicClient()
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .limit(1);

      if (error) {
        const schemaMissing = error.code === 'PGRST205' || error.code === '42P01';
        return {
          status: schemaMissing ? 'schema_not_ready' : 'database_not_ready',
          configured: true,
          authApi: 'reachable',
          database: 'not_ready',
          code: error.code || 'UNKNOWN',
        };
      }

      return {
        status: 'connected',
        configured: true,
        authApi: 'reachable',
        database: 'reachable',
      };
    } catch {
      return {
        status: 'unreachable',
        configured: true,
        authApi: 'unknown',
        database: 'unreachable',
      };
    }
  }

  publicClient(): SupabaseClient {
    this.assertConfigured();
    return createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  userClient(token: string): SupabaseClient {
    this.assertConfigured();
    return createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });
  }

  private assertConfigured() {
    if (!this.url || !this.key) {
      throw new ServiceUnavailableException('Supabase is not configured on the API.');
    }
  }
}
