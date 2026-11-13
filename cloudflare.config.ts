import { bindings, defineConfig } from 'cf/config';
import * as entrypoint from './backend/dist-cloudflare/worker.js' with { type: 'cf-worker' };

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'cse412-project',
    entrypoint,
    compatibilityDate: '2026-11-13',
    compatibilityFlags: ['nodejs_compat'],
    env: {
      SUPABASE_URL: bindings.secret(),
      SUPABASE_ANON_KEY: bindings.secret(),
      CORS_ORIGIN: bindings.text(''),
      ASSETS: bindings.assets(),
    },
    assets: {
      runWorkerFirst: ['/api/*'],
    },
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
  },
}));
