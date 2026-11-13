import {Type} from 'class-transformer';import {IsArray,IsBoolean,IsIn,IsInt,IsNumber,IsOptional,IsString,Max,MaxLength,Min} from 'class-validator';
export class CreateVehicleDto{
 @IsString()@MaxLength(80)make!:string;
 @IsString()@MaxLength(100)model!:string;
 @IsIn(['car','bike','scooter','van','other'])vehicle_type!:string;
 @IsString()@MaxLength(30)plate_number!:string;
 @IsOptional()@IsString()@MaxLength(80)city?:string;
 @IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(60)seats?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(0)price_per_day?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(0)price_per_km?:number;
 @IsOptional()@IsString()@MaxLength(40)color?:string;
 @IsOptional()@Type(()=>Number)@IsInt()@Min(1980)@Max(2100)model_year?:number;
 @IsOptional()@IsString()@MaxLength(1000)description?:string;
 @IsOptional()@IsArray()photo_paths?:string[];
}
export class UpdateVehicleDto{
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(0)price_per_day?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(0)price_per_km?:number;
 @IsOptional()@IsBoolean()is_available?:boolean;
 @IsOptional()@IsString()@MaxLength(1000)description?:string;
}
