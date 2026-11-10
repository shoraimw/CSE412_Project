import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED'] as const;
export type CurrencyCode = typeof CURRENCIES[number];

export class CreatePaymentQuoteDto {
  @Type(() => Number) @IsNumber() @Min(1) amountBDT!: number;
  @IsIn(CURRENCIES) currency!: CurrencyCode;
  @IsOptional() @IsString() @MaxLength(100) rideId?: string;
}