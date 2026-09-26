import {preferredModel} from './models.js?v=0.3.0';
import {HORIZONS,validateForecast,pathPoint,forecastUsable,sourceURL,validateSources,sourceReceipts} from './forecast.js?v=0.3.0';
import {DAY,intrinsic,premium,sma,rsi,atr,volatility,cone,backtest,scenario,quoteFresh,portfolio} from './engine.js?v=0.3.0';
const uid=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
const $=id=>document.getElementById(id);
const fmt=(n,d=0)=>Number.isFinite(n)?new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(n):'—';
const pct=n=>Number.isFinite(n)?`${n>0?'+':''}${fmt(n,2)}٪`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=s=>{const d=new Date(s);return Number.isNaN(+d)?'نامشخص':new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeZone:'Asia/Tehran'}).format(d);};
const timeLabel=s=>{const d=new Date(s);return Number.isNaN(+d)?'نامشخص':new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(d);};
const safeURL=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:null;}catch{return null;}};
function read(key,fallback,storage=localStorage){try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value,storage=localStorage){try{storage.setItem(key,JSON.stringify(value));return true;}catch{toast('ذخیره در مرورگر ممکن نیست؛ پشتیبان بگیر.');return false;}}
let market=null, horizon=90, key='', activeModel='', analysisBusy=false,verifiedKey='',modelsCatalog=[],analysisController=null;
let currentReport=null,selectedScenario='base',priceMode='nominal',manualSources=[];
const scenarioNames={base:'پایه',easing:'کاهش تنش',stress:'تشدید تنش'};
try{manualSources=validateSources(read('igr.sources.v1',[]));}catch{}
let personal=read('igr.personal.v1',{budget:0,steps:5,ask:0,bid:0,trades:[]});
let journal=read('igr.journal.v1',[]);
try{key=sessionStorage.getItem('igr.key')||'';}catch{}
activeModel=read('igr.model.v1','');
const latestLocal=read('igr.latest.v2',null);if(latestLocal&&typeof latestLocal.text==='string'&&typeof latestLocal.createdAt==='string')currentReport=latestLocal;
let toastTimer;
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function stat(label,value){return `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function cleanRows(rows){return Array.isArray(rows)?rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&['close','open','high','low'].every(k=>Number.isFinite(r[k])&&r[k]>0)).sort((a,b)=>a.date.localeCompare(b.date)):[];}
const goldRows=()=>cleanRows(market?.history?.gold);
const fresh=()=>['gold','dollar','ounce'].every(k=>quoteFresh(market?.quotes?.[k]));
function render(){
  if(!market)return;
  for(const id of ['gold','dollar','ounce']){
    const q=market.quotes?.[id];$(id+'Price').textContent=fmt(q?.value,id==='ounce'?2:0);
    const change=q?.previous?100*(q.value/q.previous-1):null;
    $(id+'Change').textContent=pct(change);$(id+'Change').className=change>0?'up':change<0?'down':'';
    $(id+'Time').textContent=q?`${quoteFresh(q)?'دریافت‌شده':'قدیمی / تأییدنشده'} · ${q.sourceTimeLabel||'زمان نامشخص'} · ${q.pageTime?.split(' ')[0]||''}`:'دریافت ناموفق';
  }
  const q=market.quotes;
  $('premium').textContent=fresh()?pct(premium(q.gold.value,q.ounce.value,q.dollar.value)):'نامعتبر';
  $('intrinsic').textContent=fresh()?`ارزش محاسباتی: ${fmt(intrinsic(q.ounce.value,q.dollar.value))} تومان`:'برای محاسبه، هر سه نرخ باید تازه باشند.';
  $('notice').className='notice'+(fresh()?'':' warn');
  $('notice').textContent=`آخرین تلاش دریافت: ${timeLabel(market.updatedAt)}. ${fresh()?'قیمت‌ها از منبع بازار دریافت شده‌اند؛ ساعت ثبت سه بازار لزوماً یکسان نیست.':'بخشی از داده‌ها قدیمی یا در دسترس نیست؛ پیشنهاد معاملاتی و محاسبه حباب متوقف است.'}${market.errors?.length?' خطای دریافت در '+fmt(market.errors.length)+' بخش.':''}`;
  const rows=goldRows(), ma=sma(rows,20), rr=rsi(rows), a=atr(rows);
  $('technicals').innerHTML=`<div><span>RSI · ۱۴</span><strong>${fmt(rr,1)}</strong></div><div><span>میانگین ۲۰ دوره</span><strong>${fmt(ma)}</strong></div><div><span>ATR · تومان</span><strong>${fmt(a)}</strong></div>`;
  drawChart();renderScenario();renderPortfolio();
}
function activeForecast(){
  if(!fresh()||!forecastUsable(currentReport,market?.quotes))return null;
  try{const f=validateForecast(currentReport.forecast,currentReport.sources.length);for(const s of ['base','easing','stress'])for(const d of HORIZONS)pathPoint(f,s,d,currentReport.forecastAnchor);return f;}catch{return null;}
}
function drawChart(){
  if(!market)return;
  const rows=goldRows(),f=activeForecast(),q=market.quotes?.gold;
  const anchorT=f?Date.parse(currentReport.createdAt):quoteFresh(q)?Date.now():Date.parse(rows.at(-1)?.date);
  const anchor=f?currentReport.forecastAnchor:{gold:q?.value,dollar:market.quotes?.dollar?.value,ounce:market.quotes?.ounce?.value};
  const history=rows.slice(-65).filter(r=>Date.parse(r.date)<=anchorT).map(r=>({t:Date.parse(r.date),v:r.close}));
  if(anchor.gold>0&&Number.isFinite(anchorT))history.push({t:anchorT,v:anchor.gold});
  if(!history.length){$('chart').innerHTML='<div class="empty">هنوز تاریخچه قیمت دریافت نشده است.</div>';return;}
  const realMode=priceMode==='real',canReal=f&&f.inflationIran.annualPct!==null;
  const future=f&&(!realMode||canReal)?Array.from({length:61},(_,i)=>{
    const days=horizon*i/60,points=['base','easing','stress'].map(s=>pathPoint(f,s,days,anchor)),selected=pathPoint(f,selectedScenario,days,anchor),v=p=>realMode?p.real:p.nominal;
    return {t:anchorT+days*DAY,v:v(selected),low:Math.min(...points.map(v)),high:Math.max(...points.map(v))};
  }):[];
  const all=[...history.map(p=>p.v),...future.flatMap(p=>[p.low,p.high])],min=Math.min(...all)*.97,max=Math.max(...all)*1.03;
  const start=history[0].t,end=anchorT+horizon*DAY,width=Math.max(300,$('chart').clientWidth),left=54,right=width-20;
  // Give history and future equal room even for a one-year horizon; date labels show the piecewise time scale.
  const todayX=left+(right-left)*.46;
  const x=t=>t<=anchorT?left+(t-start)/(anchorT-start||1)*(todayX-left):todayX+(t-anchorT)/(end-anchorT)*(right-todayX);
  const y=v=>265-(v-min)/(max-min||1)*220;
  const line=pts=>pts.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  let svg=`<svg viewBox="0 0 ${width} 315" role="img" aria-label="تاریخچه قیمت و مسیر شرطی آینده؛ محور زمان گذشته و آینده مقیاس متفاوت دارد">`;
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#e8eaf2" stroke-dasharray="3 4"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${fmt(v/1e6,1)}</text>`;}
  const ticks=width<480?[start,anchorT,end]:[start,(start+anchorT)/2,anchorT,anchorT+(end-anchorT)/2,end];
  for(const t of ticks)svg+=`<text x="${x(t)}" y="296" text-anchor="${t===end?'end':t===start?'start':'middle'}">${esc(new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric',timeZone:'Asia/Tehran'}).format(t))}</text>`;
  svg+=`<line x1="${todayX}" x2="${todayX}" y1="25" y2="266" stroke="#a5acc1" stroke-dasharray="3 4"/><text x="${todayX}" y="16" text-anchor="middle">${f?'مبنای تحلیل':'آخرین نرخ'}</text>`;
  if(future.length){const band=line(future.map(p=>({t:p.t,v:p.high})))+' '+line([...future].reverse().map(p=>({t:p.t,v:p.low}))).replace(/^M/,'L')+' Z';svg+=`<path d="${band}" fill="#704cf1" opacity=".07"/><path d="${line(future.map(p=>({t:p.t,v:p.high})))}" stroke="#c9bcfa" fill="none" stroke-dasharray="5 5"/><path d="${line(future.map(p=>({t:p.t,v:p.low})))}" stroke="#c9bcfa" fill="none" stroke-dasharray="5 5"/><path d="${line(future)}" stroke="#704cf1" fill="none" stroke-width="2.5" stroke-dasharray="6 5"/>`;}
  svg+=`<path d="${line(history)}" stroke="#e5a333" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`;
  for(const p of [...history,...future])svg+=`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="7" fill="transparent"><title>${esc(dateLabel(p.t))} · ${fmt(p.v)} تومان</title></circle>`;
  if(!future.length)svg+=`<text x="${todayX+(right-todayX)/2}" y="135" text-anchor="middle">${realMode&&f?'فرض تورم در دسترس نیست':'در انتظار فرض‌های معتبر AI'}</text>`;
  $('chart').innerHTML=svg+'</svg>';
  const last=future.at(-1);
  $('forecastStats').innerHTML=last?stat('قیمت برآوردی · '+fmt(horizon)+' روز',fmt(last.v)+' تومان')+stat('بازده '+(realMode?'پس از تورم':'اسمی'),pct(100*(last.v/anchor.gold-1)))+stat('دامنه سه سناریو',fmt(last.low/1e6,2)+' تا '+fmt(last.high/1e6,2)+' میلیون'):stat('مسیر آینده',currentReport?.forecast?'نیازمند تحلیل تازه':'منتظر تحلیل مستند');
  $('forecastBadge').textContent=f?'فرض‌های AI · '+timeLabel(currentReport.createdAt):'مسیر آینده هنوز معتبر نیست';
  $('forecastCaption').textContent=f?f.summary:key?'برای ساخت مسیر آینده، تحلیل تازه را با کلید خودت اجرا کن.':'قیمت‌ها عمومی‌اند؛ برای پیش‌بینی، کلید Gemini خودت را وارد کن.';
  $('forecastExplanation').textContent=f?`خط‌چین: سناریوی ${scenarioNames[selectedScenario]}؛ سایه: دامنه سه سناریو، بدون احتمال آماری. دو بخش زمان مقیاس متفاوت دارند. ${realMode?'آینده با قدرت خرید زمان تحلیل؛ تاریخچه اسمی است.':''} ${currentReport.forecastStatus||''}`:currentReport?.forecastStatus||'فرض‌های عددیِ مستند هنوز دریافت نشده‌اند؛ خط مصنوعی جایگزین نمی‌شود.';
  $('validation').textContent='مسیرهای AI هنوز آزمون خارج از نمونه ندارند؛ درصد دقت یا احتمال رشد گزارش نمی‌شود. '+fmt(rows.length)+' روز تاریخچه موجود است.';
  renderForecastDetails(f);
}
function appendRefs(el,refs){for(const n of refs||[]){const url=safeURL(currentReport?.sources?.[n-1]?.uri);if(!url)continue;const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=' ['+n+']';a.style.color='var(--purple)';el.append(a);}}
function renderForecastDetails(f){
  for(const [id,key] of [['iran','inflationIran'],['us','inflationUS']]){ $(id==='iran'?'iranInflation':'usInflation').textContent=f&&f[key].annualPct!==null?fmt(f[key].annualPct,1)+'٪ · فرض ۱۲ ماه آینده':'داده کافی نداریم';$(id+'Basis').textContent=f?f[key].basis:'نیاز به تحلیل مستند تازه';if(f)appendRefs($(id+'Basis'),f[key].sourceRefs);}
  if(!f){$('pointReason').textContent='تحلیل معتبر لازم است.';$('factorAssumptions').textContent='در انتظار فرض‌های تازه';$('returnsTable').textContent='فرض‌های معتبر برای محاسبه بازده در دسترس نیست.';$('drivers').textContent='با تحلیل تازه، عوامل مؤثر و منابعشان اینجا نمایش داده می‌شوند.';return;}
  const p=f.scenarios[selectedScenario].find(p=>p.days===horizon);
  $('factorAssumptions').textContent='دلار '+pct(p.dollarPct)+' · اونس '+pct(p.ouncePct)+' · صرف داخلی '+fmt(p.premiumPp,2)+' واحد درصد';$('factorAssumptions').title=p.reason;
  $('returnsTable').classList.remove('empty');$('returnsTable').innerHTML='<table><thead><tr><th>افق</th><th>اسمی</th><th>پس از تورم</th></tr></thead><tbody>'+HORIZONS.map(days=>{const p=pathPoint(f,selectedScenario,days,currentReport.forecastAnchor),n=100*(p.nominal/currentReport.forecastAnchor.gold-1),r=p.real===null?null:100*(p.real/currentReport.forecastAnchor.gold-1);return `<tr><td>${{7:'هفته',30:'ماه',90:'۳ ماه',365:'سال'}[days]}</td><td class="${n>=0?'up':'down'}">${pct(n)}</td><td class="${r===null?'':r>=0?'up':'down'}">${pct(r)}</td></tr>`;}).join('')+'</tbody></table>';
  $('drivers').classList.remove('empty');$('drivers').innerHTML=f.drivers.map(d=>`<article class="driver"><h3>${esc(d.title)}</h3><p>${esc(d.summary)} ${d.sourceRefs.map(n=>{const s=currentReport.sources[n-1],url=safeURL(s?.uri);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">[${n}]</a>`:'';}).join('')}</p></article>`).join('');
  $('pointReason').textContent=p.reason;appendRefs($('pointReason'),p.sourceRefs);
}
function renderScenario(){
  const values=['Dollar','Ounce','Premium'].map(k=>{const v=+$('scenario'+k).value;$('scenario'+k+'Out').textContent=pct(v);return v;});
  const q=market?.quotes;if(!fresh()){$('scenarioResult').textContent='داده تازه لازم است';$('scenarioChange').textContent='—';return;}
  const p= premium(q.gold.value,q.ounce.value,q.dollar.value),result=scenario(q.gold.value,...values,p);
  $('scenarioResult').textContent=fmt(result)+' تومان';$('scenarioChange').textContent=pct(100*(result/q.gold.value-1))+' نسبت به نرخ فعلی';
}
function persistPersonal(){save('igr.personal.v1',personal);}
function renderPortfolio(){
  let p;try{p=portfolio(personal.trades);}catch{toast('ترتیب یا مقدار معاملات معتبر نیست.');return;}
  const cash=personal.budget-personal.trades.reduce((s,t)=>s+(t.type==='buy'?t.grams*t.price+t.fee:-t.grams*t.price+t.fee),0);
  const valuation=personal.bid|| (quoteFresh(market?.quotes?.gold)?market.quotes.gold.value:0);
  $('portfolioStats').innerHTML=stat('موجودی معادل عیار ۷۵۰',fmt(p.grams,3)+' گرم')+stat('نقدینگی باقی‌مانده',fmt(cash)+' تومان')+stat('سود/زیان کل '+(personal.bid?'با نرخ بازخرید':'تخمینی'),valuation?fmt(p.realized+valuation*p.grams-p.cost)+' تومان':'نیاز به نرخ بازخرید');
  const steps=Math.max(2,Math.min(12,personal.steps||5)), installment=Math.max(0,cash)/steps;
  $('ladder').innerHTML=Array.from({length:steps},(_,i)=>`<div>پله ${fmt(i+1)}<small>${fmt(installment)} تومان</small></div>`).join('');
  let text='تقسیم مساوی نقدینگی برای برنامه‌ریزی؛ مجوز خرید نیست. فعال‌سازی هر پله نیاز به بازبینی تحلیل و نرخ فروشنده دارد.';
  if(personal.ask>0&&personal.bid>0)text+=` فاصله خریدوفروش: ${pct(100*(personal.ask-personal.bid)/personal.ask)}؛ رشد لازم نرخ بازخرید برای سربه‌سر شدن: ${pct(100*(personal.ask/personal.bid-1))}.`;
  if(cash<0)text+=' هشدار: هزینه خالص معاملات از بودجه ثبت‌شده بیشتر است.';
  $('spread').textContent=text;
  $('trades').innerHTML=personal.trades.length?`<div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>وزن معادل ۷۵۰</th><th>قیمت / گرم</th><th>کارمزد</th><th></th></tr></thead><tbody>${personal.trades.map(t=>`<tr><td>${esc(dateLabel(t.date))}</td><td>${t.type==='buy'?'خرید':'فروش'}</td><td>${fmt(t.grams,3)}</td><td>${fmt(t.price)}</td><td>${fmt(t.fee)}</td><td><button data-delete="${esc(t.id)}">حذف</button></td></tr>`).join('')}</tbody></table></div>`:'';
}
function fillPersonal(){for(const [id,k] of [['budget','budget'],['steps','steps'],['dealerAsk','ask'],['dealerBid','bid']])$(id).value=personal[k]||'';renderPortfolio();}
function validatePersonal(p){
  if(!p||!Array.isArray(p.trades)||p.trades.length>10000)throw Error('فایل پشتیبان معتبر نیست');
  for(const k of ['budget','steps','ask','bid'])if(!Number.isFinite(p[k])||p[k]<0)throw Error('مقادیر پشتیبان نامعتبر است');
  if(p.steps<2||p.steps>12||!Number.isInteger(p.steps))throw Error('تعداد پله نامعتبر است');
  for(const t of p.trades)if(!['buy','sell'].includes(t.type)||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!Number.isFinite(Date.parse(t.date))||typeof t.id!=='string'||!Number.isFinite(t.grams)||!Number.isFinite(t.price)||!Number.isFinite(t.fee))throw Error('معامله نامعتبر است');
  if(new Set(p.trades.map(t=>t.id)).size!==p.trades.length)throw Error('شناسه تکراری');portfolio(p.trades);
  return {budget:p.budget,steps:p.steps,ask:p.ask,bid:p.bid,trades:p.trades.map(t=>({id:t.id,type:t.type,date:t.date,grams:t.grams,price:t.price,fee:t.fee}))};
}
async function fetchJSON(url,options={}){
  const r=await fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});let data;try{data=await r.json();}catch{throw Error('پاسخ سرویس قابل‌خواندن نیست.');}
  if(!r.ok){const hint={400:'درخواست یا مدل از جست‌وجوی وب پشتیبانی نمی‌کند.',401:'کلید معتبر نیست.',403:'دسترسی، محدودیت منطقه یا مجوز کلید را بررسی کن.',404:'مدل در دسترس نیست؛ فهرست را دوباره دریافت کن.',429:'سهمیه یا نرخ درخواست پر شده؛ Billing و محدودیت API را بررسی کن.',500:'خطای موقت سرویس Google.',503:'سرویس موقتاً در دسترس نیست.'}[r.status]||'درخواست ناموفق بود.';throw Error(`کد ${r.status}: ${hint}`);}
  return data;
}
function setModels(models){
  modelsCatalog=models;
  activeModel=preferredModel(models,activeModel||read('igr.model.v1',''));
  filterModels();
  $('settingsTop').textContent=key?activeModel.replace('models/','')||'تنظیمات Gemini':'واردکردن کلید API';
}
function filterModels(){
  const search=$('modelSearch').value.trim().toLowerCase();
  $('model').replaceChildren(new Option('مدل را انتخاب کن',''));
  const sorted=[...modelsCatalog].sort((a,b)=>{const rank=m=>m.name==='models/gemini-3.8-flash'?0:/3\.8/.test(m.name)?1:/3\.1-pro/.test(m.name)?2:3;return rank(a)-rank(b)||a.name.localeCompare(b.name);});
  for(const m of sorted)if(!search||(m.name+' '+m.displayName).toLowerCase().includes(search)||m.name===activeModel)$('model').add(new Option((m.displayName||m.name)+' — '+m.name.replace('models/',''),m.name));
  if(modelsCatalog.some(m=>m.name===activeModel))$('model').value=activeModel;
  $('modelInfo').textContent=modelsCatalog.length?`${fmt(modelsCatalog.length)} مدل از API کلید خودت. قابلیت جست‌وجوی وب و سهمیه هنگام اجرا بررسی می‌شود.`:'فهرست مدل‌های قابل دسترس پس از بررسی کلید تو نمایش داده می‌شود.';
}
function openSettings(){$('apiKey').value=key;$('rememberKey').checked=!!readSessionKey();$('settings').showModal();}
function readSessionKey(){try{return sessionStorage.getItem('igr.key');}catch{return null;}}
async function loadModels(){
  const candidate=$('apiKey').value.trim();if(!candidate){$('settingsStatus').textContent='ابتدا کلید خودت را وارد کن.';return false;}if($('loadModels').disabled)return false;
  $('loadModels').disabled=true;$('settingsStatus').textContent='در حال دریافت فهرست واقعی مدل‌ها…';
  try{
    let token='',models=[];do{const d=await fetchJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'+(token?'&pageToken='+encodeURIComponent(token):''),{headers:{'x-goog-api-key':candidate}});models.push(...(d.models||[]));token=d.nextPageToken||'';}while(token);
    models=models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&m.name.startsWith('models/gemini')&&!/tts|image|robotics|computer-use/i.test(m.name)).map(m=>({name:m.name,displayName:m.displayName}));
    if($('apiKey').value.trim()!==candidate)return false;
    verifiedKey=candidate;setModels(models);$('settingsStatus').textContent=`${fmt(models.length)} مدل قابل‌انتخاب دریافت شد. پشتیبانی جست‌وجوی وب برای هر مدل هنگام تحلیل بررسی می‌شود.`;return true;
  }catch(e){verifiedKey='';setModels([]);$('settingsStatus').textContent=e.message;return false;}finally{$('loadModels').disabled=false;}
}
function showAnalysis(report){
  currentReport=report;renderReceipts(report);drawChart();
  $('aiResult').classList.remove('empty');$('aiResult').replaceChildren();
  // Safe minimal formatting; no model HTML or arbitrary generated links.
  for(const line of report.text.split('\n')){
    if(/^---+$/.test(line.trim()))continue;
    const p=document.createElement(/^#{1,4} /.test(line)?'h3':'p');
    const cleanLine=line.replace(/^#{1,4} /,'').replace(/^\* /,'• ');
    for(const part of cleanLine.split(/(\*\*[^*]+\*\*|\[\d+\])/g)){
      if(/^\*\*.*\*\*$/.test(part)){const strong=document.createElement('strong');strong.textContent=part.slice(2,-2);p.append(strong);}
      else if(/^\[\d+\]$/.test(part)){const n=+part.slice(1,-1),url=safeURL(report.sources?.[n-1]?.uri);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=part;a.className='citation';p.append(a);}else p.append(document.createTextNode(part));}
      else p.append(document.createTextNode(part));
    }
    $('aiResult').append(p);
  }
  const sources=report.sources||[];$('aiSources').replaceChildren();
  sour…3875 tokens truncated…;renderJournal();toast('پشتیبان بازیابی شد.');}catch(e){toast(e.message);}finally{e.target.value='';}};
try{personal=validatePersonal(personal);}catch{personal={budget:0,steps:5,ask:0,bid:0,trades:[]};}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(market)drawChart();},150);});
renderManualSources();setModels([]);fillPersonal();renderJournal();refresh();
function enabledSources(){return validateSources(manualSources).filter(s=>s.enabled);}
function renderManualSources(){
  $('manualSources').innerHTML=manualSources.map(s=>`<div class="manual-source"><label><input type="checkbox" data-source="${esc(s.id)}" ${s.enabled?'checked':''}><span title="${esc(s.content)}">${esc(s.title)}</span></label><button data-remove-source="${esc(s.id)}" aria-label="حذف ${esc(s.title)}">حذف</button></div>`).join('');
  $('sourceCount').textContent=manualSources.length?fmt(manualSources.filter(s=>s.enabled).length)+' منبع فعال · برای استفاده، تحلیل تازه اجرا کن.':'هنوز منبعی اضافه نشده';
}
function renderReceipts(report){
  $('sourceReceipts').replaceChildren();for(const s of report.manualSources||[]){const p=document.createElement('p');p.textContent=s.title+' — '+(s.status==='user_text'?'متن کاربر دریافت شد؛ نیازمند تأیید مستقل':s.status==='URL_RETRIEVAL_STATUS_SUCCESS'?'محتوای لینک دریافت شد؛ صحت ادعا تضمین نمی‌شود':'خواندن لینک تأیید نشد؛ در تحلیل به محتوای آن تکیه نکن.');$('sourceReceipts').append(p);}
}
$('addSource').onclick=()=>{$('sourceError').textContent='';$('sourceDialog').showModal();};
$('closeSource').onclick=()=>$('sourceDialog').close();
$('sourceType').onchange=()=>{$('sourceContent').placeholder=$('sourceType').value==='url'?'https://…':'متن گزارش یا یادداشت خود را وارد کن…';};
$('sourceForm').onsubmit=e=>{e.preventDefault();try{const next=validateSources([...manualSources,{id:uid(),title:$('sourceTitle').value.trim(),type:$('sourceType').value,content:$('sourceContent').value.trim(),date:$('sourceDate').value,enabled:true}]);manualSources=next;save('igr.sources.v1',manualSources);renderManualSources();$('sourceDialog').close();$('sourceForm').reset();toast('منبع ذخیره شد؛ با تحلیل تازه بررسی می‌شود.');}catch(e){$('sourceError').textContent=e.message;}};
$('manualSources').onchange=e=>{const id=e.target.dataset.source;if(!id)return;manualSources=manualSources.map(s=>s.id===id?{...s,enabled:e.target.checked}:s);save('igr.sources.v1',manualSources);renderManualSources();};
$('manualSources').onclick=e=>{const id=e.target.closest('[data-remove-source]')?.dataset.removeSource;if(!id)return;manualSources=manualSources.filter(s=>s.id!==id);save('igr.sources.v1',manualSources);renderManualSources();};
$('scenarios').onclick=e=>{const b=e.target.closest('[data-scenario]');if(!b)return;selectedScenario=b.dataset.scenario;for(const btn of $('scenarios').children){btn.classList.toggle('selected',btn===b);btn.setAttribute('aria-pressed',String(btn===b));}drawChart();};
$('priceMode').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;priceMode=b.dataset.mode;for(const btn of $('priceMode').children){btn.classList.toggle('selected',btn===b);btn.setAttribute('aria-pressed',String(btn===b));}drawChart();};

$('mobileControls').onclick=()=>{const open=$('forecastControls').classList.toggle('mobile-open');$('mobileControls').setAttribute('aria-expanded',String(open));$('mobileControls').textContent=open?'بستن تنظیمات پیش‌بینی':'فرض‌ها، سناریو و منابع من';};
