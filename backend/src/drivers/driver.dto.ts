import {IsIn,IsInt,IsOptional,IsString,Max,MaxLength,Min} from 'class-validator';import {Type} from 'class-transformer';
export class DriverApplicationDto{@IsString()@MaxLength(80)license_number!:string;@Type(()=>Number)@IsInt()@Min(0)@Max(60)experience_years!:number;@IsIn(['car','bike','cng'])requested_vehicle_type!:string;@IsOptional()@IsString()@MaxLength(500)note?:string;}
export class ReviewDto{@IsIn(['approved','rejected'])status!:string;@IsOptional()@IsString()@MaxLength(500)rejection_reason?:string;}
export class ReviewPaymentDto{@IsIn(['paid','failed','refunded'])status!:string;}

export class DriverDocumentDto{@IsIn(['license_front','license_back','national_id','vehicle_registration'])document_type!:string;@IsString()@MaxLength(500)storage_path!:string;}
