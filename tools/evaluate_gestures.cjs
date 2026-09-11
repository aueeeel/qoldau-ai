/* Honest evaluation: a query's identity and signer are always excluded. */
const fs=require('node:fs'),path=require('node:path'),R=require('../landmark-recognition.js');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'gesture-data');
const {samples}=JSON.parse(fs.readFileSync(path.join(folder,'processed.json'),'utf8'));
const configFile=path.join(folder,'config.json'),options=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):R.DEFAULT;
const mode=process.argv[2]||'heldout';
const queries=mode==='train'?samples.filter(s=>s.split==='train'):mode==='heldout'?samples.filter(s=>s.split==='test'):samples;
const pool=mode==='loso'?samples:samples.filter(s=>s.split==='train');
const results=[],started=performance.now();
for(const sample of queries){
 const refs=pool.filter(s=>s.id!==sample.id&&s.signerId!==sample.signerId&&s.sequence.length&&s.wordId!=='__unknown__');
 const t=performance.now(),result=R.recognize(sample.sequence,refs,options);
 results.push({id:sample.id,truth:sample.wordId,signerId:sample.signerId,quality:sample.quality,...result,reason:sample.sequence.length?result.reason:sample.reason,ms:Math.round(performance.now()-t)});
 if(results.length%10===0)console.log(mode,results.length,'/',queries.length,Math.round(performance.now()-started)+'ms');
}
const labels=[...new Set(samples.filter(s=>s.wordId!=='__unknown__').map(s=>s.wordId))].sort();
const matrix=Object.fromEntries(labels.map(id=>[id,Object.fromEntries([...labels,'rejected'].map(x=>[x,0]))]));
const byWord=labels.map(wordId=>{
 const rows=results.filter(r=>r.truth===wordId),confusions={};
 for(const r of rows){matrix[wordId][r.wordId||'rejected']++;if(r.wordId&&r.wordId!==wordId)confusions[r.wordId]=(confusions[r.wordId]||0)+1;}
 return {wordId,samples:rows.length,correct:rows.filter(r=>r.wordId===wordId).length,accuracy:rows.length?rows.filter(r=>r.wordId===wordId).length/rows.length:0,top1:rows.filter(r=>r.top?.[0]?.wordId===wordId).length,rejected:rows.filter(r=>!r.wordId).length,confusions};
});
const known=results.filter(r=>r.truth!=='__unknown__'),unknown=results.filter(r=>r.truth==='__unknown__');
const report={mode,options,samples:known.length,accuracy:known.filter(r=>r.wordId===r.truth).length/known.length,top1:known.filter(r=>r.top?.[0]?.wordId===r.truth).length/known.length,unknown:{samples:unknown.length,rejected:unknown.filter(r=>!r.wordId).length},medianMs:results.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(results.length/2)],byWord,matrix,results};
fs.writeFileSync(path.join(folder,'evaluation-'+mode+'.json'),JSON.stringify(report,null,2));
console.table(byWord);console.log(JSON.stringify({accuracy:report.accuracy,top1:report.top1,unknown:report.unknown,medianMs:report.medianMs}));
