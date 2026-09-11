// Feature/threshold selection is restricted to training signers. Test clips are not inspected here.
const fs=require('node:fs'),R=require('../landmark-recognition.js');
const {samples}=JSON.parse(fs.readFileSync('gesture-data/processed.json','utf8'));
const train=samples.filter(s=>s.split==='train'&&s.wordId!=='__unknown__');
const variants=[
 {name:'balanced',shape:.55,position:.3,elbow:.05,velocity:.1},
 {name:'shape',shape:.8,position:.15,elbow:0,velocity:.05},
 {name:'position',shape:.3,position:.55,elbow:0,velocity:.15},
 {name:'motion',shape:.35,position:.25,elbow:0,velocity:.4},
 {name:'depth',shape:.55,position:.2,elbow:0,velocity:.1,depth:.15},
 {name:'depthPalm',shape:.55,position:.15,elbow:0,velocity:.1,depth:.1,palm:.1},
];
const results=[];
for(const variant of variants)for(const k of [1,2,3]){
 const options={...R.DEFAULT,...variant,k};delete options.name;
 const ranked=train.map(query=>({truth:query.wordId,top:query.sequence.length?R.rank(query.sequence,train.filter(ref=>ref.id!==query.id&&ref.signerId!==query.signerId),options):[]}));
 const top1=ranked.filter(r=>r.top[0]?.wordId===r.truth).length;
 const correctDistances=ranked.filter(r=>r.top[0]?.wordId===r.truth).map(r=>r.top[0].distance).sort((a,b)=>a-b);
 options.maxDistance=correctDistances[Math.floor(correctDistances.length*.9)]||.65;
 const decisions=ranked.map(r=>({truth:r.truth,...R.decide(r.top,options)}));
 const correct=decisions.filter(r=>r.wordId===r.truth).length,wrong=decisions.filter(r=>r.wordId&&r.wordId!==r.truth).length;
 const row={name:variant.name,k,top1,correct,wrong,options,byWord:Object.fromEntries([...new Set(train.map(s=>s.wordId))].map(id=>[id,decisions.filter(r=>r.truth===id&&r.wordId===id).length]))};
 results.push(row);console.log(JSON.stringify(row));
 fs.writeFileSync('gesture-data/tuning.json',JSON.stringify(results,null,2));
}
