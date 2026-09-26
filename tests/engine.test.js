import test from 'node:test';
import assert from 'node:assert/strict';
import {intrinsic,premium,cone,portfolio,quoteFresh,scenario,rsi,volatility,backtest} from '../public/engine.js';
test('rial-independent gold conversion and premium',()=>{assert.ok(Math.abs(intrinsic(3000,100000)-7233918.29)<1);assert.equal(premium(intrinsic(3000,100000),3000,100000),0);});
test('scenario compounds dollar and ounce without duplicating premium',()=>{assert.ok(Math.abs(scenario(100,10,10,0,5)-121)<1e-10);});
test('80% reference interval widens and is not called calibrated',()=>{assert.equal(cone(100,null,7),null);assert.ok(cone(100,.02,30).high>cone(100,.02,7).high);});
test('old quote never made fresh by recent fetch',()=>{const now=Date.parse('2026-09-26T16:00:00Z');assert.equal(quoteFresh({status:'ok',value:1,fetchedAt:new Date(now).toISOString(),pageTime:'2026-08-01 12:00:00'},now),false);});
test('weighted cost, sale fees and overselling',()=>{const trades=[{id:'1',date:'2026-01-01',type:'buy',grams:10,price:100,fee:10},{id:'2',date:'2026-01-02',type:'sell',grams:4,price:120,fee:5}];const p=portfolio(trades);assert.equal(p.grams,6);assert.equal(p.cost,606);assert.equal(p.realized,71);assert.throws(()=>portfolio([{...trades[1],grams:50}]));});
test('flat series RSI and zero-volatility baseline',()=>{const rows=Array.from({length:60},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),close:100}));assert.equal(rsi(rows),50);assert.equal(volatility(rows),0);assert.equal(backtest(rows,7).coverage,100);});
