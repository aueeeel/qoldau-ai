/* Select general weights and rejection limits ONLY on training signers/negatives. */
const fs=require('node:fs'),R=require('../landmark-recognition.js');
const {samples}=JSON.parse(fs.readFileSync('gesture-data/processed.json','utf8'));
const train=samples.filter(s=>s.split==='train'),known=train.filter(s=>s.wordId!=='__unknown__'),unknown=train.filter(s=>s.wordId==='__unknown__');
const fixed=process.argv.includes("--fixed-weights");
const previous=JSON.parse(fs.readFileSync("gesture-data/config.json","utf8"));
const variants=fixed?[{...previous,name:"existing-global3d"}]:[
 {name:'global3d',shape:.8,position:.15,elbow:0,velocity:.05,missing:1.5},
 {name:'canonical',shape:.2,canonical:.6,position:.15,elbow:0,velocity:.05,missing:1.5},
 {name:'canonicalPosition',shape:.15,canonical:.45,position:.3,elbow:0,velocity:.1,missing:1.5},
 {name:'canonicalOnly',shape:0,canonical:.8,position:.15,elbow:0,velocity:.05,missing:1.5}
];
const results=[];
for(const variant of variants)for(const k of [2]){
 const weights={...R.DEFAULT,...variant,k};delete weights.name;
 const ranked=train.map((q,index)=>{if(index%25===0)console.log('Calibration',index,'/',train.length);return {truth:q.wordId,top:q.sequence.length?R.rank(q.sequence,known.filter(r=>r.id!==q.id&&r.signerId!==q.signerId),weights):[]};});
 const limits=Object.fromEntries([...new Set(known.map(s=>s.wordId))].map(id=>{
  const ds=ranked.filter(r=>r.truth===id&&r.top[0]?.wordId===id).map(r=>r.top[0].distance).sort((a,b)=>a-b);
  return [id,ds[Math.floor((ds.length-1)*.9)]||weights.maxDistance];
 }));
 for(const minMargin of (fixed?[previous.minMargin]:[.04,.08,.12,.18]))for(const scale of (fixed?[1]:[.85,1,1.15])){
  const options={...weights,minMargin,maxDistanceByWord:Object.fromEntries(Object.entries(limits).map(([id,d])=>[id,d*scale]))};
  const decisions=ranked.map(r=>({truth:r.truth,...R.decide(r.top,options)}));
  const correct=decisions.filter(r=>r.truth!=='__unknown__'&&r.wordId===r.truth).length,wrong=decisions.filter(r=>r.truth!=='__unknown__'&&r.wordId&&r.wordId!==r.truth).length,falseAccepts=decisions.filter(r=>r.truth==='__unknown__'&&r.wordId).length;
  const byWord=Object.fromEntries(Object.keys(limits).map(id=>[id,decisions.filter(r=>r.truth===id&&r.wordId===id).length]));
  const score=correct/known.length-1.5*wrong/known.length-(unknown.length?falseAccepts/unknown.length:0);
  results.push({name:variant.name,k,score,correct,wrong,falseAccepts,byWord,options,top1:ranked.filter(r=>r.truth!=='__unknown__'&&r.top[0]?.wordId===r.truth).length});
 }
 console.log(variant.name,k,'done',results.at(-1).byWord);
}
const counts={};for(const sample of known)counts[sample.wordId]=(counts[sample.wordId]||0)+1;
for(const row of results)row.qualified=Object.entries(counts).every(([id,n])=>row.byWord[id]/n>=.25)&&row.wrong/known.length<=.1&&row.falseAccepts/Math.max(1,unknown.length)<=.25;
results.sort((a,b)=>Number(b.qualified)-Number(a.qualified)||b.correct-a.correct||a.wrong-b.wrong||a.falseAccepts-b.falseAccepts);
fs.writeFileSync('gesture-data/calibration.json',JSON.stringify({known:known.length,unknown:unknown.length,protocol:'Training leave-one-signer-out only; no official test data',results},null,2));
fs.writeFileSync('gesture-data/config.json',JSON.stringify(results[0].options,null,2));
console.log('SELECTED',JSON.stringify(results[0]));
