import { bindings, defineConfig } from 'cf/config';
import * as entrypoint from './backend/src/worker.ts' with { type: 'cf-worker' };

export default defineConfig({
  worker: {
    name: 'cse412-project',
    entrypoint,
    compatibilityDate: '2026-11-13',
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
});
