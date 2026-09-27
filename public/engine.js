// Pure, auditable arithmetic. No LLM-generated prices or calibrated probability claims.
export const DAY = 86400000;
export const intrinsic = (ounce, dollar) => ounce * dollar * .75 / 31.1034768;
export const premium = (gold, ounce, dollar) => (gold / intrinsic(ounce, dollar) - 1) * 100;
export function sma(rows, n) { return rows.length < n ? null : rows.slice(-n).reduce((s,r)=>s+r.close,0)/n; }
export function rsi(rows, n=14) {
  if(rows.length <= n) return null;
  let up=0, down=0;
  for(let i=1;i<=n;i++){const d=rows[i].close-rows[i-1].close;up+=Math.max(d,0)/n;down+=Math.max(-d,0)/n;}
  for(let i=n+1;i<rows.length;i++){const d=rows[i].close-rows[i-1].close;up=(up*(n-1)+Math.max(d,0))/n;down=(down*(n-1)+Math.max(-d,0))/n;}
  return up===0&&down===0?50:down===0?100:100-100/(1+up/down);
}
export function atr(rows,n=14){
  if(rows.length<=n)return null;
  const a=rows.slice(-n).map((r,j)=>{const prev=rows[rows.length-n+j-1].close;return Math.max(r.high-r.low,Math.abs(r.high-prev),Math.abs(r.low-prev));});
  return a.reduce((s,v)=>s+v,0)/n;
}
export function volatility(rows) {
  if(rows.length<20)return null;
  const r=rows.slice(-91); let squared=0, days=0;
  for(let i=1;i<r.length;i++){const gap=(Date.parse(r[i].date)-Date.parse(r[i-1].date))/DAY;if(gap<=0||gap>10)return null;squared+=Math.log(r[i].close/r[i-1].close)**2;days+=gap;}
  return Math.sqrt(squared/days);
}
export function cone(price, sigma, days) {
  if(!Number.isFinite(sigma)||sigma===null||price<=0)return null;
  // Median-constant lognormal reference, nominal central 80%, NOT calibrated.
  const z=1.2815515655*sigma*Math.sqrt(days);
  return {low:price*Math.exp(-z),mid:price,high:price*Math.exp(z)};
}
export function backtest(rows,horizon=7){
  let count=0,inside=0,error=0;
  for(let i=20;i<rows.length;i++){
    const target=Date.parse(rows[i].date)+horizon*DAY;
    const next=rows.slice(i+1).find(r=>Date.parse(r.date)>=target);
    if(!next || Date.parse(next.date)-target>4*DAY)continue;
    const c=cone(rows[i].close,volatility(rows.slice(0,i+1)),(Date.parse(next.date)-Date.parse(rows[i].date))/DAY);
    if(!c)continue;count++;inside+=next.close>=c.low&&next.close<=c.high?1:0;error+=Math.abs(next.close-c.mid)/next.close;
  }
  return {count,coverage:count?100*inside/count:null,mape:count?100*error/count:null};
}
export function scenario(gold, dollarPct, ouncePct, premiumPoints, currentPremium) {
  return gold*(1+dollarPct/100)*(1+ouncePct/100)*(1+(currentPremium+premiumPoints)/100)/(1+currentPremium/100);
}
// TGJU emits both "01:16:38" and "1:16:38". Parse Tehran wall time explicitly.
export function sourcePageTime(value){
  if(typeof value!=='string')return NaN;
  const normalized=value.trim().replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const m=normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if(!m)return NaN;
  const [year,month,day,hour,minute,second]=m.slice(1).map(Number);
  const utc=Date.UTC(year,month-1,day,hour,minute,second),d=new Date(utc);
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day||d.getUTCHours()!==hour||d.getUTCMinutes()!==minute||d.getUTCSeconds()!==second)return NaN;
  return utc-3.5*3600000;
}
export function quoteFresh(q,now=Date.now()) {
  if(!q||q.status!=='ok'||!(q.value>0))return false;
  const fetched=Date.parse(q.fetchedAt), page=sourcePageTime(q.pageTime);
  // Reject absent/old source-page dates even if a cache was fetched just now.
  return Number.isFinite(page)&&now-fetched>=-300000&&now-fetched<6*3600000&&now-page>=-4*3600000&&now-page<36*3600000;
}
export function portfolio(trades){
  let grams=0,cost=0,realized=0;
  for(const t of [...trades].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
    if(!(t.grams>0&&t.price>0&&t.fee>=0))throw Error('مقدار معامله نامعتبر است');
    if(t.type==='buy'){grams+=t.grams;cost+=t.grams*t.price+t.fee;}
    else {if(t.grams>grams+1e-8)throw Error('فروش از موجودی طلا بیشتر است');const basis=cost/grams*t.grams;grams-=t.grams;cost-=basis;realized+=t.grams*t.price-t.fee-basis;}
  }
  return {grams,cost,average:grams?cost/grams:0,realized};
}
