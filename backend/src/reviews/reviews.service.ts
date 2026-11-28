import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateReviewDto } from './reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  private db(token: string) { return this.database.userClient(token); }

  async create(userId: string, token: string, dto: CreateReviewDto) {
    const db = this.db(token);
    const { data: ride, error: rideError } = await db.from('rides')
      .select('id,status,driver_id')
      .eq('id', dto.rideId)
      .maybeSingle();
    if (rideError) throw new ServiceUnavailableException(rideError.message);
    if (!ride || ride.status !== 'completed') throw new NotFoundException('Only a completed ride can be reviewed.');
    const { data: passenger, error: passengerError } = await db.from('ride_passengers')
      .select('ride_id')
      .eq('ride_id', ride.id)
      .eq('passenger_id', userId)
      .maybeSingle();
    if (passengerError) throw new ServiceUnavailableException(passengerError.message);
    if (!passenger) throw new NotFoundException('You were not a passenger on this ride.');
    if (ride.driver_id === userId) throw new BadRequestException('Drivers cannot review themselves.');

    const { data, error } = await db.from('reviews').insert({
      ride_id: ride.id,
      reviewer_id: userId,
      reviewee_id: ride.driver_id,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
    }).select('id,ride_id,reviewer_id,reviewee_id,rating,comment,created_at').single();
    if (error) {
      if (error.code === '23505') throw new ConflictException('You have already reviewed this completed ride.');
      throw new BadRequestException(error.message);
    }
    return { message: 'Thank you. Your feedback has been saved.', review: data };
  }

  async mine(userId: string, token: string) {
    const { data, error } = await this.db(token).from('reviews')
      .select('id,ride_id,reviewee_id,rating,comment,created_at')
      .eq('reviewer_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new ServiceUnavailableException(error.message);
    return data || [];
  }

  async driverSummary(driverId: string, token: string) {
    const { data: driver, error: driverError } = await this.db(token).from('profiles')
      .select('id,full_name,role,is_verified')
      .eq('id', driverId)
      .maybeSingle();
    if (driverError) throw new ServiceUnavailableException(driverError.message);
    if (!driver || driver.role !== 'driver') throw new NotFoundException('Driver profile not found.');

    const { data, error } = await this.db(token).from('reviews')
      .select('id,rating,comment,created_at,reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
      .eq('reviewee_id', driverId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new ServiceUnavailableException(error.message);
    const reviews = data || [];
    const average = reviews.length
      ? Number((reviews.reduce((sum: number, item: any) => sum + Number(item.rating), 0) / reviews.length).toFixed(1))
      : null;
    return {
      driverId,
      driverName: driver.full_name,
      averageRating: average,
      totalReviews: reviews.length,
      stars: average === null ? 0 : Math.round(average),
      label: average === null ? 'New Driver — No reviews yet' : average.toFixed(1) + '/5',
      reviews: reviews.map((item: any) => ({
        id: item.id,
        rating: Number(item.rating),
        comment: item.comment,
        createdAt: item.created_at,
        reviewerName: item.reviewer?.full_name || 'DRIVE passenger',
      })),
    };
  }
}
