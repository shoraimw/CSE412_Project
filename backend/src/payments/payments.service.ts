import { BadRequestException,Injectable,NotFoundException,ServiceUnavailableException, Inject } from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {CURRENCIES,CurrencyCode,CreatePaymentIntentDto} from './payments.dto';
@Injectable()
export class PaymentsService{
 private cachedRates:{rates:Record<string,number>;fetchedAt:number}|null=null;
 constructor(@Inject(DatabaseService) private readonly database:DatabaseService){}
 async getRates(){if(this.cachedRates&&Date.now()-this.cachedRates.fetchedAt<3600000)return {base:'BDT',rates:this.pickRates(this.cachedRates.rates),fetchedAt:new Date(this.cachedRates.fetchedAt).toISOString(),cached:true};try{const response=await fetch('https://open.er-api.com/v6/latest/BDT',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('FX provider request failed');const data:any=await response.json();if(data.result!=='success'||!data.rates)throw new Error('Invalid FX response');this.cachedRates={rates:data.rates,fetchedAt:Date.now()};return {base:'BDT',rates:this.pickRates(data.rates),fetchedAt:new Date().toISOString(),cached:false,provider:'open.er-api.com'};}catch{if(this.cachedRates)return {base:'BDT',rates:this.pickRates(this.cachedRates.rates),fetchedAt:new Date(this.cachedRates.fetchedAt).toISOString(),cached:true,stale:true};throw new ServiceUnavailableException('Live exchange rates are temporarily unavailable.');}}
 private pickRates(all:Record<string,number>){
  const rates:Record<string,number>={BDT:1};
  for(const code of CURRENCIES){
   if(code==='BDT')continue;
   const rate=Number(all[code]);
   if(Number.isFinite(rate)&&rate>0)rates[code]=rate;
  }
  return rates;
 }
 async createQuote(amountBDT:number,currency:CurrencyCode,rideId?:string){const rates=currency==='BDT'?{rates:{BDT:1},fetchedAt:new Date().toISOString()}:await this.getRates();const rate=rates.rates[currency];if(typeof rate!=='number')throw new ServiceUnavailableException('Exchange rate unavailable.');const converted=Number((amountBDT*rate).toFixed(2));return {quoteId:'quote_'+Date.now(),rideId:rideId||null,originalAmount:amountBDT,originalCurrency:'BDT',convertedAmount:converted,currency,exchangeRate:rate,rateFetchedAt:rates.fetchedAt,status:'quote_only',paymentGateway:null,paymentCollected:false,message:'Currency conversion quote only. No payment has been initiated or collected.'};}
 async createIntent(userId:string,token:string,dto:CreatePaymentIntentDto){if(dto.method==='card')throw new BadRequestException('Card gateway is not configured. Choose bKash, Nagad or cash.');if(dto.currency!=='BDT')throw new BadRequestException('Settlement through bKash, Nagad or cash is currently BDT-only. Use the currency converter for indicative foreign-currency quotes.');if(Boolean(dto.rideId)===Boolean(dto.rentalBookingId))throw new BadRequestException('Provide exactly one rideId or rentalBookingId.');const db=this.database.userClient(token);let baseAmount=0;let rideId:string|null=null;let rentalBookingId:string|null=null;
  if(dto.rideId){
    const {data:ride,error:rideError}=await db.from('rides').select('id,status').eq('id',dto.rideId).maybeSingle();
    if(rideError||!ride)throw new NotFoundException('Ride not found.');
    if(!['completed','in_progress'].includes(ride.status))throw new BadRequestException('Ride payment is available after the trip starts or completes.');
    const {data:membership,error:membershipError}=await db.from('ride_passengers')
      .select('fare_share').eq('ride_id',ride.id).eq('passenger_id',userId).maybeSingle();
    if(membershipError||!membership)throw new NotFoundException('You are not a passenger on this ride.');
    baseAmount=Number(membership.fare_share);
    rideId=ride.id;
  }
  if(dto.rentalBookingId){const {data,error}=await db.from('rental_bookings').select('id,renter_id,total_amount,status').eq('id',dto.rentalBookingId).maybeSingle();if(error||!data||data.renter_id!==userId)throw new NotFoundException('Rental booking not found.');if(!['approved','active'].includes(data.status))throw new BadRequestException('The vehicle owner must approve the rental before payment.');baseAmount=Number(data.total_amount);rentalBookingId=data.id;}
  if(!Number.isFinite(baseAmount)||baseAmount<=0)throw new BadRequestException('The payable amount is invalid.');const quote=await this.createQuote(baseAmount,dto.currency,rideId||undefined);const {data,error}=await db.from('payments').insert({user_id:userId,ride_id:rideId,rental_booking_id:rentalBookingId,amount:quote.convertedAmount,currency:dto.currency,method:dto.method,status:'pending'}).select('*').single();if(error||!data)throw new BadRequestException(error?.message||'Payment intent could not be created.');return {payment:data,originalAmountBDT:baseAmount,convertedAmount:quote.convertedAmount,currency:dto.currency,exchangeRate:quote.exchangeRate,paymentCollected:false,gatewayConfigured:false,message:dto.method==='cash'?'Cash payment recorded as pending; settle after the trip or rental.':'Payment intent recorded as pending. A payment gateway is not connected, so no money has been collected.'};}
 async submitReference(userId:string,token:string,paymentId:string,reference:string){
  const clean=reference.trim();
  if(!/^[A-Za-z0-9_-]{6,64}$/.test(clean))throw new BadRequestException('Enter a valid 6–64 character transaction ID.');
  const {data,error}=await this.database.userClient(token).rpc('drive_submit_payment_reference',{
    p_payment_id:paymentId,p_reference:clean,
  });
  if(error||!data)throw new BadRequestException(error?.message||'Transaction reference could not be submitted.');
  return {payment:data,message:'Transaction ID submitted. Your payment remains pending until a DRIVE administrator verifies it in the merchant account.'};
 }
 async history(userId:string,token:string){const {data,error}=await this.database.userClient(token).from('payments').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(100);if(error)throw new ServiceUnavailableException(error.message);return data||[];}
 supportedCurrencies(){return CURRENCIES;}
}