// Optional browser regression: npm install --no-save playwright, then run this file.
// API responses are fixtures; no real key, request to Gemini, or API charge is used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const origin='http://127.0.0.1:4179';
const now='2026-09-27T04:00:00Z';
const key='TEST-ONLY-NOT-A-REAL-KEY';
const selected='models/gemini-3.1-pro-preview';
const models=[selected,'models/gemini-3.8-flash'].map(name=>({name,displayName:name,supportedGenerationMethods:['generateContent']}));
const forecast={summary:'test fixture',inflationIran:{annualPct:null,basis:'test',sourceRefs:[]},inflationUS:{annualPct:null,basis:'test',sourceRefs:[]},drivers:[],scenarios:Object.fromEntries(['base','easing','stress'].map(s=>[s,[1,7,30,90,365].map(days=>({days,dollarPct:days/100,ouncePct:0,premiumPp:0,reason:'test',sourceRefs:[1]}))]))};
const market={updatedAt:'2026-09-27T01:28:21Z',quotes:Object.fromEntries(['gold','dollar','ounce'].map((k,i)=>[k,{value:[23829800,233300,4285][i],status:'ok',fetchedAt:'2026-09-27T01:28:21Z',pageTime:'2026-09-27 1:16:38',source:'TGJU',sourceTimeLabel:'4 مهر'}])),history:{gold:[],dollar:[],ounce:[]},errors:[]};
(async()=>{
  const server=spawn(process.execPath,['scripts/dev.mjs','--port','4179'],{cwd:join(__dirname,'../..')});
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  const profile=await mkdtemp(join(tmpdir(),'gold-session-test-'));
  const launch={headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']};
  let context;
  async function setup(page,{holdMarket=false,modelStatus=200,available=models,stale=false,modelFailure=false}={}){
    await page.clock.install({time:new Date(now)});
    let release;const gate=holdMarket?new Promise(r=>release=r):Promise.resolve();
    const state={modelCalls:0,analysisCalls:0,marketCalls:0,errors:[],release:()=>release?.(),urls:[]};
    page.on('pageerror',e=>state.errors.push(e.message));
    await page.route('**/data/market.json*',async route=>{state.marketCalls++;await gate;const data=structuredClone(market);if(stale)for(const q of Object.values(data.quotes))q.fetchedAt='2026-09-24T01:28:21Z';await route.fulfill({json:data});});
    await page.route('https://generativelanguage.googleapis.com/**',async route=>{
      assert.equal(route.request().headers()['x-goog-api-key'],key);
      if(route.request().method()==='GET'){
        state.modelCalls++;
        if(modelFailure)return route.abort('failed');
        return route.fulfill({status:modelStatus,json:modelStatus===200?{models:available}:{error:{message:'test failure'}}});
      }
      state.analysisCalls++;state.urls.push(route.request().url());
      const json=route.request().postDataJSON().generationConfig?
        {candidates:[{content:{parts:[{text:JSON.stringify(forecast)}]}}]}:
        {candidates:[{content:{parts:[{text:'Test research.'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.org',title:'Test source'}}],groundingSupports:[{segment:{text:'Test research.'},groundingChunkIndices:[0]}]}}]};
      return route.fulfill({json});
    });
    return state;
  }
  async function analyze(page){await page.click('#analyze');await page.waitForFunction(()=>document.querySelector('#analyze').disabled===false);}
  async function assertSaved(page,storage='localStorage'){
    assert.equal(await page.evaluate(name=>window[name].getItem('igr.key'),storage),key);
    assert.equal(await page.locator('#settings').evaluate(e=>e.open),false);
  }
  try{
    context=await chromium.launchPersistentContext(profile,launch);
    let page=await context.newPage();let state=await setup(page);
    await page.goto(origin);await page.click('#settingsTop');await page.fill('#apiKey',key);await page.click('#loadModels');await page.selectOption('#model',selected);await page.check('#keyLocal');await page.click('#connectKey');
    await page.reload();await analyze(page);await assertSaved(page);assert.equal(state.analysisCalls,2);assert.equal(state.modelCalls,2);assert.ok(state.urls.every(u=>u.includes(selected)));assert.deepEqual(state.errors,[]);
    await context.close();context=await chromium.launchPersistentContext(profile,launch);page=await context.newPage();state=await setup(page,{holdMarket:true});
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.click('#analyze');await page.waitForFunction(()=>document.querySelector('#aiStatus').textContent.includes('دریافت آخرین داده'));
    assert.equal(await page.locator('#settings').evaluate(e=>e.open),false);assert.equal(state.analysisCalls,0);assert.equal(state.marketCalls,1);
    await page.evaluate(()=>document.querySelector('#analyze').click());state.release();await page.waitForFunction(()=>!document.querySelector('#analyze').disabled);
    assert.equal(state.marketCalls,1);assert.equal(state.analysisCalls,2);await assertSaved(page);assert.ok(state.urls.every(u=>u.includes(selected)));assert.deepEqual(state.errors,[]);
    console.log('PASS saved local key + selected model after reload and full browser restart; first analysis waits for slow initial market; no duplicate calls.');
    await page.close();page=await context.newPage();state=await setup(page,{stale:true});await page.goto(origin);await analyze(page);assert.equal(state.analysisCalls,0);assert.ok((await page.locator('#aiStatus').innerText()).includes('طلای ۱۸ عیار'));await assertSaved(page);await page.close();
    page=await context.newPage();state=await setup(page,{modelFailure:true});await page.goto(origin);await analyze(page);assert.equal(state.analysisCalls,0);await assertSaved(page);await page.close();
    page=await context.newPage();state=await setup(page,{modelStatus:403});await page.goto(origin);await analyze(page);assert.equal(state.analysisCalls,0);assert.equal(await page.locator('#settings').evaluate(e=>e.open),true);assert.equal(await page.locator('#apiKey').inputValue(),key);await page.close();
    page=await context.newPage();state=await setup(page,{available:models.slice(1)});await page.goto(origin);await analyze(page);assert.equal(state.analysisCalls,0);assert.equal(await page.locator('#settings').evaluate(e=>e.open),true);assert.ok((await page.locator('#settingsStatus').innerText()).includes('مدل قبلی'));await page.close();
    console.log('PASS stale data still blocked; temporary network failure preserves key without reopening settings; rejected key/model prompts only when necessary.');
    page=await context.newPage();state=await setup(page);await page.goto(origin);await page.evaluate(({key,selected})=>{localStorage.removeItem('igr.key');sessionStorage.setItem('igr.key',key);localStorage.setItem('igr.model.v1',JSON.stringify(selected));},{key,selected});await page.reload();await analyze(page);await assertSaved(page,'sessionStorage');assert.equal(await page.evaluate(()=>localStorage.getItem('igr.key')),null);assert.equal(state.analysisCalls,2);assert.deepEqual(state.errors,[]);
    console.log('PASS session key survives reload without being copied into local storage.');
  }finally{await context?.close();server.kill();await rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
