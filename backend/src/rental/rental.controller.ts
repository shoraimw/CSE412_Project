import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { bookings, users, vehicles } from '../data/store';
import { AuthGuard } from '../auth/auth.guard';
import { CreateBookingDto } from './dto/create-booking.dto';

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
    const start = new Date(dto.start_date + 'T00:00:00');
    const end = new Date(dto.end_date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!vehicle || !customerName || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start < today || end < start ||
        start.toISOString().slice(0,10) !== dto.start_date || end.toISOString().slice(0,10) !== dto.end_date) {
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