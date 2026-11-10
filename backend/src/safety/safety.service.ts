import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { CreateSafetyTripDto, GeoPointDto, SafetyContactDto, SafetySettingsDto, SosDto } from './safety.dto';

type Contact = { id: string; name: string; phone: string; relation: string };
type WarningType = 'ROUTE_DEVIATION' | 'UNEXPECTED_DELAY';
type TripWarning = { id: string; type: WarningType; message: string; createdAt: string };
type TripStatus = 'ACTIVE' | 'DELAYED' | 'EMERGENCY' | 'COMPLETED';
type Location = { lat: number; lng: number; updatedAt: string };
type SafetyTrip = {
  id: string; userId: number; destination: string; startedAt: string; expectedArrivalAt: string;
  status: TripStatus; currentLocation: Location | null; plannedRoute: GeoPointDto[];
  warnings: TripWarning[];
};
type SafetyAlert = {
  id: string; userId: number; tripId: string | null; message: string;
  location: GeoPointDto | null; createdAt: string; status: string;
  notifiedContacts: Array<{ name: string; phone: string; delivery: string }>;
};
type ShareRecord = { tripId: string; userId: number; contactIds: string[]; createdAt: string; expiresAt: string };

const DEMO_VERIFIED_DRIVERS = [
  { id: 'driver-demo-101', name: 'Rahim Ahmed', vehicle: 'Toyota Axio', rating: 4.8, verificationStatus: 'Demo verified', note: 'Sample driver record for academic demonstration' },
  { id: 'driver-demo-102', name: 'Sadia Islam', vehicle: 'Honda Grace', rating: 4.9, verificationStatus: 'Demo verified', note: 'Sample driver record for academic demonstration' },
  { id: 'driver-demo-103', name: 'Karim Hasan', vehicle: 'Toyota Premio', rating: 4.7, verificationStatus: 'Demo verified', note: 'Sample driver record for academic demonstration' }
];

function distanceToSegmentMeters(point: GeoPointDto, start: GeoPointDto, end: GeoPointDto): number {
  const meanLat = ((point.lat + start.lat + end.lat) / 3) * Math.PI / 180;
  const scaleX = 111320 * Math.cos(meanLat);
  const scaleY = 110540;
  const px = (point.lng - start.lng) * scaleX;
  const py = (point.lat - start.lat) * scaleY;
  const bx = (end.lng - start.lng) * scaleX;
  const by = (end.lat - start.lat) * scaleY;
  const lengthSquared = bx * bx + by * by;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  return Math.sqrt((px - t * bx) ** 2 + (py - t * by) ** 2);
}

@Injectable()
export class SafetyService {
  private readonly settings = new Map<number, {
    womenSafetyEnabled: boolean; preferVerifiedDrivers: boolean;
    trustedContacts: Contact[]; emergencyContacts: Contact[];
  }>();
  private readonly trips = new Map<string, SafetyTrip>();
  private readonly shares = new Map<string, ShareRecord>();
  private readonly alerts: SafetyAlert[] = [];

  private defaultSettings() {
    return { womenSafetyEnabled: false, preferVerifiedDrivers: false, trustedContacts: [], emergencyContacts: [] };
  }

  getSettings(userId: number) {
    const value = this.settings.get(userId) ?? this.defaultSettings();
    return {
      womenSafetyEnabled: value.womenSafetyEnabled,
      preferVerifiedDrivers: value.preferVerifiedDrivers,
      trustedContacts: value.trustedContacts.map(item => ({ ...item })),
      emergencyContacts: value.emergencyContacts.map(item => ({ ...item }))
    };
  }

  saveSettings(userId: number, dto: SafetySettingsDto) {
    const current = this.settings.get(userId) ?? this.defaultSettings();
    const normalize = (incoming: SafetyContactDto[] | undefined, previous: Contact[]): Contact[] =>
      incoming === undefined ? previous : incoming.map(item => ({
        id: item.id || randomUUID(),
        name: item.name.trim(),
        phone: item.phone.trim(),
        relation: (item.relation || 'Trusted contact').trim()
      }));
    this.settings.set(userId, {
      womenSafetyEnabled: dto.womenSafetyEnabled ?? current.womenSafetyEnabled,
      preferVerifiedDrivers: dto.preferVerifiedDrivers ?? current.preferVerifiedDrivers,
      trustedContacts: normalize(dto.trustedContacts, current.trustedContacts),
      emergencyContacts: normalize(dto.emergencyContacts, current.emergencyContacts)
    });
    return this.getSettings(userId);
  }

  getVerifiedDrivers() {
    return DEMO_VERIFIED_DRIVERS.map(driver => ({ ...driver }));
  }

  startTrip(userId: number, dto: CreateSafetyTripDto) {
    const startedAt = new Date();
    const trip: SafetyTrip = {
      id: randomUUID(),
      userId,
      destination: dto.destination.trim(),
      startedAt: startedAt.toISOString(),
      expectedArrivalAt: new Date(startedAt.getTime() + dto.estimatedDurationMinutes * 60000).toISOString(),
      status: 'ACTIVE',
      currentLocation: dto.initialLocation ? { ...dto.initialLocation, updatedAt: startedAt.toISOString() } : null,
      plannedRoute: dto.plannedRoute || [],
      warnings: []
    };
    this.trips.set(trip.id, trip);
    return {
      trip,
      monitoring: {
        routeDeviationEnabled: trip.plannedRoute.length >= 2,
        routeDeviationThresholdMeters: 500,
        delayGraceMinutes: 10
      },
      note: trip.plannedRoute.length >= 2
        ? 'Route deviation monitoring is enabled for the supplied route points.'
        : 'Delay monitoring is enabled. Add at least two planned route coordinates to enable route-deviation monitoring.'
    };
  }

