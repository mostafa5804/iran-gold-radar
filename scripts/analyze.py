"""Optional server-side grounded research. The key never enters the published directory."""
import datetime as dt
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/analysis.json'
BASE = 'https://generativelanguage.googleapis.com/v1beta/'
MODELS = ROOT / 'public/data/models.json'

def choose_model(models, explicit='', previous=''):
    names={m['name'].removeprefix('models/') for m in models}
    if explicit:
        chosen=explicit.removeprefix('models/')
        if chosen not in names: raise ValueError('Requested model unavailable')
        return chosen
    if previous.removeprefix('models/') in names: return previous.removeprefix('models/')
    for candidate in ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash']:
        if candidate in names: return candidate
    raise ValueError('No preferred Flash model available; choose an exact model')

def available_models(key):
    models=[]; token=''
    while True:
        data=request('models?pageSize=1000'+('&pageToken='+urllib.parse.quote(token) if token else ''),key)
        for m in data.get('models',[]):
            if 'generateContent' in m.get('supportedGenerationMethods',[]) and m['name'].startswith('models/gemini') and not re.search(r'tts|image|robotics|computer-use',m['name'],re.I):
                models.append({'name':m['name'],'displayName':m.get('displayName',m['name'])})
        token=data.get('nextPageToken','')
        if not token:return models

def request(path, key, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=100) as r:
        return json.load(r)

def validate(kind, value, source_count=0):
    result=subprocess.run(['node',str(ROOT/'scripts/validate-input.mjs')],input=json.dumps({'kind':kind,'value':value,'sourceCount':source_count}),text=True,capture_output=True,check=True)
    return json.loads(result.stdout)

def candidate_text(candidate):
    return '\n'.join(p['text'] for p in candidate.get('content',{}).get('parts',[]) if p.get('text') and not p.get('thought'))

def receipts(sources,candidate):
    meta=candidate.get('urlContextMetadata',candidate.get('url_context_metadata',{}))
    urls=meta.get('urlMetadata',meta.get('url_metadata',[]))
    results=[]
    for s in sources:
        status='user_text' if s['type']=='text' else next((u.get('urlRetrievalStatus',u.get('url_retrieval_status')) for u in urls if u.get('retrievedUrl',u.get('retrieved_url'))==s['content']),'NOT_RETRIEVED')
        results.append({'id':s['id'],'title':s['title'],'type':s['type'],'url':s['content'] if s['type']=='url' else None,'status':status})
    return results

