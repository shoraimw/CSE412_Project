import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errors = new Rate('drive_errors');
const apiLatency = new Trend('drive_api_latency', true);
const base = (__ENV.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = __ENV.DRIVE_ACCESS_TOKEN || '';

export const options = {
  scenarios: {
    staged_api_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 250 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    drive_errors: ['rate<0.01'],
  },
};

export default function () {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const health = http.get(base + '/api/health');
  check(health, { 'health returns 200': r => r.status === 200 });
  errors.add(health.status !== 200);
  apiLatency.add(health.timings.duration);

  if (token) {
    const rides = http.get(base + '/api/rides', { headers });
    check(rides, { 'authenticated rides endpoint returns 200': r => r.status === 200 });
    errors.add(rides.status !== 200);
    apiLatency.add(rides.timings.duration);
  }
  sleep(1);
}
