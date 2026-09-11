const fs=require('node:fs'),path=require('node:path'),R=require('../landmark-recognition.js');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'gesture-data');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
const samples=manifest.map(row=>{
 const raw=JSON.parse(fs.readFileSync(path.join(folder,'raw',row.id+'.json'),'utf8'));
 const normalized=R.normalize(raw.frames);
 return {id:row.id,wordId:row.wordId,signerId:row.signerId,split:row.train.toLowerCase()==='true'?'train':'test',source:'Slovo / RSL',quality:normalized.quality,reason:normalized.reason,sequence:normalized.sequence.map(f=>f.map(v=>Math.round(v*10000)/10000))};
});
const local=path.join(folder,'local');
if(fs.existsSync(local))for(const file of fs.readdirSync(local).filter(f=>f.endsWith('.json'))){
 const raw=JSON.parse(fs.readFileSync(path.join(local,file),'utf8')),normalized=R.normalize(raw.frames);
 samples.push({id:raw.id,wordId:raw.wordId,signerId:raw.signerId,split:'train',source:raw.source,quality:normalized.quality,reason:normalized.reason,sequence:normalized.sequence.map(f=>f.map(v=>Math.round(v*10000)/10000))});
}
fs.writeFileSync(path.join(folder,'processed.json'),JSON.stringify({version:R.VERSION,samples}));
const configFile=path.join(folder,'config.json'),options=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):R.DEFAULT;
// Production may use all available references. Evaluation always excludes self AND signer.
const templates=samples.filter(s=>s.sequence.length&&s.wordId!=='__unknown__');
fs.writeFileSync(path.join(folder,process.argv.includes('--staged')?'references-next.json':'references.json'),JSON.stringify({version:R.VERSION,source:'Slovo / RSL with Kazakh text labels',options,templates}));
console.log(JSON.stringify({total:samples.length,usable:templates.length,byWord:Object.fromEntries([...new Set(samples.map(s=>s.wordId))].map(id=>[id,{total:samples.filter(s=>s.wordId===id).length,usable:samples.filter(s=>s.wordId===id&&s.sequence.length).length,signers:new Set(samples.filter(s=>s.wordId===id).map(s=>s.signerId)).size}]))},null,2));
