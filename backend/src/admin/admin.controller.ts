import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, Patch, Req, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { ReviewDto, ReviewPaymentDto } from '../drivers/driver.dto';

type AdminRequest = Request & {
  user: { id: string; accessToken: string; role: string };
};

type UserStatusDto = { is_active: boolean };
type RentalReviewDto = { status: 'approved' | 'rejected' | 'cancelled' | 'completed' };

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private check(request: AdminRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Administrator access required.');
    }
  }

  private client(request: AdminRequest) {
    this.check(request);
    return this.db.userClient(request.user.accessToken);
  }

  private async audit(
    db: any,
    request: AdminRequest,
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown> = {},
  ) {
    const { error } = await db.from('admin_audit_logs').insert({
      admin_id: request.user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
    // Do not report a successful business operation as failed solely because
    // the audit sink is temporarily unavailable. The failure is visible in
    // Worker logs and the UI can still refresh the authoritative record.
    if (error) console.error('[DRIVE admin audit]', error.message);
  }

  @Get('overview')
  async overview(@Req() request: AdminRequest) {
    const db = this.client(request);
    const results = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db.from('driver_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('vehicle_owner_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('vehicles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      db.from('rides').select('id', { count: 'exact', head: true }).in('status', ['matched', 'driver_arriving', 'in_progress']),
      db.from('rental_bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('safety_alerts').select('id', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']),
      db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const names = ['users', 'pendingDrivers', 'pendingOwners', 'pendingVehicles', 'activeRides', 'pendingRentals', 'activeSafetyAlerts', 'pendingPayments'];
    const errors = results.flatMap((result, index) => result.error ? [{ section: names[index], message: result.error.message }] : []);
    const counts = Object.fromEntries(names.map((name, index) => [name, results[index].count ?? 0]));
    return { counts, errors, generatedAt: new Date().toISOString() };
  }

  @Get('driver-applications')
  async applications(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('driver_applications')
      .select('*,profiles:profiles!driver_applications_user_id_fkey(full_name,phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('driver-applications/:id')
  async reviewApplication(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    const db = this.client(request);
    if(dto.status==='approved'){
      const {data:application,error:applicationError}=await db.from('driver_applications').select('user_id').eq('id',id).maybeSingle();
      if(applicationError||!application)throw new NotFoundException(applicationError?.message||'Driver application not found.');
      const {data:documents,error:documentsError}=await db.from('driver_documents').select('document_type,verification_status').eq('driver_id',application.user_id).in('document_type',['license_front','license_back','national_id']);
      if(documentsError)throw new BadRequestException(documentsError.message);
      const approved=new Set((documents||[]).filter((d:any)=>d.verification_status==='approved').map((d:any)=>d.document_type));
      const missing=['license_front','license_back','national_id'].filter(type=>!approved.has(type));
      if(missing.length)throw new BadRequestException('Approve the required Driver documents first: '+missing.join(', ')+'.');
    }
    const { data, error } = await db.rpc('drive_admin_review_driver_application', {
      p_application_id: id,
      p_status: dto.status,
      p_rejection_reason: dto.rejection_reason || null,
    });
    if (error) throw new BadRequestException(error.message);
    await this.audit(db, request, dto.status === 'approved' ? 'driver.approved' : 'driver.rejected', 'driver_application', id, {
      status: dto.status,
      rejectionReason: dto.rejection_reason || null,
    });
    return data;
  }

  @Get('owner-applications')
  async ownerApplications(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('vehicle_owner_applications')
      .select('*,profiles:profiles!vehicle_owner_applications_user_id_fkey(full_name,phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('owner-applications/:id')
  async reviewOwnerApplication(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    const db = this.client(request);
    if(dto.status==='approved'){
      const {data:application,error:applicationError}=await db.from('vehicle_owner_applications').select('user_id').eq('id',id).maybeSingle();
      if(applicationError||!application)throw new NotFoundException(applicationError?.message||'Vehicle Owner application not found.');
      const {data:documents,error:documentsError}=await db.from('owner_documents').select('document_type,verification_status').eq('owner_id',application.user_id).is('vehicle_id',null).in('document_type',['national_id','business_license']);
      if(documentsError)throw new BadRequestException(documentsError.message);
      const approved=new Set((documents||[]).filter((d:any)=>d.verification_status==='approved').map((d:any)=>d.document_type));
      const missing=['national_id','business_license'].filter(type=>!approved.has(type));
      if(missing.length)throw new BadRequestException('Approve the required Vehicle Owner documents first: '+missing.join(', ')+'.');
    }
    const { data, error } = await db.rpc('drive_admin_review_owner_application', {
      p_application_id: id,
      p_status: dto.status,
      p_rejection_reason: dto.rejection_reason || null,
    });
    if (error) throw new BadRequestException(error.message);
    await this.audit(db, request, dto.status === 'approved' ? 'owner.approved' : 'owner.rejected', 'vehicle_owner_application', id, {
      status: dto.status,
      rejectionReason: dto.rejection_reason || null,
    });
    return data;
  }

  @Get('vehicles')
  async vehicles(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('vehicles')
      .select('*,owner:profiles!vehicles_owner_id_fkey(full_name,phone)')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('vehicles/:id')
  async verifyVehicle(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    const db = this.client(request);
    const { data: existing, error: readError } = await db
      .from('vehicles')
      .select('id,owner_id,verification_status')
      .eq('id', id)
      .maybeSingle();
    if (readError || !existing) throw new NotFoundException(readError?.message || 'Vehicle not found.');
    if (existing.verification_status !== 'pending') {
      throw new BadRequestException('Only pending vehicles can be reviewed.');
    }
    const approved = dto.status === 'approved';
    if(approved){
      const {data:registration,error:registrationError}=await db.from('owner_documents')
        .select('id').eq('owner_id',existing.owner_id).eq('vehicle_id',id)
        .eq('document_type','vehicle_registration').eq('verification_status','approved').limit(1);
      if(registrationError)throw new BadRequestException(registrationError.message);
      if(!registration?.length)throw new BadRequestException('Approve the vehicle registration document before approving this vehicle.');
    }
    const { data, error } = await db
      .from('vehicles')
      .update({
        is_verified: approved,
        verification_status: approved ? 'approved' : 'rejected',
        verification_rejection_reason: approved ? null : (dto.rejection_reason || 'Vehicle did not meet verification requirements.'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('verification_status', 'pending')
      .select('*')
      .maybeSingle();
    if (error || !data) throw new BadRequestException(error?.message || 'Vehicle review was already completed.');
    await this.audit(db, request, approved ? 'vehicle.approved' : 'vehicle.rejected', 'vehicle', id, {
      status: dto.status,
      rejectionReason: dto.rejection_reason || null,
    });
    return data;
  }

  @Get('safety-alerts')
  async safetyAlerts(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('safety_alerts')
      .select('id,user_id,ride_id,alert_type,message,latitude,longitude,status,created_at,resolved_at,profiles:profiles!safety_alerts_user_id_fkey(full_name,phone)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('safety-alerts/:id')
  async updateSafetyAlert(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const db = this.client(request);
    if (!['acknowledged', 'resolved', 'false_alarm'].includes(body.status)) {
      throw new BadRequestException('Invalid safety alert status.');
    }
    const patch: Record<string, unknown> = { status: body.status };
    if (body.status === 'resolved' || body.status === 'false_alarm') patch.resolved_at = new Date().toISOString();
    const { data, error } = await db
      .from('safety_alerts')
      .update(patch)
      .eq('id', id)
      .in('status', ['open', 'acknowledged'])
      .select('*')
      .maybeSingle();
    if (error || !data) throw new BadRequestException(error?.message || 'Safety alert is already closed or was not found.');
    await this.audit(db, request, 'safety.' + body.status, 'safety_alert', id, { status: body.status });
    return data;
  }

  @Get('payments')
  async payments(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('payments')
      .select('*,payer:profiles!payments_user_id_fkey(full_name,phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('payments/:id')
  async updatePayment(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewPaymentDto,
  ) {
    const db = this.client(request);
    const { data: payment, error: readError } = await db
      .from('payments')
      .select('id,method,status,provider_reference')
      .eq('id', id)
      .maybeSingle();
    if (readError || !payment) throw new NotFoundException(readError?.message || 'Payment not found.');
    if (payment.status !== 'pending') throw new BadRequestException('Only pending payments can be reviewed.');
    if (dto.status === 'paid' && payment.method !== 'cash' && !(['bkash','nagad'].includes(String(payment.method).toLowerCase()) && Boolean(payment.provider_reference))) {
      throw new ForbiddenException('An online wallet payment can only be verified after the passenger submits a transaction ID. No automatic gateway settlement is connected.');
    }
    if (dto.status === 'refunded') throw new BadRequestException('Only a previously paid payment can be refunded.');
    const { data, error } = await db
      .from('payments')
      .update({ status: dto.status })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error || !data) throw new BadRequestException(error?.message || 'Payment status could not be updated.');
    await this.audit(db, request, 'payment.' + dto.status, 'payment', id, { status: dto.status, method: payment.method, transactionReferenceSubmitted: Boolean(payment.provider_reference) });
    return data;
  }

  @Get('users')
  async users(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('profiles')
      .select('id,full_name,phone,role,is_verified,is_active,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: UserStatusDto,
  ) {
    const db = this.client(request);
    if (typeof body.is_active !== 'boolean') throw new BadRequestException('is_active must be true or false.');
    if (id === request.user.id) throw new ForbiddenException('You cannot suspend your own administrator account.');
    const { data: target, error: readError } = await db
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', id)
      .maybeSingle();
    if (readError || !target) throw new NotFoundException(readError?.message || 'User not found.');
    if (target.role === 'admin') throw new ForbiddenException('Administrator accounts cannot be suspended from this screen.');
    const { data, error } = await db
      .from('profiles')
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,full_name,phone,role,is_verified,is_active,created_at')
      .maybeSingle();
    if (error || !data) throw new BadRequestException(error?.message || 'Account status could not be updated.');
    await this.audit(db, request, body.is_active ? 'user.reactivated' : 'user.suspended', 'profile', id, {
      role: target.role,
      isActive: body.is_active,
    });
    return data;
  }

  @Get('rides')
  async rides(@Req() request: AdminRequest) {
    const db = this.client(request);
    const [{ data: requests, error: requestError }, { data: rides, error: ridesError }] = await Promise.all([
      db.from('ride_requests')
        .select('id,passenger_id,pickup_label,destination_label,requested_vehicle,seats_requested,is_shared,women_safety_preference,estimated_distance_km,estimated_duration_minutes,estimated_fare,currency,status,created_at,updated_at,profiles:profiles!ride_requests_passenger_id_fkey(full_name,phone)')
        .order('created_at', { ascending: false }).limit(100),
      db.from('rides')
        .select('id,request_id,driver_id,vehicle_id,status,accepted_at,started_at,completed_at,actual_fare,profiles:profiles!rides_driver_id_fkey(full_name,phone)')
        .order('created_at', { ascending: false }).limit(100),
    ]);
    if (requestError) throw new BadRequestException(requestError.message);
    if (ridesError) throw new BadRequestException(ridesError.message);
    const byRequest = new Map((rides || []).map((ride: any) => [ride.request_id, ride]));
    return (requests || []).map((item: any) => ({ ...item, ride: byRequest.get(item.id) || null }));
  }

  @Get('rental-bookings')
  async rentalBookings(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('rental_bookings')
      .select('id,vehicle_id,renter_id,start_at,end_at,total_amount,currency,status,pickup_note,owner_note,created_at,updated_at,vehicles:vehicles!rental_bookings_vehicle_id_fkey(make,model,plate_number,city,owner_id),renter:profiles!rental_bookings_renter_id_fkey(full_name,phone)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('rental-bookings/:id')
  async updateRentalBooking(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: RentalReviewDto,
  ) {
    const db = this.client(request);
    const { data: booking, error: readError } = await db
      .from('rental_bookings')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();
    if (readError || !booking) throw new NotFoundException(readError?.message || 'Rental booking not found.');
    const allowed: Record<string, string[]> = {
      pending: ['approved', 'rejected', 'cancelled'],
      approved: ['cancelled'],
      active: ['completed', 'cancelled'],
    };
    if (!allowed[booking.status]?.includes(body.status)) {
      throw new BadRequestException('This rental booking cannot move from ' + booking.status + ' to ' + body.status + '.');
    }
    const { data, error } = await db
      .from('rental_bookings')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', booking.status)
      .select('*')
      .maybeSingle();
    if (error || !data) throw new BadRequestException(error?.message || 'Rental booking status could not be updated.');
    await this.audit(db, request, 'rental.' + body.status, 'rental_booking', id, {
      previousStatus: booking.status,
      status: body.status,
    });
    return data;
  }

  @Get('audit-logs')
  async auditLogs(@Req() request: AdminRequest) {
    const db = this.client(request);
    const { data, error } = await db
      .from('admin_audit_logs')
      .select('id,admin_id,action,entity_type,entity_id,details,created_at,admin:profiles!admin_audit_logs_admin_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }
}
