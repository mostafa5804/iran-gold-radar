import {readFile} from 'node:fs/promises';
import {rsi,sma,atr} from '../public/engine.js';
const m=JSON.parse(await readFile(new URL('../public/data/market.json',import.meta.url),'utf8'));
const recentHistory=Object.fromEntries(Object.entries(m.history||{}).map(([k,v])=>[k,v.slice(-90)]));
const technicals=Object.fromEntries(Object.entries(m.history||{}).map(([k,v])=>[k,{rsi14:rsi(v),sma20:sma(v,20),atr14:atr(v),observations:v.length}]));
process.stdout.write(JSON.stringify({updatedAt:m.updatedAt,quotes:m.quotes,recentHistory,technicals}));
