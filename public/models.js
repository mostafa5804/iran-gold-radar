export function preferredModel(models,selected=''){
  const names=new Set(models.map(m=>m.name));
  if(names.has(selected))return selected;
  return ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash'].map(n=>'models/'+n).find(n=>names.has(n))||'';
}
