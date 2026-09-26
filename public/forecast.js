// Scenario arithmetic. These are AI assumptions, not calibrated probabilities.
export const HORIZONS=[7,30,90,365];
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateForecast(f,sourceCount){
  if(!f||typeof f.summary!=='string'||!Array.isArray(f.drivers))throw Error('ساختار پیش‌بینی ناقص است');
  const refs=a=>Array.isArray(a)&&a.length>0&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=sourceCount);
  for(const k of ['inflationIran','inflationUS']){const v=f[k];if(!v||!(v.annualPct===null||finite(v.annualPct,-20,500))||typeof v.basis!=='string'||(v.annualPct!==null&&!refs(v.sourceRefs)))throw Error('فرض تورم بدون پشتوانه معتبر');}
  for(const name of ['base','easing','stress']){
    const points=f.scenarios?.[name];if(!Array.isArray(points)||points.length!==4)throw Error('افق‌های پیش‌بینی ناقص است');
    points.forEach((p,i)=>{if(p.days!==HORIZONS[i]||!finite(p.dollarPct,-90,500)||!finite(p.ouncePct,-90,500)||!finite(p.premiumPp,-50,100)||typeof p.reason!=='string'||!refs(p.sourceRefs))throw Error('فرض عددی یا ارجاع نامعتبر است');});
  }
  if(f.drivers.length>12||f.drivers.some(d=>typeof d.title!=='string'||typeof d.summary!=='string'||!refs(d.sourceRefs)))throw Error('عامل بدون منبع');
  return f;
}
export function pathPoint(f,scenario,days,anchor,override={}){
  if(!Number.isFinite(days)||days<0||days>365||!(anchor.gold>0&&anchor.dollar>0&&anchor.ounce>0))throw Error('لنگر یا افق نامعتبر');
  const pts=[{days:0,dollarPct:0,ouncePct:0,premiumPp:0},...f.scenarios[scenario]];
  const hi=pts.findIndex(p=>p.days>=days),b=pts[Math.max(0,hi)],a=pts[Math.max(0,hi-1)],t=b.days===a.days?0:(days-a.days)/(b.days-a.days);
  const mix=k=>a[k]+(b[k]-a[k])*t;
  const dollarPct=mix('dollarPct'),ouncePct=mix('ouncePct'),premiumPp=mix('premiumPp');
  const startPremium=anchor.gold/(anchor.ounce*anchor.dollar*.75/31.1034768)-1;
  const nominal=anchor.gold*(1+dollarPct/100)*(1+ouncePct/100)*(1+startPremium+premiumPp/100)/(1+startPremium);
  if(!(nominal>0))throw Error('سناریو به قیمت نامعتبر منتهی شد');
  const inflation=override.inflationIran??f.inflationIran.annualPct;
  const real=inflation===null?null:nominal/Math.pow(1+inflation/100,days/365);
  return {days,nominal,real,dollarPct,ouncePct,premiumPp};
}
export function forecastUsable(report,quotes,now=Date.now()){
  const age=now-Date.parse(report?.createdAt),anchor=report?.forecastAnchor;
  if(!report?.grounded||age< -300000||age>24*3600000||!anchor)return false;
  // Do not silently rebase old scenarios onto a new market regime.
  return ['gold','dollar','ounce'].every(k=>anchor[k]>0&&quotes?.[k]?.value>0&&Math.abs(quotes[k].value/anchor[k]-1)<.05);
}
export function sourceURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^[\d.:]+$/.test(u.hostname)||/\.(local|localhost|internal)$/.test(u.hostname))return null;return u.href;}catch{return null;}}
export function validateSources(sources){
  if(!Array.isArray(sources)||sources.length>8)throw Error('حداکثر ۸ منبع مجاز است');
  const clean=sources.map(s=>{if(!s||typeof s.title!=='string'||s.title.length>120||!['url','text'].includes(s.type)||typeof s.content!=='string'||s.content.length>4000||!s.content.trim()||(s.type==='url'&&!sourceURL(s.content)))throw Error('منبع نامعتبر است');return {id:String(s.id).slice(0,80),type:s.type,title:s.title,content:s.type==='url'?sourceURL(s.content):s.content,date:String(s.date||'').slice(0,10),enabled:s.enabled!==false};});
  if(JSON.stringify(clean).length>16000)throw Error('حجم کل منابع بیش از ۱۶ هزار نویسه است');return clean;
}
export function sourceReceipts(sources,candidate){
  const meta=candidate?.urlContextMetadata||candidate?.url_context_metadata||{};
  const urls=meta.urlMetadata||meta.url_metadata||[];
  return sources.map(s=>({id:s.id,title:s.title,type:s.type,url:s.type==='url'?s.content:undefined,status:s.type==='text'?'user_text':urls.find(m=>(m.retrievedUrl||m.retrieved_url)===s.content)?.urlRetrievalStatus||urls.find(m=>(m.retrievedUrl||m.retrieved_url)===s.content)?.url_retrieval_status||'NOT_RETRIEVED'}));
}
