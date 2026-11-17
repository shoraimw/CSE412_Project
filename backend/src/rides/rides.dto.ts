import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsIn,IsNumber,IsOptional,IsString,Max,MaxLength,Min,ValidateNested} from 'class-validator';
export class CreateRideDto{
 @IsString()@MaxLength(160)pickupAddress!:string;
 @IsString()@MaxLength(160)destinationAddress!:string;
 @IsIn(['car','bike','cng'])vehicleType!:'car'|'bike'|'cng';
 @IsOptional()@IsBoolean()isShared?:boolean;
 @IsOptional()@IsBoolean()womenSafetyPreference?:boolean;
 @IsOptional()@ValidateNested()@Type(()=>RideLocationDto)safetyInitialLocation?:RideLocationDto;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(1)@Max(8)seatsRequested?:number;
 @IsOptional()@IsString()@MaxLength(500)notes?:string;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(-90)@Max(90)pickupLat?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(-180)@Max(180)pickupLng?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(-90)@Max(90)destinationLat?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(-180)@Max(180)destinationLng?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(0.1)@Max(1000)routeDistanceKm?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(1)@Max(1440)routeDurationMinutes?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(1)@Max(1440)routeStaticDurationMinutes?:number;
 @IsOptional()@Type(()=>Number)@IsNumber()@Min(1)@Max(2.5)trafficRatio?:number;
 @IsOptional()@IsBoolean()trafficDataAvailable?:boolean;
 @IsOptional()@IsString()@MaxLength(80)routeProvider?:string;
 @IsOptional()@IsIn(['fastest','shortest','balanced'])routePreference?:'fastest'|'shortest'|'balanced';
 @IsOptional()@IsIn(['light','moderate','heavy'])traffic?:'light'|'moderate'|'heavy';
 @IsOptional()@IsIn(['low','medium','high'])demand?:'low'|'medium'|'high';
 @IsOptional()@IsIn(['offPeak','peak'])time?:'offPeak'|'peak';
 @IsOptional()@IsArray()@ArrayMinSize(2)@ArrayMaxSize(100)@ValidateNested({each:true})@Type(()=>RideLocationDto)safetyPlannedRoute?:RideLocationDto[];
}
export class RideLocationDto{@Type(()=>Number)@IsNumber()@Min(-90)@Max(90)lat!:number;@Type(()=>Number)@IsNumber()@Min(-180)@Max(180)lng!:number;}
export class RideStatusDto{@IsIn(['driver_arriving','in_progress','completed','cancelled'])status!:string;}
