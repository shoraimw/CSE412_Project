import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { ReviewDto, ReviewPaymentDto } from '../drivers/driver.dto';

type AdminRequest = Request & {
  user: { id: string; accessToken: string; role: string };
};

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private assertAdmin(request: AdminRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Administrator access required.');
    }
  }

  @Get('driver-applications')
  async applications(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .from('driver_applications')
      .select('*,applicant:profiles!driver_applications_user_id_fkey(full_name,phone)')
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
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .rpc('drive_admin_review_driver_application', {
        p_application_id: id,
        p_status: dto.status,
        p_rejection_reason: dto.rejection_reason || null,
      });
    if (error) {
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      if (error.code === '40001') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    if (!data) throw new NotFoundException('Driver application not found.');
    return {
      application: data,
      message: dto.status === 'approved'
        ? 'Approved. Driver verification is complete and driver access is enabled.'
        : 'Application rejected.',
    };
  }

  @Get('driver-documents')
  async documents(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .from('driver_documents')
      .select('*,driver:profiles!driver_documents_driver_id_fkey(full_name,phone)')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  @Patch('driver-documents/:id')
  async reviewDocument(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    this.assertAdmin(request);
    const db = this.db.userClient(request.user.accessToken);
    const { data: document, error } = await db.from('driver_documents')
      .update({
        verification_status: dto.status,
        reviewer_id: request.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: dto.rejection_reason || null,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error || !document) {
      throw new BadRequestException(error?.message || 'Document not found.');
    }

    const { data: approvedDocuments, error: documentsError } = await db
      .from('driver_documents')
      .select('document_type')
      .eq('driver_id', document.driver_id)
      .eq('verification_status', 'approved');
    if (documentsError) throw new BadRequestException(documentsError.message);

    const required = ['license_front', 'license_back', 'national_id'];
    const fullyVerified = dto.status === 'approved'
      && required.every(type => (approvedDocuments || []).some(row => row.document_type === type));
    const { error: profileError } = await db.from('profiles')
      .update({ is_verified: fullyVerified })
      .eq('id', document.driver_id);
    if (profileError) throw new BadRequestException(profileError.message);
    return { document, driverVerified: fullyVerified };
  }

  @Get('vehicles')
  async vehicles(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
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
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .from('vehicles')
      .update({
        verification_status: dto.status,
        is_verified: dto.status === 'approved',
        verification_rejection_reason: dto.status === 'rejected'
          ? (dto.rejection_reason?.trim() || 'Vehicle did not meet verification requirements.')
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('verification_status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pending vehicle not found or already reviewed.');
    return data;
  }

  @Get('payments')
  async payments(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
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
    this.assertAdmin(request);
    const db = this.db.userClient(request.user.accessToken);
    const { data: payment, error: readError } = await db.from('payments')
      .select('id,method,status')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw new BadRequestException(readError.message);
    if (!payment) throw new NotFoundException('Payment not found.');

    if (dto.status === 'paid' && (payment.method !== 'cash' || payment.status !== 'pending')) {
      throw new ForbiddenException('Only a pending cash payment can be marked as received in person.');
    }
    if (dto.status === 'failed' && payment.status !== 'pending') {
      throw new BadRequestException('Only a pending payment can be marked as failed.');
    }
    if (dto.status === 'refunded' && payment.status !== 'paid') {
      throw new BadRequestException('Only a paid payment can be marked as refunded.');
    }

    const { data, error } = await db.from('payments')
      .update({ status: dto.status })
      .eq('id', id)
      .eq('status', payment.status)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new ConflictException('Payment status changed. Refresh the queue and try again.');
    return data;
  }

  @Get('owner-applications')
  async ownerApplications(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .from('vehicle_owner_applications')
      .select('*,applicant:profiles!vehicle_owner_applications_user_id_fkey(full_name,phone)')
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
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .rpc('drive_admin_review_owner_application', {
        p_application_id: id,
        p_status: dto.status,
        p_rejection_reason: dto.rejection_reason || null,
      });
    if (error) {
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    if (!data) throw new NotFoundException('Vehicle owner application not found.');
    return {
      application: data,
      message: dto.status === 'approved'
        ? 'Vehicle owner account approved.'
        : 'Application rejected.',
    };
  }

  @Get('safety-alerts')
  async safetyAlerts(@Req() request: AdminRequest) {
    this.assertAdmin(request);
    const { data, error } = await this.db.userClient(request.user.accessToken)
      .from('safety_alerts')
      .select('id,user_id,ride_id,alert_type,message,latitude,longitude,status,created_at,resolved_at,reporter:profiles!safety_alerts_user_id_fkey(full_name,phone)')
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
    this.assertAdmin(request);
    if (!['acknowledged', 'resolved', 'false_alarm'].includes(body.status)) {
      throw new BadRequestException('Invalid safety alert status.');
    }

    const db = this.db.userClient(request.user.accessToken);
    const { data: current, error: readError } = await db.from('safety_alerts')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw new BadRequestException(readError.message);
    if (!current) throw new NotFoundException('Safety alert not found.');

    const transitions: Record<string, string[]> = {
      open: ['acknowledged', 'resolved', 'false_alarm'],
      acknowledged: ['resolved', 'false_alarm'],
    };
    if (!transitions[current.status]?.includes(body.status)) {
      throw new ConflictException('This safety alert has already been closed or its status has changed.');
    }

    const { data, error } = await db.from('safety_alerts')
      .update({
        status: body.status,
        resolved_at: ['resolved', 'false_alarm'].includes(body.status) ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('status', current.status)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new ConflictException('Safety alert status changed. Refresh the queue and try again.');
    return data;
  }
}
