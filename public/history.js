// Local forward-only forecast ledger. Never substitutes a live quote for a dated close.
import {validateForecast,pathPoint} from './forecast.js?v=0.4.1';
export const HISTORY_KEY='igr.forecast-history.v1';
export const EVALUATION_DAYS=[1,7,30,90,365];
export const DIRECTION_THRESHOLD=.1;
const DAY=86400000;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<1e12;
export function tehranDate(value=Date.now()){
  const d=new Date(value);if(!Number.isFinite(+d))throw Error('زمان نامعتبر');
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function targetDate(createdAt,days){return new Date(Date.parse(tehranDate(createdAt)+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);}
export const direction=(price,base)=>{const change=100*(price/base-1);return change>DIRECTION_THRESHOLD?'up':change< -DIRECTION_THRESHOLD?'down':'flat';};
export function captureForecast(report,now=Date.now()){
  const started=Date.parse(report?.createdAt);
  if(!report?.grounded||!Number.isFinite(started)||started>now||now-started>3600000||tehranDate(started)!==tehranDate(now))throw Error('فقط تحلیل تازه همان روز قابل ثبت است');
  const f=validateForecast(report.forecast,report.sources?.length||0),anchor=report.forecastAnchor;
  if(!['gold','dollar','ounce'].every(k=>positive(anchor?.[k])))throw Error('قیمت مبنای معتبر لازم است');
  const points=f.scenarios.base.map(p=>({days:p.days,targetDate:targetDate(started,p.days),prices:Object.fromEntries(['base','easing','stress'].map(s=>[s,pathPoint(f,s,p.days,anchor).nominal]))}));
  if(points.some(p=>!Object.values(p.prices).every(positive)))throw Error('قیمت پیش‌بینی نامعتبر');
  return {id:report.id||report.createdAt+'|'+report.model,version:1,createdAt:report.createdAt,lockedAt:new Date(now).toISOString(),model:String(report.model),asset:'gold18',unit:'IRT',source:'TGJU',basis:'tehran-daily-close',anchor:{...anchor},anchorFetchedAt:report.anchorFetchedAt||null,points};
}
export function validateLedger(value){
  if(!Array.isArray(value)||value.length>10000)throw Error('تاریخچه نامعتبر یا بیش از حد بزرگ است');
  const ids=new Set();
  return value.map(r=>{
    if(!r||r.version!==1||typeof r.id!=='string'||r.id.length>240||ids.has(r.id)||typeof r.model!=='string'||r.model.length>200||r.asset!=='gold18'||r.unit!=='IRT'||r.source!=='TGJU'||r.basis!=='tehran-daily-close'||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.lockedAt))||Date.parse(r.lockedAt)<Date.parse(r.createdAt)||!['gold','dollar','ounce'].every(k=>positive(r.anchor?.[k]))||!Array.isArray(r.points)||![4,5].includes(r.points.length))throw Error('رکورد تاریخچه نامعتبر است');
    const days=r.points.length===5?EVALUATION_DAYS:EVALUATION_DAYS.slice(1);
    const points=r.points.map((p,i)=>{if(p.days!==days[i]||p.targetDate!==targetDate(r.createdAt,p.days)||tehranDate(r.lockedAt)>=p.targetDate||!['base','easing','stress'].every(s=>positive(p.prices?.[s])))throw Error('افق یا قیمت تاریخچه نامعتبر است');return {days:p.days,targetDate:p.targetDate,prices:{base:p.prices.base,easing:p.prices.easing,stress:p.prices.stress}};});
    ids.add(r.id);return {id:r.id,version:1,createdAt:r.createdAt,lockedAt:r.lockedAt,model:r.model,asset:r.asset,unit:r.unit,source:r.source,basis:r.basis,anchor:{gold:r.anchor.gold,dollar:r.anchor.dollar,ounce:r.anchor.ounce},anchorFetchedAt:typeof r.anchorFetchedAt==='string'?r.anchorFetchedAt:null,points};
  });
}
export function mergeLedger(existing,incoming){
  const result=validateLedger(existing),ids=new Set(result.map(r=>r.id));
  for(const row of validateLedger(incoming)){if(!ids.has(row.id)){result.push(row);ids.add(row.id);}}
  return validateLedger(result).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export function evaluatePoint(record,point,rows,now=Date.now(),scenario='base'){
  const today=tehranDate(now),predicted=point.prices[scenario];
  const initial={...point,record,predicted,status:today<=point.targetDate?'pending':'awaiting_data'};
  if(initial.status==='pending')return initial;
  // finalObservedAt is only assigned when the collector actually re-fetches a closed day.
  const actual=rows?.find(r=>r.date===point.targetDate&&positive(r.close)&&r.source==='TGJU'&&r.unit==='IRT'&&r.finalObservedAt&&Number.isFinite(Date.parse(r.finalObservedAt))&&Date.parse(r.finalObservedAt)<=now&&tehranDate(r.finalObservedAt)>r.date);
  if(!actual)return initial;
  const errorPct=100*Math.abs(predicted-actual.close)/actual.close;
  const baselineErrorPct=100*Math.abs(record.anchor.gold-actual.close)/actual.close;
  return {...initial,status:'evaluated',actual:actual.close,actualObservedAt:actual.finalObservedAt,errorPct,signedErrorPct:100*(predicted-actual.close)/actual.close,baselineErrorPct,predictedDirection:direction(predicted,record.anchor.gold),actualDirection:direction(actual.close,record.anchor.gold),directionCorrect:direction(predicted,record.anchor.gold)===direction(actual.close,record.anchor.gold),insideRange:actual.close>=Math.min(...Object.values(point.prices))&&actual.close<=Math.max(...Object.values(point.prices))};
}
export function evaluateLedger(ledger,rows,{days=1,scenario='base',model='',now=Date.now()}={}){
  return ledger.filter(r=>!model||r.model===model).flatMap(r=>r.points.filter(p=>!days||p.days===days).map(p=>evaluatePoint(r,p,rows,now,scenario)));
}
export function summarize(items){
  const done=items.filter(r=>r.status==='evaluated'),count=done.length;
  const mean=k=>count?done.reduce((a,r)=>a+r[k],0)/count:null;
  return {total:items.length,count,pending:items.filter(r=>r.status==='pending').length,awaiting:items.filter(r=>r.status==='awaiting_data').length,mape:mean('errorPct'),baselineMape:mean('baselineErrorPct'),directionAccuracy:count?100*done.filter(r=>r.directionCorrect).length/count:null};
}
export function csvCell(value){const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
