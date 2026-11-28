import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EstimateFareDto, VEHICLE_RATES } from './fare.dto';

@Injectable()
export class FareService {
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService){}

  async estimate(input:EstimateFareDto,demand?:{openRequests:number;availableDrivers:number}){
    const fallback=VEHICLE_RATES[input.vehicleType];
    if(!fallback||!Number.isFinite(input.distanceKm)||input.distanceKm<=0){
      throw new BadRequestException('A positive route distance and supported vehicle type are required.');
    }
    // Keep estimates available for the university demo if the optional
    // admin-managed fare_rules read is temporarily unavailable.
    // Database rates take priority; VEHICLE_RATES are safe BDT defaults.
    let rule: {
      base_fare?: number | string;
      per_km?: number | string;
      per_minute?: number | string;
      peak_hour_multiplier?: number | string;
      demand_multiplier_cap?: number | string;
    } | null = null;
    try {
      const result = await this.database.publicClient().from('fare_rules')
        .select('base_fare,per_km,per_minute,peak_hour_multiplier,demand_multiplier_cap')
        .eq('vehicle_type',input.vehicleType).eq('is_active',true).maybeSingle();
      if (result.error) {
        console.warn('DRIVE fare_rules read failed; using built-in BDT rates:', result.error.message);
      } else {
        rule = result.data;
      }
    } catch (error) {
      console.warn('DRIVE fare configuration unavailable; using built-in BDT rates:', error);
    }
    const baseFare=Number(rule?.base_fare??fallback.base);
    const perKm=Number(rule?.per_km??fallback.perKm);
    const perMinute=Number(rule?.per_minute??0);
    const peakMultiplier=Number(rule?.peak_hour_multiplier??1);
    const demandCap=Number(rule?.demand_multiplier_cap??1);
    const durationMinutes=Math.max(1,Math.round(input.durationMinutes||input.distanceKm/fallback.speedKmh*60));
    const hourParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const hour=Number(hourParts.find(part=>part.type==='hour')?.value??0);
    const isPeak=(hour>=7&&hour<10)||(hour>=16&&hour<20);
    const timeMultiplier=isPeak?peakMultiplier:1;
    const openRequests=Math.max(0,demand?.openRequests||0);
    const availableDrivers=Math.max(0,demand?.availableDrivers||0);
    const demandRatio=openRequests/Math.max(1,availableDrivers);
    const calculatedDemand=1+Math.max(0,demandRatio-1)*0.08;
    const demandMultiplier=Math.min(demandCap,calculatedDemand);
    const distanceFare=input.distanceKm*perKm;
    const timeFare=durationMinutes*perMinute;
    const rawTotal=baseFare+distanceFare+timeFare;
    const estimatedFare=Math.max(1,Math.round(rawTotal*timeMultiplier*demandMultiplier));
    const demandLevel=openRequests===0?'low':demandRatio>=2?'high':demandRatio>=1?'moderate':'normal';
    return {
      currency:'BDT',
      estimatedFare,
      estimatedRange:{min:Math.max(1,Math.round(estimatedFare*0.95)),max:Math.round(estimatedFare*(1.05+Math.max(0,demandMultiplier-1)))},
      route:{distanceKm:Number(input.distanceKm.toFixed(2)),durationMinutes},
      breakdown:{
        baseFare:Math.round(baseFare*100)/100,
        distanceFare:Math.round(distanceFare*100)/100,
        timeFare:Math.round(timeFare*100)/100,
        subtotal:Math.round(rawTotal*100)/100,
        peakHourMultiplier:timeMultiplier,
        demandMultiplier:Number(demandMultiplier.toFixed(3)),
        demandSurcharge:Math.round((rawTotal*timeMultiplier*(demandMultiplier-1))*100)/100,
        total:estimatedFare,
      },
      demand:{level:demandLevel,openRequests,availableDrivers,ratio:Number(demandRatio.toFixed(2))},
      timeBand:isPeak?'Dhaka peak hours':'Off-peak hours',
      trafficStatus:'unavailable',
      calculationMethod:'Admin-configurable base, distance and time rates with transparent Dhaka peak-hour and nearby demand adjustments. Live road traffic is not included.',
      disclaimer:'This is an estimate. The final fare is calculated after the trip from available GPS samples; if GPS samples are insufficient, the route estimate is used and clearly identified.',
    };
  }
}
