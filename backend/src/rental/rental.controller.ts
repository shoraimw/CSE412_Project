import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { bookings, users, vehicles } from '../data/store';
import { AuthGuard } from '../auth/auth.guard';
import { CreateBookingDto } from './dto/create-booking.dto';

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getBangladeshToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

@Controller('rental')
export class RentalController {
  @Get('vehicles')
  getVehicles(@Query('type') type = 'All', @Query('location') location = '', @Query('max_price') maxPrice = '') {
    const max = maxPrice === '' ? null : Number(maxPrice);
    if (max !== null && (!Number.isFinite(max) || max < 0)) throw new BadRequestException('Maximum price must be a valid positive number.');
    return vehicles.filter(vehicle =>
      (type === 'All' || vehicle.type === type) &&
      vehicle.location.toLowerCase().includes(location.trim().toLowerCase()) &&
      (max === null || vehicle.price <= max)
    );
  }

  @Post('bookings')
  @UseGuards(AuthGuard)
  createBooking(@Req() request: Request & { user: { id: number } }, @Body() dto: CreateBookingDto) {
    const customerName = dto.customer_name.trim();
    const vehicle = vehicles.find(item => item.id === dto.vehicle_id);
    const today = getBangladeshToday();

    // Compare date-only strings in YYYY-MM-DD form to avoid UTC/local-time shifts.
    if (!vehicle || !customerName ||
        !isValidDateOnly(dto.start_date) || !isValidDateOnly(dto.end_date) ||
        dto.start_date < today || dto.end_date < dto.start_date) {
      throw new BadRequestException('Please provide valid booking details.');
    }

    const user = users.find(item => item.id === request.user.id)!;
    const booking = {
      id: bookings.length + 1, userId: user.id, vehicleId: vehicle.id,
      vehicleName: vehicle.name, customerName, startDate: dto.start_date,
      endDate: dto.end_date, status: 'Pending' as const
    };
    bookings.push(booking);
    return { message: 'Booking request received successfully.', booking };
  }
}