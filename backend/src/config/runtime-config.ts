export interface DriveRuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  corsOrigin: string;
  appBaseUrl: string;
  nodeEnv: string;
}
let runtimeConfig: DriveRuntimeConfig | undefined;
export function setDriveRuntimeConfig(config: DriveRuntimeConfig): void { runtimeConfig = config; }
export function getDriveRuntimeConfig(): DriveRuntimeConfig {
  return runtimeConfig ?? {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    corsOrigin: process.env.CORS_ORIGIN || '',
    appBaseUrl: process.env.DRIVE_PUBLIC_URL || 'https://drive-ewu.pages.dev',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}
