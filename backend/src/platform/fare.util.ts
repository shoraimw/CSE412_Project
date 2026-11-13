export type VehicleKind='car'|'bike'|'cng';
const rates:Record<VehicleKind,{base:number;km:number}>={car:{base:60,km:25},bike:{base:30,km:12},cng:{base:40,km:18}};
export function estimateFare(input:{vehicle_type:VehicleKind;distance_km:number;traffic?:'light'|'moderate'|'heavy';demand?:'low'|'medium'|'high'}) {
 const rate=rates[input.vehicle_type],km=Number(input.distance_km);
 if(!rate||!Number.isFinite(km)||km<=0||km>1000)throw new Error('Valid distance and vehicle type required.');
 const traffic={light:1,moderate:1.2,heavy:1.5},demand={low:1,medium:1.1,high:1.35};
 const t=traffic[input.traffic||'moderate'],d=demand[input.demand||'medium'];
 if(!t||!d)throw new Error('Invalid traffic or demand.');
 const base=rate.base,dist=Math.round(km*rate.km),total=Math.round((base+dist)*t*d);
 return {currency:'BDT',estimated_fare:total,range:{min:Math.round(total*.9),max:Math.round(total*1.15)},breakdown:{base,distance:dist,traffic_multiplier:t,demand_multiplier:d},method:'Rule-based estimate; not an ML model.'};
}
