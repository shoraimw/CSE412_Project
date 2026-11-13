import {IsString,IsUUID,Matches,MaxLength} from 'class-validator';
export class CreateBookingDto{
 @IsUUID()vehicle_id!:string;
 @IsString()@MaxLength(100)customer_name!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/)start_date!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/)end_date!:string;
}