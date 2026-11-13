import {IsString,MaxLength,MinLength} from 'class-validator';
export class OwnerApplicationDto {
  @IsString() @MinLength(2) @MaxLength(120) business_name!: string;
  @IsString() @MinLength(7) @MaxLength(30) contact_phone!: string;
  @IsString() @MinLength(5) @MaxLength(300) business_address!: string;
  @IsString() @MaxLength(500) note?: string;
}