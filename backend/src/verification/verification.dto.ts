import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class VerificationUploadUrlDto {
  @IsIn(['driver','owner']) applicationType!: 'driver'|'owner';
  @IsIn(['license_front','license_back','national_id','vehicle_registration','business_license','insurance']) documentType!: string;
  @IsString() @MaxLength(120) fileName!: string;
  @IsIn(['image/jpeg','image/png','application/pdf']) contentType!: string;
  @IsInt() @Min(1) @Max(10485760) size!: number;
  @IsOptional() @IsUUID() vehicleId?: string;
}
export class RegisterVerificationDocumentDto {
  @IsIn(['driver','owner']) applicationType!: 'driver'|'owner';
  @IsIn(['license_front','license_back','national_id','vehicle_registration','business_license','insurance']) documentType!: string;
  @IsString() @MaxLength(500) storagePath!: string;
  @IsOptional() @IsUUID() vehicleId?: string;
}
export class ReviewVerificationDocumentDto {
  @IsIn(['approved','rejected']) status!: 'approved'|'rejected';
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}
