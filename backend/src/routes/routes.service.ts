import { Injectable } from '@nestjs/common';
import { OptimizeRouteDto } from './routes.dto';

const EARTH_RADIUS_KM = 6371;
const OSRM_BASE_URL = 'https://router.project-osrm.org';
const ROUTE_CACHE_TTL_MS = 300_000;
const MIN_OSRM_INTERVAL_MS = 1_100;

type RouteOption = {
  id: number;
  distanceKm: number;
  durationMinutes: number;
  geometry: any | null;
};

type RouteResult = {
  provider: string;
  trafficStatus: 'unavailable';
  optimization: string;
  selectedRoute: RouteOption;
  alternativeRoutes: RouteOption[];
  isRoadRoute: boolean;
  note: string;
};

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function chooseRoute(routes: RouteOption[], preference: string): RouteOption {
  if (preference === 'shortest') {
    return [...routes].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }
  if (preference === 'balanced') {
    const minDistance = Math.max(0.01, Math.min(...routes.map(route => route.distanceKm)));
    const minDuration = Math.max(1, Math.min(...routes.map(route => route.durationMinutes)));
    return [...routes].sort((a, b) =>
      (a.distanceKm / minDistance + a.durationMinutes / minDuration)
      - (b.distanceKm / minDistance + b.durationMinutes / minDuration),
    )[0];
  }
  return [...routes].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
}

@Injectable()
export class RoutesService {
  private readonly routeCache = new Map<string, { expiresAt: number; result: RouteResult }>();
  private readonly inFlight = new Map<string, Promise<RouteResult>>();
  private osrmQueue: Promise<void> = Promise.resolve();
  private lastOsrmRequestAt = 0;

  async optimize(dto: OptimizeRouteDto): Promise<RouteResult> {
    const preference = dto.preference || 'balanced';
    const cacheKey = [
      dto.pickupLat.toFixed(5),
      dto.pickupLng.toFixed(5),
      dto.destinationLat.toFixed(5),
      dto.destinationLng.toFixed(5),
      preference,
    ].join(':');

    const cached = this.routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    if (cached) this.routeCache.delete(cacheKey);

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const request = this.calculateOsrm(dto, preference);
    this.inFlight.set(cacheKey, request);
    try {
      const result = await request;
      this.routeCache.set(cacheKey, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, result });
      if (this.routeCache.size > 250) {
        const oldestKey = this.routeCache.keys().next().value;
        if (oldestKey) this.routeCache.delete(oldestKey);
      }
      return result;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async fetchOsrm(url: string): Promise<Response> {
    const execute = async () => {
      const waitMs = Math.max(0, MIN_OSRM_INTERVAL_MS - (Date.now() - this.lastOsrmRequestAt));
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
      this.lastOsrmRequestAt = Date.now();
      return fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'DRIVE-CSE412-Academic-Project/1.0' },
      });
    };

    const responsePromise = this.osrmQueue.then(execute, execute);
    this.osrmQueue = responsePromise.then(() => undefined, () => undefined);
    return responsePromise;
  }

  private async calculateOsrm(dto: OptimizeRouteDto, preference: string): Promise<RouteResult> {
    const url = OSRM_BASE_URL + '/route/v1/driving/'
      + String(dto.pickupLng) + ',' + String(dto.pickupLat) + ';'
      + String(dto.destinationLng) + ',' + String(dto.destinationLat)
      + '?overview=full&geometries=geojson&alternatives=true&steps=false';

    try {
      const response = await this.fetchOsrm(url);
      if (!response.ok) throw new Error('OSRM routing provider returned an error');
      const data: any = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No road route found');

      const routes: RouteOption[] = data.routes.map((route: any, index: number) => {
        const minutes = Math.max(1, Math.round(Number(route.duration) / 60));
        return {
          id: index + 1,
          distanceKm: Number((Number(route.distance) / 1000).toFixed(2)),
          durationMinutes: minutes,
          geometry: route.geometry || null,
        };
      }).filter((route: RouteOption) => Number.isFinite(route.distanceKm) && route.distanceKm > 0);

      if (!routes.length) throw new Error('OSRM returned no valid road routes');
      const selected = chooseRoute(routes, preference);
      return {
        provider: 'OpenStreetMap OSRM',
        trafficStatus: 'unavailable',
        optimization: preference,
        selectedRoute: selected,
        alternativeRoutes: routes.filter(route => route.id !== selected.id),
        isRoadRoute: true,
        note: 'Route distance and standard estimated duration use OpenStreetMap road data. Live traffic is not provided by this free routing service.',
      };
    } catch {
      const distance = haversine(dto.pickupLat, dto.pickupLng, dto.destinationLat, dto.destinationLng);
      const estimatedDistance = Math.max(0.1, distance * 1.25);
      const minutes = Math.max(1, Math.round(estimatedDistance / 25 * 60));
      return {
        provider: 'Straight-line fallback',
        trafficStatus: 'unavailable',
        optimization: 'straight-line-fallback',
        selectedRoute: {
          id: 1,
          distanceKm: Number(estimatedDistance.toFixed(2)),
          durationMinutes: minutes,
          geometry: null,
        },
        alternativeRoutes: [],
        isRoadRoute: false,
        note: 'OSRM is temporarily unavailable. This is an approximate distance and not a road route or turn-by-turn navigation.',
      };
    }
  }
}
