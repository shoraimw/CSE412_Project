declare module 'cloudflare:node' {
  export function httpServerHandler(options: { port: number }): {
    fetch(request: Request): Promise<Response>;
  };
}
declare module 'cloudflare:workers' {
  export const env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    CORS_ORIGIN?: string;
  };
}
