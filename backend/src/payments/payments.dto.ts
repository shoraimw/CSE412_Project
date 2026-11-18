import {Type} from 'class-transformer';import {IsIn,IsNumber,IsOptional,IsString,IsUUID,MaxLength,Min,MinLength,Matches} from 'class-validator';
export const CURRENCIES=['BDT','USD','EUR','GBP','INR','AED','SAR','QAR','KWD','OMR','PKR','NPR','MYR','SGD','THB','CNY','JPY','KRW','AUD','CAD','CHF','NZD','TRY','ZAR'] as const;export type CurrencyCode=typeof CURRENCIES[number];
export class CreatePaymentQuoteDto{@Type(()=>Number)@IsNumber()@Min(1)amountBDT!:number;@IsIn(CURRENCIES)currency!:CurrencyCode;@IsOptional()@IsString()@MaxLength(100)rideId?:string;}
export class CreatePaymentIntentDto{@IsOptional()@IsUUID()rideId?:string;@IsOptional()@IsUUID()rentalBookingId?:string;@IsIn(['cash','bkash','nagad'])method!:string;@IsIn(CURRENCIES)currency!:CurrencyCode;}
export class SubmitPaymentReferenceDto {
  @IsString() @MaxLength(64) @MinLength(6) @Matches(/^[A-Za-z0-9_-]{6,64}$/)
  reference!: string;
}
