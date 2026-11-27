import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { getDriveRuntimeConfig } from '../config/runtime-config';
import { CURRENCIES, CurrencyCode, CreatePaymentIntentDto } from './payments.dto';

const GATEWAY_CURRENCIES:CurrencyCode[]=['BDT','USD','EUR','SGD','INR','MYR'];
@Injectable()
export class PaymentsService {
  private cachedRates:{rates:Record<string,number>;fetchedAt:number}|null=null;
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService){}
  private db(token:string){return this.database.userClient(token);}

  async getRates(){
    if(this.cachedRates&&Date.now()-this.cachedRates.fetchedAt<3600000){
      return {base:'BDT',rates:this.pickRates(this.cachedRates.rates),fetchedAt:new Date(this.cachedRates.fetchedAt).toISOString(),cached:true};
    }
    try{
      const response=await fetch('https://open.er-api.com/v6/latest/BDT',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('FX provider request failed');
      const data:any=await response.json();
      if(data.result!=='success'||!data.rates)throw new Error('Invalid FX response');
      this.cachedRates={rates:data.rates,fetchedAt:Date.now()};
      return {base:'BDT',rates:this.pickRates(data.rates),fetchedAt:new Date().toISOString(),cached:false,provider:'open.er-api.com'};
    }catch{
      if(this.cachedRates)return {base:'BDT',rates:this.pickRates(this.cachedRates.rates),fetchedAt:new Date(this.cachedRates.fetchedAt).toISOString(),cached:true,stale:true};
      throw new ServiceUnavailableException('Live exchange rates are temporarily unavailable.');
    }
  }

  private pickRates(all:Record<string,number>){
    return Object.fromEntries(CURRENCIES.map(code=>[code,code==='BDT'?1:Number(all[code]||0)]).filter(([,rate])=>Number(rate)>0));
  }

  async createQuote(amountBDT:number,currency:CurrencyCode,rideId?:string){
    if(!Number.isFinite(amountBDT)||amountBDT<=0)throw new BadRequestException('A positive BDT amount is required.');
    if(!CURRENCIES.includes(currency))throw new BadRequestException('Unsupported currency.');
    const rates=currency==='BDT'?{rates:{BDT:1},fetchedAt:new Date().toISOString()}:await this.getRates();
    const rate=rates.rates[currency];
    if(typeof rate!=='number'||!Number.isFinite(rate)||rate<=0)throw new ServiceUnavailableException('Exchange rate unavailable.');
    const converted=Number((amountBDT*rate).toFixed(2));
    return {
      quoteId:'quote_'+randomUUID(),rideId:rideId||null,
      originalAmount:Number(amountBDT.toFixed(2)),originalCurrency:'BDT',
      convertedAmount:converted,currency,exchangeRate:rate,rateFetchedAt:rates.fetchedAt,
      gateway:'SSLCOMMERZ',gatewaySupported:GATEWAY_CURRENCIES.includes(currency),
      gatewaySettlementCurrency:'BDT',status:'quote_only',paymentCollected:false,
      message:'Indicative conversion only. SSLCOMMERZ applies its own conversion rate at checkout; the final BDT settlement amount may differ.',
    };
  }

  async createIntent(userId:string,token:string,dto:CreatePaymentIntentDto,email?:string){
    if(Boolean(dto.rideId)===Boolean(dto.rentalBookingId))throw new BadRequestException('Provide exactly one rideId or rentalBookingId.');
    const db=this.db(token);
    let baseAmount=0,rideId:string|null=null,rentalBookingId:string|null=null;
    if(dto.rideId){
      const {data:ride,error:rideError}=await db.from('rides')
        .select('id,status,actual_fare,ride_requests(requested_vehicle,estimated_fare)')
        .eq('id',dto.rideId).maybeSingle();
      if(rideError||!ride)throw new NotFoundException('Ride not found.');
      if(ride.status!=='completed'||ride.actual_fare==null)throw new BadRequestException('Ride payment becomes available after the final fare is calculated.');
      const {data:membership,error:membershipError}=await db.from('ride_passengers')
        .select('fare_share').eq('ride_id',ride.id).eq('passenger_id',userId).maybeSingle();
      if(membershipError||!membership)throw new NotFoundException('You are not a passenger on this ride.');
      baseAmount=Number(membership.fare_share??ride.actual_fare);
      rideId=ride.id;
    }
    if(dto.rentalBookingId){
      const {data,error}=await db.from('rental_bookings')
        .select('id,renter_id,total_amount,status').eq('id',dto.rentalBookingId).maybeSingle();
      if(error||!data||data.renter_id!==userId)throw new NotFoundException('Rental booking not found.');
      if(data.status!=='approved')throw new BadRequestException('The vehicle owner must approve the rental before payment.');
      baseAmount=Number(data.total_amount);rentalBookingId=data.id;
    }
    if(!Number.isFinite(baseAmount)||baseAmount<1)throw new BadRequestException('The payable amount is invalid.');

    if(dto.method==='card'){
      const config=getDriveRuntimeConfig();
      if(!config.sslcommerzStoreId||!config.sslcommerzStorePassword){
        throw new ServiceUnavailableException('SSLCOMMERZ is not configured. Add its sandbox or live Store ID and Store Password as Cloudflare Worker secrets.');
      }
      if(!config.supabaseServiceRoleKey){
        throw new ServiceUnavailableException('Online payment callbacks are not enabled yet. Add SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Worker secret before accepting gateway payments.');
      }
      if(!GATEWAY_CURRENCIES.includes(dto.currency))throw new BadRequestException('This currency is not enabled for SSLCOMMERZ checkout.');
      if(baseAmount<10)throw new BadRequestException('SSLCOMMERZ requires a minimum settlement amount equivalent to BDT 10.');
      const quote=await this.createQuote(baseAmount,dto.currency,rideId||undefined);
      const {data:profile,error:profileError}=await db.from('profiles').select('full_name,phone').eq('id',userId).single();
      if(profileError||!profile)throw new NotFoundException('Customer profile not found.');
      if(!email)throw new BadRequestException('A verified email address is required for online checkout.');
      const phone=String(profile.phone||'').trim();
      if(!/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s()-]/g,'')))throw new BadRequestException('Add a valid contact phone number in your profile before online checkout.');
      const tranId='DRV'+Date.now().toString(36).toUpperCase()+randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();
      const {data:payment,error}=await db.from('payments').insert({
        user_id:userId,ride_id:rideId,rental_booking_id:rentalBookingId,
        amount:quote.convertedAmount,currency:dto.currency,method:'card',status:'pending',
        base_amount_bdt:baseAmount,exchange_rate:quote.exchangeRate,rate_fetched_at:quote.rateFetchedAt,
        gateway_name:'sslcommerz',gateway_transaction_id:tranId,gateway_currency:dto.currency,gateway_status:'CREATING_SESSION',
        provider_reference:tranId,
      }).select('*').single();
      if(error||!payment)throw new BadRequestException(error?.message||'Payment intent could not be created.');
      try{
        const session=await this.createSslcommerzSession({
          paymentId:payment.id,userId,email,customerName:profile.full_name||'DRIVE Customer',
          phone:phone.replace(/[\s()-]/g,''),amount:quote.convertedAmount,currency:dto.currency,tranId,
          productName:rideId?'DRIVE completed ride fare':'DRIVE vehicle rental',
        });
        const {data:updated,error:updateError}=await db.from('payments').update({
          gateway_status:'SESSION_CREATED',
          gateway_payload:{sessionKey:session.sessionkey||null,sessionCreatedAt:new Date().toISOString()},
        }).eq('id',payment.id).select('*').single();
        if(updateError||!updated)throw new Error(updateError?.message||'Could not save the payment session.');
        return {
          payment:updated,checkoutUrl:session.GatewayPageURL,
          originalAmountBDT:baseAmount,convertedAmount:quote.convertedAmount,currency:dto.currency,
          exchangeRate:quote.exchangeRate,rateFetchedAt:quote.rateFetchedAt,
          gateway:'SSLCOMMERZ',gatewaySettlementCurrency:'BDT',paymentCollected:false,
          message:'Secure SSLCOMMERZ checkout created. Payment remains pending until the gateway validation API confirms it.',
        };
      }catch(error){
        await db.from('payments').update({status:'failed',gateway_status:'SESSION_FAILED'}).eq('id',payment.id).eq('status','pending');
        throw new ServiceUnavailableException(error instanceof Error?error.message:'Could not start SSLCOMMERZ checkout.');
      }
    }

    if(dto.currency!=='BDT')throw new BadRequestException('Cash, bKash and Nagad manual settlement is BDT-only. Choose SSLCOMMERZ for supported foreign-currency checkout.');
    const method=dto.method;
    const {data,error}=await db.from('payments').insert({
      user_id:userId,ride_id:rideId,rental_booking_id:rentalBookingId,
      amount:baseAmount,currency:'BDT',method,status:'pending',
      base_amount_bdt:baseAmount,exchange_rate:1,rate_fetched_at:new Date().toISOString(),
    }).select('*').single();
    if(error||!data)throw new BadRequestException(error?.message||'Payment intent could not be created.');
    return {
      payment:data,originalAmountBDT:baseAmount,convertedAmount:baseAmount,currency:'BDT',
      exchangeRate:1,paymentCollected:false,gatewayConfigured:method==='cash',
      message:method==='cash'?'Cash payment recorded as pending. The driver or rental owner must confirm receipt.':'Submit your bKash/Nagad transaction reference. An administrator must verify it in the merchant account; no money is collected automatically.',
    };
  }

  private async createSslcommerzSession(input:{
    paymentId:string;userId:string;email:string;customerName:string;phone:string;
    amount:number;currency:CurrencyCode;tranId:string;productName:string;
  }){
    const config=getDriveRuntimeConfig();
    const base=config.sslcommerzMode==='live'?'https://securepay.sslcommerz.com':'https://sandbox.sslcommerz.com';
    const publicUrl=config.appBaseUrl.replace(/\/+$/,'');
    const callback=publicUrl+'/api/payments/sslcommerz';
    const form=new URLSearchParams({
      store_id:config.sslcommerzStoreId,
      store_passwd:config.sslcommerzStorePassword,
      total_amount:input.amount.toFixed(2),
      currency:input.currency,
      tran_id:input.tranId,
      success_url:callback+'/success',
      fail_url:callback+'/fail',
      cancel_url:callback+'/cancel',
      ipn_url:callback+'/ipn',
      cus_name:input.customerName.slice(0,50),
      cus_email:input.email.slice(0,50),
      cus_add1:'Dhaka',
      cus_city:'Dhaka',
      cus_state:'Dhaka',
      cus_postcode:'1000',
      cus_country:'Bangladesh',
      cus_phone:input.phone.slice(0,20),
      shipping_method:'NO',
      num_of_item:'1',
      product_name:input.productName.slice(0,200),
      product_category:'Transportation',
      product_profile:'general',
      value_a:input.paymentId,
      value_b:input.userId,
      value_c:'DRIVE',
    });
    const response=await fetch(base+'/gwprocess/v4/api.php',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:form.toString(),
      signal:AbortSignal.timeout(12000),
    });
    const result:any=await response.json().catch(()=>null);
    if(!response.ok||result?.status!=='SUCCESS'||!result?.GatewayPageURL){
      throw new Error(result?.failedreason||'SSLCOMMERZ did not return a hosted checkout URL.');
    }
    return result;
  }

  async handleSslcommerzNotification(body:any){
    const tranId=String(body?.tran_id||'').trim();
    const valId=String(body?.val_id||'').trim();
    if(!tranId||!valId)throw new BadRequestException('Gateway transaction and validation references are required.');
    const config=getDriveRuntimeConfig();
    if(!config.sslcommerzStoreId||!config.sslcommerzStorePassword)throw new ServiceUnavailableException('SSLCOMMERZ validation credentials are not configured.');
    const admin=this.database.serviceClient();
    const {data:payment,error:paymentError}=await admin.from('payments').select('*')
      .eq('gateway_name','sslcommerz').eq('gateway_transaction_id',tranId).maybeSingle();
    if(paymentError||!payment)throw new NotFoundException('DRIVE payment intent not found.');
    if(payment.status==='paid')return {paymentId:payment.id,status:'paid',receiptNumber:payment.receipt_number,alreadyFinalized:true};

    const base=config.sslcommerzMode==='live'?'https://securepay.sslcommerz.com':'https://sandbox.sslcommerz.com';
    const query=new URLSearchParams({
      val_id:valId,store_id:config.sslcommerzStoreId,
      store_passwd:config.sslcommerzStorePassword,format:'json',
    });
    const response=await fetch(base+'/validator/api/validationserverAPI.php?'+query.toString(),{
      method:'GET',signal:AbortSignal.timeout(12000),
    });
    if(!response.ok)throw new ServiceUnavailableException('Could not reach the SSLCOMMERZ validation API.');
    const validation:any=await response.json().catch(()=>null);
    if(!validation||!['VALID','VALIDATED'].includes(String(validation.status||'').toUpperCase())){
      const status=String(validation?.status||'VALIDATION_FAILED').toUpperCase();
      if(status==='INVALID_TRANSACTION'){
        await admin.from('payments').update({status:'failed',gateway_status:status})
          .eq('id',payment.id).eq('status','pending');
        return {paymentId:payment.id,status:'failed',message:'Gateway validation rejected this transaction.'};
      }
      throw new BadRequestException('SSLCOMMERZ could not validate this transaction.');
    }
    if(String(validation.tran_id||'')!==tranId||String(validation.val_id||'')!==valId){
      throw new BadRequestException('Gateway validation references do not match the payment intent.');
    }
    const currency=String(validation.currency_type||validation.currency||'').toUpperCase();
    const currencyAmount=Number(validation.currency_amount??validation.amount);
    if(currency!==String(payment.currency).toUpperCase()||!Number.isFinite(currencyAmount)||Math.abs(currencyAmount-Number(payment.amount))>0.02){
      await admin.from('payments').update({gateway_status:'VALIDATION_MISMATCH'})
        .eq('id',payment.id).eq('status','pending');
      throw new BadRequestException('Validated currency or amount does not match the original DRIVE payment intent.');
    }
    const riskLevel=Number(validation.risk_level??1);
    if(riskLevel!==0){
      await admin.from('payments').update({
        gateway_status:'risk_hold',gateway_validation_id:valId,
        gateway_amount_bdt:Number(validation.amount||0),
        gateway_payload:{riskLevel,cardType:validation.card_type||null,riskTitle:validation.risk_title||null},
      }).eq('id',payment.id).eq('status','pending');
      return {paymentId:payment.id,status:'risk_hold',message:'Payment is held for administrator review because the gateway flagged a risk.'};
    }
    const amountBdt=Number(validation.amount);
    if(!Number.isFinite(amountBdt)||amountBdt<10||amountBdt>500000){
      throw new BadRequestException('Validated BDT settlement amount is outside the gateway limits.');
    }
    if(currency==='BDT'&&Math.abs(amountBdt-Number(payment.amount))>0.02){
      throw new BadRequestException('Validated BDT amount does not match the DRIVE payment.');
    }
    const receiptNumber='DRIVE-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();
    const patch={
      status:'paid',gateway_status:'VALID',gateway_validation_id:valId,
      gateway_currency:currency,gateway_amount_bdt:amountBdt,
      gateway_fee_bdt:Math.max(0,amountBdt-Number(validation.store_amount||amountBdt)),
      exchange_rate:Number(validation.currency_rate||payment.exchange_rate||1),
      provider_reference:String(validation.bank_tran_id||payment.provider_reference||''),
      receipt_number:receiptNumber,paid_at:new Date().toISOString(),
      gateway_payload:{cardType:validation.card_type||null,cardBrand:validation.card_brand||null,riskLevel,currencyRate:Number(validation.currency_rate||1),settlementCurrency:'BDT'},
    };
    const {data:updated,error:updateError}=await admin.from('payments').update(patch)
      .eq('id',payment.id).eq('status','pending').select('*').maybeSingle();
    if(updateError)throw new ServiceUnavailableException(updateError.message);
    if(updated)return {paymentId:updated.id,status:'paid',receiptNumber:updated.receipt_number,alreadyFinalized:false};
    const {data:current}=await admin.from('payments').select('id,status,receipt_number').eq('id',payment.id).maybeSingle();
    if(current?.status==='paid')return {paymentId:current.id,status:'paid',receiptNumber:current.receipt_number,alreadyFinalized:true};
    throw new ServiceUnavailableException('Payment status could not be finalized. It remains available for reconciliation.');
  }

  async markSslcommerzFailed(body:any,status:'FAILED'|'CANCELLED'){
    const tranId=String(body?.tran_id||'').trim();
    if(!tranId)throw new BadRequestException('Gateway transaction reference is required.');
    const admin=this.database.serviceClient();
    const {data,error}=await admin.from('payments').update({
      status:'failed',gateway_status:status,
    }).eq('gateway_name','sslcommerz').eq('gateway_transaction_id',tranId).eq('status','pending')
      .select('id,status').maybeSingle();
    if(error)throw new ServiceUnavailableException(error.message);
    if(data)return {paymentId:data.id,status:'failed'};
    const {data:current}=await admin.from('payments').select('id,status,receipt_number')
      .eq('gateway_name','sslcommerz').eq('gateway_transaction_id',tranId).maybeSingle();
    if(!current)throw new NotFoundException('DRIVE payment intent not found.');
    return {paymentId:current.id,status:current.status,receiptNumber:current.receipt_number};
  }

  async submitReference(userId:string,token:string,paymentId:string,reference:string){
    const clean=reference.trim();
    if(!/^[A-Za-z0-9_-]{6,64}$/.test(clean))throw new BadRequestException('Enter a valid 6–64 character transaction ID.');
    const {data,error}=await this.db(token).rpc('drive_submit_payment_reference',{p_payment_id:paymentId,p_reference:clean});
    if(error||!data)throw new BadRequestException(error?.message||'Transaction reference could not be submitted.');
    return {payment:data,message:'Transaction ID submitted. Your payment remains pending until a DRIVE administrator verifies it in the merchant account.'};
  }

  async history(userId:string,token:string){
    const {data,error}=await this.db(token).from('payments').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(100);
    if(error)throw new ServiceUnavailableException(error.message);
    return data||[];
  }

  async paymentStatus(userId:string,token:string,paymentId:string){
    const {data,error}=await this.db(token).from('payments')
      .select('id,status,method,currency,amount,base_amount_bdt,gateway_name,gateway_status,gateway_amount_bdt,receipt_number,paid_at,created_at,ride_id,rental_booking_id')
      .eq('id',paymentId).eq('user_id',userId).maybeSingle();
    if(error||!data)throw new NotFoundException('Payment record not found.');
    return {
      ...data,
      effectiveStatus:data.gateway_status==='risk_hold'?'risk_hold':data.status,
      settlementAmountBDT:data.gateway_amount_bdt==null?null:Number(data.gateway_amount_bdt),
    };
  }

  async receipt(userId:string,token:string,paymentId:string){
    const {data,error}=await this.db(token).from('payments').select('*').eq('id',paymentId).eq('user_id',userId).maybeSingle();
    if(error||!data)throw new NotFoundException('Payment record not found.');
    if(data.status!=='paid'||!data.receipt_number)throw new BadRequestException('A receipt is available only after payment is confirmed.');
    return {
      receiptNumber:data.receipt_number,paymentId:data.id,paidAt:data.paid_at||data.updated_at,
      amount:Number(data.amount),currency:data.currency,baseAmountBDT:Number(data.base_amount_bdt||data.amount),
      exchangeRate:data.exchange_rate?Number(data.exchange_rate):1,settlementAmountBDT:data.gateway_amount_bdt?Number(data.gateway_amount_bdt):Number(data.amount),
      gateway:data.gateway_name||'manual',method:data.method,providerReference:data.provider_reference||null,
      rideId:data.ride_id,rentalBookingId:data.rental_booking_id,status:data.status,
    };
  }

  supportedCurrencies(){return CURRENCIES;}
}
