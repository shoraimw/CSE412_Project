import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDriveRuntimeConfig } from '../config/runtime-config';

@Injectable()
export class DatabaseService {
 private readonly config = getDriveRuntimeConfig();
 private readonly url = this.config.supabaseUrl;
 private readonly key = this.config.supabaseAnonKey;

 constructor() {
  if (this.config.nodeEnv === 'production' && (!this.url || !this.key)) {
   throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');
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