import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsIn(['en','bn']) preferred_language?: 'en'|'bn';
  @IsOptional() @IsIn(['BDT','USD','EUR','GBP','INR','SGD','MYR','AED','SAR','AUD','CAD','CNY','JPY','THB','NPR','PKR']) preferred_currency?: string;
}
