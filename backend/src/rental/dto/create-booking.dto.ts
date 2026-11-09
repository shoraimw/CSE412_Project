import { IsInt, IsString, MaxLength, Min, Matches } from 'class-validator';
export class CreateBookingDto {
  @IsInt() @Min(1) vehicle_id!: number;
  @IsString() @MaxLength(100) customer_name!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start_date!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end_date!: string;
}