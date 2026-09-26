import {validateForecast,validateSources} from '../public/forecast.js';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
try{const d=JSON.parse(raw);const value=d.kind==='sources'?validateSources(d.value):validateForecast(d.value,d.sourceCount);process.stdout.write(JSON.stringify(value));}catch{process.stderr.write('Invalid input or forecast contract');process.exitCode=1;}