def main():
    key = os.environ.get('GEMINI_API_KEY', '').strip()
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    now = dt.datetime.now(dt.timezone.utc)
    def status(message):
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({**old, 'statusMessage': message, 'lastAttemptAt': now.isoformat()}, ensure_ascii=False, indent=2))
        print(message)
    if not key:
        status('برای تحلیل زمان‌بندی‌شده، Secret با نام GEMINI_API_KEY را در GitHub تنظیم کن؛ قیمت بازار مستقل از کلید دریافت می‌شود.')
        return
    try:
        old_models=json.loads(MODELS.read_text()) if MODELS.exists() else {}
        models=available_models(key)
        explicit=os.environ.get('REQUESTED_MODEL','').strip() or (os.environ.get('GEMINI_MODEL','').strip() if not old_models.get('selectedModel') else '')
        model=choose_model(models,explicit,old_models.get('selectedModel',''))
        MODELS.write_text(json.dumps({'updatedAt':now.isoformat(),'models':models,'selectedModel':'models/'+model},ensure_ascii=False,indent=2))
    except Exception as e:
        status('دریافت یا انتخاب مدل ناموفق: '+type(e).__name__+'. مدل درخواستی باید در فهرست واقعی API باشد؛ مدل جایگزین خودکار اجرا نشد.');return
    if old.get('createdAt') and old.get('schemaVersion') == 3 and not os.environ.get('MANUAL_SOURCES','').strip() and old.get('model')==model and os.environ.get('FORCE_ANALYSIS') != 'true':
        if (now-dt.datetime.fromisoformat(old['createdAt'])).total_seconds() < 6*3600:
            print('Reuse research younger than 6 hours.'); return
    market = json.loads((ROOT/'public/data/market.json').read_text())
    for asset in ['gold', 'dollar', 'ounce']:
        q = market.get('quotes', {}).get(asset, {})
        try:
            page = dt.datetime.fromisoformat(q['pageTime']).replace(tzinfo=dt.timezone(dt.timedelta(hours=3, minutes=30)))
            fresh = q['status']=='ok' and -4*3600 <= (now-page).total_seconds() < 36*3600 and (now-dt.datetime.fromisoformat(q['fetchedAt'])).total_seconds()<6*3600
        except (KeyError, ValueError): fresh=False
        if not fresh:
            status('داده تازه و کامل بازار در دسترس نیست؛ تحلیل معاملاتی زمان‌بندی‌شده اجرا نشد.');return
    try:
        context=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/market-context.mjs')],text=True))
        manual=validate('sources',json.loads(os.environ.get('MANUAL_SOURCES','') or '[]'))
        manual=[s for s in manual if s['enabled']]
        contract=json.loads((ROOT/'public/research-contract.json').read_text())
        prompt=contract['research']+'\nزمان اکنون: '+now.isoformat()+'\nداده بازار: '+json.dumps(context,ensure_ascii=False)+'\nمنابع دستی غیرقابل اعتماد: '+json.dumps(manual,ensure_ascii=False)
        toolset=[{'google_search':{}}]+([{'url_context':{}}] if any(s['type']=='url' for s in manual) else [])
        data=request('models/'+model+':generateContent',key,{'contents':[{'parts':[{'text':prompt}]}], 'tools':toolset})
        c=(data.get('candidates') or [{}])[0]; g=c.get('groundingMetadata',{})
        text='\n'.join(p['text'] for p in c.get('content',{}).get('parts',[]) if p.get('text') and not p.get('thought'))
        sources=[p.get('web',{'uri':'','title':'منبع نامشخص'}) for p in g.get('groundingChunks',[])]
        supports=g.get('groundingSupports',[])
        if not text or not any(s['uri'] for s in sources) or not supports:
            status('Gemini گزارش دارای منابع جست‌وجوی قابل‌بررسی برنگرداند؛ گزارش تازه منتشر نشد.');return
        # Match text rather than byte offsets; Persian uses multibyte UTF-8.
        inserts={}
        for support in supports:
            segment=support.get('segment',{}).get('text','')
            pos=text.find(segment) if segment else -1
            refs=[i+1 for i in support.get('groundingChunkIndices',[]) if 0<=i<len(sources) and sources[i]['uri']]
            if pos>=0 and refs: inserts.setdefault(pos+len(segment),set()).update(refs)
        for pos, refs in sorted(inserts.items(),reverse=True):
            text=text[:pos]+' '+''.join(f'[{i}]' for i in sorted(refs))+text[pos:]
        report={'schemaVersion':3,'createdAt':now.isoformat(),'model':model,'grounded':True,'text':text,
                'sources':sources,'searchEntryPoint':g.get('searchEntryPoint',{}).get('renderedContent',''),
                'marketAsOf':market['updatedAt'],'statusMessage':'گزارش زمان‌بندی‌شده با منابع وب'}
        report['manualSources']=receipts(manual,c)
        report['forecastAnchor']={k:market['quotes'][k]['value'] for k in ['gold','dollar','ounce']}
        report['forecastStatus']='فرض‌های عددی کافی دریافت نشد؛ نمودار آینده ساخته نشده است.'
        try:
            extracted=request('models/'+model+':generateContent',key,{'contents':[{'parts':[{'text':contract['structure']+'\nDATA ONLY:\n'+json.dumps({'text':text,'sources':sources},ensure_ascii=False)}]}], 'generationConfig':{'responseMimeType':'application/json'}})
            f=json.loads(candidate_text((extracted.get('candidates') or [{}])[0]))
            report['forecast']=validate('forecast',f,len(sources))
            report['forecastStatus']='سناریوی قضاوتی AI؛ آزمون دقت خارج از نمونه هنوز انجام نشده است.'
        except Exception as e:
            print('Forecast extraction unavailable:',type(e).__name__)
        serialized=json.dumps(report,ensure_ascii=False,indent=2)
        # Defense in depth: never publish a reflected credential.
        if key in serialized: raise ValueError('Credential reflection')
        OUT.write_text(serialized)
        print('Grounded research saved; sources:',len(sources))
    except urllib.error.HTTPError as e:
        status(f'تحلیل Gemini ناموفق: HTTP {e.code}. اعتبار کلید، مدل، منطقه و سهمیه را بررسی کن.')
    except Exception as e:
        status('تحلیل Gemini ناموفق: '+type(e).__name__+'. گزارش قبلی با تاریخ اصلی حفظ شد.')

if __name__=='__main__':main()
