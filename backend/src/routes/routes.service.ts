import { Injectable } from '@nestjs/common';
import { getDriveRuntimeConfig } from '../config/runtime-config';
import { OptimizeRouteDto } from './routes.dto';

const EARTH_RADIUS_KM = 6371;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function durationMinutes(value: unknown): number {
  const match = String(value || '').match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return Math.max(1, Math.round(match ? Number(match[1]) / 60 : 0));
}

function trafficLevel(ratio: number): 'light' | 'moderate' | 'heavy' {
  if (ratio < 1.15) return 'light';
  if (ratio < 1.4) return 'moderate';
  return 'heavy';
}

function chooseRoute<T extends { distanceKm: number; durationMinutes: number }>(
  routes: T[],
  preference: string,
): T {
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
  async optimize(dto: OptimizeRouteDto) {
    const apiKey = getDriveRuntimeConfig().googleMapsApiKey;
    let googleFallbackNote = '';

    if (apiKey) {
      try {
        return await this.optimizeWithGoogle(dto, apiKey);
      } catch {
        googleFallbackNote = ' Google live-traffic routing was unavailable for this request.';
      }
    }

    return this.optimizeWithOsrm(dto, googleFallbackNote);
  }

  private async optimizeWithGoogle(dto: OptimizeRouteDto, apiKey: string) {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'routes.distanceMeters',
          'routes.duration',
          'routes.staticDuration',
          'routes.polyline.geoJsonLinestring',
          'routes.routeLabels',
        ].join(','),
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: dto.pickupLat, longitude: dto.pickupLng } } },
        destination: { location: { latLng: { latitude: dto.destinationLat, longitude: dto.destinationLng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        departureTime: new Date().toISOString(),
        computeAlternativeRoutes: true,
        polylineEncoding: 'GEO_JSON_LINESTRING',
        polylineQuality: 'OVERVIEW',
        units: 'METRIC',
        regionCode: 'BD',
        languageCode: 'en',
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) throw new Error('Google Routes API request failed');
    const payload: any = await response.json();
    if (!Array.isArray(payload.routes) || !payload.routes.length) {
      throw new Error('Google Routes API returned no routes');
    }

    const routes = payload.routes.map((route: any, index: number) => {
      const duration = durationMinutes(route.duration);
      const staticDuration = durationMinutes(route.staticDuration || route.duration);
      const ratio = staticDuration > 0 ? Math.max(1, duration / staticDuration) : 1;
      const geometry = route.polyline?.geoJsonLinestring || null;
      return {
        id: index + 1,
        distanceKm: Number((Number(route.distanceMeters) / 1000).toFixed(2)),
        durationMinutes: duration,
        staticDurationMinutes: staticDuration,
        trafficDelayMinutes: Math.max(0, duration - staticDuration),
        trafficRatio: Number(ratio.toFixed(3)),
        trafficLevel: trafficLevel(ratio),
        geometry,
        routeLabels: route.routeLabels || [],
      };
    }).filter((route: any) => Number.isFinite(route.distanceKm) && route.distanceKm > 0);

    if (!routes.length) throw new Error('Google Routes API returned invalid route data');
    const selected = chooseRoute(routes, dto.preference || 'balanced');
    return {
      provider: 'Google Maps Routes API',
      trafficStatus: 'live',
      trafficLevel: selected.trafficLevel,
      optimization: dto.preference || 'balanced',
      selectedRoute: selected,
      alternativeRoutes: routes.filter((route: any) => route.id !== selected.id),
      isRoadRoute: true,
      note: 'Route duration uses Google Maps traffic-aware routing and current traffic conditions when available.',
    };
  }

  private async optimizeWithOsrm(dto: OptimizeRouteDto, googleFallbackNote = '') {
    const coordinates = [
      String(dto.pickupLng), String(dto.pickupLat),
      String(dto.destinationLng), String(dto.destinationLat),
    ].join(',');
    const url = 'https://router.project-osrm.org/route/v1/driving/'
      + String(dto.pickupLng) + ',' + String(dto.pickupLat) + ';'
      + String(dto.destinationLng) + ',' + String(dto.destinationLat)
      + '?overview=full&geometries=geojson&alternatives=true&steps=false';

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'DRIVE-CSE412-Academic-Project/1.0' },
      });
      if (!response.ok) throw new Error('OSRM routing provider returned an error');
      const data: any = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No road route found');

      const routes = data.routes.map((route: any, index: number) => {
        const minutes = Math.max(1, Math.round(route.duration / 60));
        return {
          id: index + 1,
          distanceKm: Number((route.distance / 1000).toFixed(2)),
          durationMinutes: minutes,
          staticDurationMinutes: minutes,
          trafficDelayMinutes: 0,
          trafficRatio: 1,
          trafficLevel: 'unknown' as const,
          geometry: route.geometry,
        };
      });
      const selected = chooseRoute(routes, dto.preference || 'balanced');
      const keyNote = getDriveRuntimeConfig().googleMapsApiKey
        ? googleFallbackNote
        : ' Add GOOGLE_MAPS_API_KEY to the DRIVE Worker to enable Google Maps live traffic.';
      return {
        provider: 'OpenStreetMap OSRM',
        trafficStatus: 'unavailable',
        trafficLevel: 'unknown',
        optimization: dto.preference || 'balanced',
        selectedRoute: selected,
        alternativeRoutes: routes.filter((route: any) => route.id !== selected.id),
        isRoadRoute: true,
        note: 'Road distance and standard route duration are available; live traffic is not available in this fallback.' + keyNote,
      };
    } catch {
      const distance = haversine(dto.pickupLat, dto.pickupLng, dto.destinationLat, dto.destinationLng);
      const estimatedDistance = Math.max(0.1, distance * 1.25);
      const minutes = Math.max(1, Math.round(estimatedDistance / 25 * 60));
      return {
        provider: 'Local straight-line fallback',
        trafficStatus: 'unavailable',
        trafficLevel: 'unknown',
        optimization: 'straight-line-fallback',
        selectedRoute: {
          distanceKm: Number(estimatedDistance.toFixed(2)),
          durationMinutes: minutes,
          staticDurationMinutes: minutes,
          trafficDelayMinutes: 0,
          trafficRatio: 1,
          trafficLevel: 'unknown',
          geometry: null,
        },
        alternativeRoutes: [],
        isRoadRoute: false,
        note: 'Map routing providers are unavailable. This is an approximate fallback, not turn-by-turn navigation.' + googleFallbackNote,
      };
    }
  }
}
