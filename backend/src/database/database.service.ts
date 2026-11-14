import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDriveRuntimeConfig } from '../config/runtime-config';

@Injectable()
export class DatabaseService {
 private readonly config = getDriveRuntimeConfig();
 private readonly url = this.config.supabaseUrl;
 private readonly key = this.config.supabaseAnonKey;

 configurationStatus() {
  return { configured: Boolean(this.url && this.key), urlConfigured: Boolean(this.url), keyConfigured: Boolean(this.key) };
 }

 async checkConnection() {
  if (!this.url || !this.key) return { status: 'not_configured', ...this.configurationStatus() };
  try {
   const response = await fetch(this.url.replace(/\\/$/, '') + '/auth/v1/settings', {
    method: 'GET', headers: { apikey: this.key },
   });
   if (!response.ok) return { status: 'unreachable', configured: true, httpStatus: response.status };
   return { status: 'connected', configured: true, authApi: 'reachable' };
  } catch {
   return { status: 'unreachable', configured: true };
  }
 }
 publicClient(): SupabaseClient {
  this.assertConfigured();
  return createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false } });
 }
 userClient(token: string): SupabaseClient {
  this.assertConfigured();
  return createClient(this.url, this.key, {
   auth: { persistSession: false, autoRefreshToken: false },
   global: { headers: { Authorization: 'Bearer ' + token } },
  });
 }
 private assertConfigured() {
  if (!this.url || !this.key) throw new ServiceUnavailableException('Supabase is not configured on the API.');
 }
}