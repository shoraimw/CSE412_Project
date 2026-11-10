import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OptimizeRouteDto } from './routes.dto';

const R = 6371;
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class RoutesService {
  async optimize(dto: OptimizeRouteDto) {
    const coordinates = String(dto.pickupLng) + ',' + String(dto.pickupLat) + ';' + String(dto.destinationLng) + ',' + String(dto.destinationLat);
    const url = 'https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson&alternatives=true&steps=false';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'DRIVE-CSE412-Academic-Project/1.0' } });
      if (!response.ok) throw new Error('Routing provider returned an error');
      const data: any = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No road route found');
      const routes = data.routes.map((route: any, index: number) => ({
        id: index + 1,
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        durationMinutes: Math.round(route.duration / 60),
        geometry: route.geometry,
      }));
      const selected = dto.preference === 'shortest'
        ? [...routes].sort((a: any, b: any) => a.distanceKm - b.distanceKm)[0]
        : [...routes].sort((a: any, b: any) => a.durationMinutes - b.durationMinutes)[0];
      return {
        provider: 'OpenStreetMap OSRM public demo service',
        optimization: dto.preference || 'fastest',
        selectedRoute: selected,
        alternativeRoutes: routes.filter((route: any) => route.id !== selected.id),
        isRoadRoute: true,
        note: 'Route alternatives depend on what the public routing provider returns. This is route optimization, not an AI/ML model.',
      };
    } catch {
      const distance = haversine(dto.pickupLat, dto.pickupLng, dto.destinationLat, dto.destinationLng);
      if (!Number.isFinite(distance) || distance <= 0) throw new ServiceUnavailableException('Unable to calculate route.');
      return {
        provider: 'Local fallback estimate',
        optimization: 'straight-line-fallback',
        selectedRoute: { distanceKm: Number((distance * 1.25).toFixed(2)), durationMinutes: Math.round(distance * 1.25 / 25 * 60), geometry: null },
        alternativeRoutes: [],
        isRoadRoute: false,
        note: 'Routing provider unavailable. This is an approximate straight-line fallback, not turn-by-turn navigation.',
      };
    }
  }
}
