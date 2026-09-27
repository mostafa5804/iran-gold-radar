import {HISTORY_KEY,validateLedger,mergeLedger,captureForecast,evaluateLedger,summarize,csvCell} from './history.js?v=0.4.1';
const $=id=>document.getElementById(id);
const fmt=(n,d=0)=>Number.isFinite(n)?new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(n):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeZone:'Asia/Tehran'}).format(new Date(s));
const time=s=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(s));
const directionNames={up:'افزایش',down:'کاهش',flat:'تقریباً ثابت'};
const dayNames={1:'فردا',7:'هفته',30:'ماه',90:'۳ ماه',365:'سال'};
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function createHistoryView(toast){
  let ledger=[],market=null,page=0,storageError='';const pageSize=20;
  function disk(){const raw=localStorage.getItem(HISTORY_KEY);return raw?validateLedger(JSON.parse(raw)):[];}
  try{ledger=disk();}catch{storageError='خواندن تاریخچه ممکن نشد؛ داده موجود بازنویسی نمی‌شود. پشتیبان را بررسی کن.';}
  function persist(incoming){
    // Read before writing to preserve entries from another tab. Existing IDs win.
    try{ledger=mergeLedger(mergeLedger(disk(),ledger),incoming);localStorage.setItem(HISTORY_KEY,JSON.stringify(ledger));storageError='';}
    catch(e){storageError='تاریخچه در مرورگر ذخیره نشد؛ همین حالا خروجی JSON بگیر. '+e.message;throw e;}
  }
  function filtered(){return evaluateLedger(ledger,market?.history?.gold,{days:Number($('historyHorizon').value),scenario:$('historyScenario').value,model:$('historyModel').value});}
  function render(){
    const selected=$('historyModel').value,models=[...new Set(ledger.map(r=>r.model))].sort();
    $('historyModel').innerHTML='<option value="">همه مدل‌ها</option>'+models.map(m=>`<option value="${escape(m)}">${escape(m.replace('models/',''))}</option>`).join('');
    $('historyModel').value=models.includes(selected)?selected:'';
    const all=filtered(),stats=summarize(all),state=$('historyState').value,items=all.filter(r=>state==='all'||r.status===state);
    const card=(label,value)=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
    $('historyStats').innerHTML=card('ارزیابی‌شده / ثبت‌شده',fmt(stats.count)+' / '+fmt(stats.total))+card('میانگین خطای قیمت',stats.count?fmt(stats.mape,2)+'٪':'—')+card('درستی جهت حرکت',stats.count?fmt(stats.directionAccuracy,1)+'٪':'—')+card('خطای فرض «بدون تغییر»',stats.count?fmt(stats.baselineMape,2)+'٪':'—');
    $('historyStatus').textContent=storageError||`${fmt(stats.pending)} در انتظار پایان روز هدف · ${fmt(stats.awaiting)} در انتظار قیمت پایانی معتبر${market?' · آخرین دریافت بازار: '+time(market.updatedAt):''}`;
    $('historyStatus').className='notice'+(storageError?' warn':'');
    $('historySample').textContent=stats.count===0?'هنوز نتیجه‌ای قابل سنجش نیست؛ پس از اجرای تحلیل تازه و رسیدن روز هدف، آمار شکل می‌گیرد.':`آمار همین افق، سناریو و مدل بر پایه ${fmt(stats.count)} پیش‌بینی و ${fmt(new Set(all.filter(r=>r.status==='evaluated').map(r=>r.targetDate)).size)} روز هدف است؛ تحلیل‌های یک روز مستقل از هم نیستند.${stats.count<30?' نمونه کم است؛ برای نتیجه‌گیری درباره قابل‌اتکا بودن مدل کافی نیست.':''}`;
    page=Math.min(page,Math.max(0,Math.ceil(items.length/pageSize)-1));
    $('historyRows').innerHTML=items.slice(page*pageSize,(page+1)*pageSize).map(r=>{
      const done=r.status==='evaluated',state=done?'ارزیابی شد':r.status==='pending'?'در انتظار پایان روز':'در انتظار داده';
      const range=Object.values(r.prices);
      return `<tr><td><strong>${escape(time(r.record.createdAt))}</strong><small>${escape(r.record.model.replace('models/',''))}</small><small>ثبت نهایی: ${escape(time(r.record.lockedAt))}</small></td><td>${date(r.targetDate+'T12:00:00Z')}<small>${dayNames[r.days]} · پایان روز تهران</small></td><td>${fmt(r.record.anchor.gold)}</td><td><strong>${fmt(r.predicted)}</strong><small>دامنه سناریوها: ${fmt(Math.min(...range))} تا ${fmt(Math.max(...range))}</small></td><td>${done?fmt(r.actual):'—'}${done?`<small>دریافت: ${escape(time(r.actualObservedAt))}</small>`:''}</td><td>${done?fmt(r.errorPct,2)+'٪':'—'}</td><td>${done?`${r.directionCorrect?'✓':'✕'} ${r.directionCorrect?'درست':'نادرست'}<small>پیش‌بینی: ${directionNames[r.predictedDirection]}<br>واقعی: ${directionNames[r.actualDirection]}</small>`:'—'}</td><td><span class="history-badge ${done?'done':''}">${state}</span>${done?`<small>${r.insideRange?'داخل':'خارج از'} دامنه سه سناریو</small>`:''}</td></tr>`;
    }).join('');
    $('historyEmpty').hidden=items.length>0;$('historyEmpty').textContent=ledger.length?'رکوردی مطابق این فیلترها وجود ندارد.':'با اولین تحلیل مستند تازه، پیش‌بینی‌ها خودکار و همراه زمان ثبت می‌شوند. تحلیل‌های گذشته به‌صورت ساختگی ارزیابی نمی‌شوند.';
    $('historyTable').hidden=!items.length;$('historyPrev').disabled=page===0;$('historyNext').disabled=(page+1)*pageSize>=items.length;
    $('historyPage').textContent=items.length?`صفحه ${fmt(page+1)} از ${fmt(Math.ceil(items.length/pageSize))}`:'بدون رکورد';
  }
  for(const id of ['historyHorizon','historyScenario','historyModel','historyState'])$(id).onchange=()=>{page=0;render();};
  $('historyPrev').onclick=()=>{page--;render();};$('historyNext').onclick=()=>{page++;render();};
  $('historyJSON').onclick=()=>download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),forecastHistory:ledger},null,2),'gold-forecast-history.json','application/json');
  $('historyCSV').onclick=()=>{
    const rows=[['زمان تحلیل','زمان ثبت نهایی','مدل','افق روز','تاریخ هدف میلادی','سناریو','قیمت مبنا تومان','پیش‌بینی تومان','واقعی تومان','خطای مطلق درصد','جهت درست','وضعیت','زمان دریافت قیمت پایانی']];
    for(const r of filtered())rows.push([r.record.createdAt,r.record.lockedAt,r.record.model,r.days,r.targetDate,$('historyScenario').value,r.record.anchor.gold,r.predicted,r.actual,r.errorPct,r.directionCorrect===undefined?'':r.directionCorrect?'بله':'خیر',r.status,r.actualObservedAt]);
    download('\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'gold-forecast-results.csv','text/csv;charset=utf-8');
  };
  $('historyImport').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>15e6)throw Error('فایل بیش از حد بزرگ است');const data=JSON.parse(await file.text());persist(validateLedger(data.forecastHistory));render();toast('تاریخچه ادغام شد؛ رکوردهای موجود تغییر نکردند. نتایج از آرشیو بازار دوباره محاسبه می‌شوند.');}catch(e){toast(e.message);render();}finally{e.target.value='';}};
  window.addEventListener('storage',e=>{if(e.key===HISTORY_KEY){try{ledger=mergeLedger(ledger,disk());render();}catch{toast('خواندن تاریخچه تب دیگر ناموفق بود.');}}});
  render();
  return {update(data){market=data;render();},capture(report){try{const entry=captureForecast(report);persist([entry]);render();return true;}catch(e){toast('تحلیل آماده است، اما ثبت تاریخچه انجام نشد: '+e.message);render();return false;}},export(){return ledger;},import(rows){persist(validateLedger(rows));render();}};
}