  getActiveTrips(userId: number) {
    const result: SafetyTrip[] = [];
    for (const trip of this.trips.values()) {
      if (trip.userId === userId && trip.status !== 'COMPLETED') {
        this.checkDelay(trip);
        result.push(trip);
      }
    }
    return result;
  }

  shareTrip(userId: number, tripId: string, contactIds: string[]) {
    const trip = this.getOwnedTrip(userId, tripId);
    if (trip.status === 'COMPLETED') throw new BadRequestException('Completed trips cannot be shared.');
    const contacts = this.getSettings(userId).trustedContacts.filter(contact => contactIds.includes(contact.id));
    if (contacts.length === 0) throw new BadRequestException('Select at least one saved trusted contact.');
    const shareToken = randomBytes(24).toString('hex');
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    this.shares.set(shareToken, { tripId, userId, contactIds: contacts.map(contact => contact.id), createdAt, expiresAt });
    return {
      shareToken,
      expiresAt,
      sharedContacts: contacts.map(({ id, name, phone }) => ({ id, name, phone })),
      notificationDelivery: 'SIMULATED_ONLY',
      message: 'A private live-trip link was created. SMS or WhatsApp delivery is not configured in this demo.'
    };
  }

  getSharedTrip(token: string) {
    const share = this.shares.get(token);
    if (!share) throw new NotFoundException('This trip-sharing link is invalid or expired.');
    if (Date.now() > new Date(share.expiresAt).getTime()) {
      this.shares.delete(token);
      throw new NotFoundException('This trip-sharing link has expired.');
    }
    const trip = this.trips.get(share.tripId);
    if (!trip) throw new NotFoundException('Trip not found.');
    return {
      destination: trip.destination,
      status: trip.status,
      startedAt: trip.startedAt,
      expectedArrivalAt: trip.expectedArrivalAt,
      currentLocation: trip.currentLocation,
      warnings: trip.warnings,
      lastUpdatedAt: trip.currentLocation?.updatedAt || trip.startedAt,
      shareExpiresAt: share.expiresAt,
      privacyNote: 'This link exposes limited trip details only. Contact notifications are simulated in this academic demo.'
    };
  }

  updateLocation(userId: number, tripId: string, point: GeoPointDto) {
    const trip = this.getOwnedTrip(userId, tripId);
    if (trip.status === 'COMPLETED') throw new BadRequestException('This trip has already been completed.');
    trip.currentLocation = { ...point, updatedAt: new Date().toISOString() };
    if (trip.plannedRoute.length >= 2) {
      let minimumDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < trip.plannedRoute.length - 1; index += 1) {
        minimumDistance = Math.min(minimumDistance, distanceToSegmentMeters(point, trip.plannedRoute[index], trip.plannedRoute[index + 1]));
      }
      if (minimumDistance > 500) {
        this.addWarning(trip, 'ROUTE_DEVIATION', 'Current location is more than 500 metres from the supplied planned route.');
      }
    }
    this.checkDelay(trip);
    return { trip, latestWarnings: trip.warnings.slice(-3) };
  }

  completeTrip(userId: number, tripId: string) {
    const trip = this.getOwnedTrip(userId, tripId);
    trip.status = 'COMPLETED';
    return { message: 'Trip marked as completed.', trip };
  }

  createSos(userId: number, dto: SosDto) {
    let trip: SafetyTrip | undefined;
    if (dto.tripId) {
      trip = this.getOwnedTrip(userId, dto.tripId);
      if (trip.status !== 'COMPLETED') trip.status = 'EMERGENCY';
    }
    const contacts = this.getSettings(userId).emergencyContacts;
    const alert: SafetyAlert = {
      id: randomUUID(),
      userId,
      tripId: dto.tripId || null,
      message: (dto.message || 'Emergency assistance requested by passenger.').trim(),
      location: dto.location ? { lat: dto.location.lat, lng: dto.location.lng } : null,
      createdAt: new Date().toISOString(),
      status: 'RECORDED - NOTIFICATION PROVIDER REQUIRED',
      notifiedContacts: contacts.map(contact => ({
        name: contact.name,
        phone: contact.phone,
        delivery: 'SIMULATED - NOT SENT'
      }))
    };
    this.alerts.unshift(alert);
    return {
      alert,
      emergencyContactsConfigured: contacts.length,
      notificationDelivery: 'SIMULATED_ONLY',
      message: contacts.length
        ? 'SOS recorded. Emergency contact notifications are simulated; connect an SMS/WhatsApp provider for real delivery.'
        : 'SOS recorded, but no emergency contacts are saved. Add emergency contacts and configure a notification provider.'
    };
  }

  getAlerts(userId: number) {
    return this.alerts.filter(alert => alert.userId === userId);
  }

  private getOwnedTrip(userId: number, tripId: string): SafetyTrip {
    const trip = this.trips.get(tripId);
    if (!trip || trip.userId !== userId) throw new NotFoundException('Trip not found.');
    return trip;
  }

  private checkDelay(trip: SafetyTrip) {
    if (trip.status !== 'ACTIVE') return;
    const gracePeriod = 10 * 60000;
    if (Date.now() > new Date(trip.expectedArrivalAt).getTime() + gracePeriod) {
      trip.status = 'DELAYED';
      this.addWarning(trip, 'UNEXPECTED_DELAY', 'The trip is more than 10 minutes past its estimated arrival time.');
    }
  }

  private addWarning(trip: SafetyTrip, type: WarningType, message: string) {
    const recent = trip.warnings.find(item =>
      item.type === type && Date.now() - new Date(item.createdAt).getTime() < 5 * 60000
    );
    if (!recent) trip.warnings.push({ id: randomUUID(), type, message, createdAt: new Date().toISOString() });
  }
}
