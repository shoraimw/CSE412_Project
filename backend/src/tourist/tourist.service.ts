import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTouristPlanDto } from './tourist.dto';

type TouristPlace = {
  id: string; name: string; city: string; category: string; description: string;
  lat: number; lng: number; tags: string[]; nearbyFacilities: string[];
  estimatedVisitHours: number;
};

const PLACES: TouristPlace[] = [
  { id: 'dhaka-lalbagh', name: 'Lalbagh Fort', city: 'Dhaka', category: 'History', description: 'A historic Mughal-era fort complex and one of Old Dhaka’s best-known heritage sites.', lat: 23.7194, lng: 90.3889, tags: ['history', 'architecture', 'culture'], nearbyFacilities: ['Local restaurants', 'Rickshaw stands', 'Pharmacy'], estimatedVisitHours: 1.5 },
  { id: 'dhaka-ahsan', name: 'Ahsan Manzil', city: 'Dhaka', category: 'History', description: 'A restored pink palace and museum beside the Buriganga River.', lat: 23.7089, lng: 90.4066, tags: ['history', 'museum', 'culture'], nearbyFacilities: ['Museum facilities', 'Food shops', 'Riverfront access'], estimatedVisitHours: 1.5 },
  { id: 'dhaka-parliament', name: 'National Parliament House', city: 'Dhaka', category: 'Architecture', description: 'A landmark modernist building designed by architect Louis Kahn; access restrictions may apply.', lat: 23.7625, lng: 90.3785, tags: ['architecture', 'culture', 'photography'], nearbyFacilities: ['Public roads', 'Parks nearby', 'Restaurants'], estimatedVisitHours: 1 },
  { id: 'dhaka-ramna', name: 'Ramna Park', city: 'Dhaka', category: 'Nature', description: 'A large green public park suitable for a relaxed walk and outdoor break.', lat: 23.7384, lng: 90.3964, tags: ['nature', 'walking', 'family'], nearbyFacilities: ['Walking paths', 'Open green spaces', 'Nearby cafés'], estimatedVisitHours: 1 },
  { id: 'dhaka-hatirjheel', name: 'Hatirjheel', city: 'Dhaka', category: 'Nature', description: 'An urban lake and public waterfront area popular for evening views.', lat: 23.7554, lng: 90.4113, tags: ['nature', 'photography', 'walking'], nearbyFacilities: ['Food stalls', 'Walking areas', 'Public viewpoints'], estimatedVisitHours: 1 },
  { id: 'ctg-patenga', name: 'Patenga Sea Beach', city: 'Chattogram', category: 'Beach', description: 'A popular coastal destination near the mouth of the Karnaphuli River.', lat: 22.245, lng: 91.793, tags: ['beach', 'nature', 'sunset', 'food'], nearbyFacilities: ['Food stalls', 'Local transport', 'Public beach access'], estimatedVisitHours: 2 },
  { id: 'ctg-foys', name: 'Foy’s Lake', city: 'Chattogram', category: 'Nature', description: 'A scenic lake and leisure area with family activities; check current entry and ride availability.', lat: 22.366, lng: 91.786, tags: ['nature', 'family', 'adventure'], nearbyFacilities: ['Food court', 'Ticket counter', 'Rest areas'], estimatedVisitHours: 2.5 },
  { id: 'ctg-museum', name: 'Ethnological Museum', city: 'Chattogram', category: 'Culture', description: 'A museum showcasing the cultures and heritage of communities in Bangladesh.', lat: 22.335, lng: 91.82, tags: ['museum', 'culture', 'history'], nearbyFacilities: ['Museum facilities', 'Restaurants', 'Local transport'], estimatedVisitHours: 1.5 },
  { id: 'cox-beach', name: 'Cox’s Bazar Sea Beach', city: 'Cox’s Bazar', category: 'Beach', description: 'A long sandy beach and major coastal destination; follow local beach-safety guidance.', lat: 21.4272, lng: 91.9717, tags: ['beach', 'nature', 'sunset', 'family'], nearbyFacilities: ['Hotels', 'Restaurants', 'Local transport', 'Emergency services nearby'], estimatedVisitHours: 3 },
  { id: 'cox-himchari', name: 'Himchari National Park', city: 'Cox’s Bazar', category: 'Nature', description: 'A coastal national park known for green hills and scenic viewpoints.', lat: 21.385, lng: 92.025, tags: ['nature', 'hiking', 'adventure'], nearbyFacilities: ['Local transport', 'Entry point', 'Food stalls'], estimatedVisitHours: 2 },
  { id: 'sylhet-jaflong', name: 'Jaflong', city: 'Sylhet', category: 'Nature', description: 'A scenic destination near the India–Bangladesh border with hills and river views.', lat: 25.161, lng: 92.018, tags: ['nature', 'photography', 'adventure'], nearbyFacilities: ['Local eateries', 'Boat operators', 'Local transport'], estimatedVisitHours: 3 },
  { id: 'sylhet-ratargul', name: 'Ratargul Swamp Forest', city: 'Sylhet', category: 'Nature', description: 'A freshwater swamp forest; boat access and water levels vary by season.', lat: 25.003, lng: 91.98, tags: ['nature', 'boat', 'adventure'], nearbyFacilities: ['Boat access points', 'Local guides', 'Small eateries'], estimatedVisitHours: 3 }
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

@Injectable()
export class TouristService {
  private readonly plans: Array<Record<string, unknown>> = [];

  getPlaces(city?: string, category?: string, search?: string) {
    return PLACES.filter(place =>
      (!city || place.city.toLowerCase() === city.toLowerCase()) &&
      (!category || place.category.toLowerCase() === category.toLowerCase()) &&
      (!search || (place.name + ' ' + place.description + ' ' + place.tags.join(' ')).toLowerCase().includes(search.toLowerCase()))
    );
  }

  getRecommendations(city: string, interests: string, origin?: { lat: number; lng: number }) {
    const selectedInterests = interests.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    const places = this.getPlaces(city);
    return places
      .map(place => ({
        ...place,
        matchScore: place.tags.filter(tag => selectedInterests.includes(tag)).length,
        distanceFromCurrentLocationKm: origin ? Number(haversineKm(origin, place).toFixed(2)) : null
      }))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (origin) return (a.distanceFromCurrentLocationKm ?? Infinity) - (b.distanceFromCurrentLocationKm ?? Infinity);
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }

  createPlan(userId: number, dto: CreateTouristPlanDto) {
    const selected = dto.placeIds.map(id => PLACES.find(place => place.id === id && place.city.toLowerCase() === dto.city.toLowerCase()));
    if (selected.some(place => !place)) throw new BadRequestException('One or more selected destinations do not belong to the selected city.');
    const places = selected as TouristPlace[];
    const mode = dto.transportPreference || 'Car';
    const speedKmh = mode === 'Walking' ? 4.5 : mode === 'Bike' ? 22 : mode === 'Public Transport' ? 18 : 25;
    let totalDistanceKm = 0;
    const stops = places.map((place, index) => {
      const previousPoint = index === 0 ? dto.origin : places[index - 1];
      const distanceFromPreviousKm = previousPoint ? haversineKm(previousPoint, place) : 0;
      totalDistanceKm += distanceFromPreviousKm;
      const estimatedTravelMinutes = index === 0 ? 0 : Math.max(1, Math.round((distanceFromPreviousKm * 1.4 / speedKmh) * 60));
      return {
        order: index + 1,
        ...place,
        distanceFromPreviousKm: Number(distanceFromPreviousKm.toFixed(2)),
        estimatedTravelMinutes
      };
    });
    const plan = {
      id: randomUUID(), userId, city: dto.city, travelDate: dto.travelDate || null,
      transportPreference: mode, origin: dto.origin || null, stops, totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      approximateTravelMinutes: stops.reduce((sum, stop) => sum + Number(stop.estimatedTravelMinutes), 0),
      estimateType: 'Approximate straight-line distance with rough travel-time estimate; not live road routing or traffic. The first leg starts from the supplied current location when available.',
      createdAt: new Date().toISOString()
    };
    this.plans.unshift(plan);
    return plan;
  }

  getPlans(userId: number) {
    return this.plans.filter(plan => plan.userId === userId);
  }
}
