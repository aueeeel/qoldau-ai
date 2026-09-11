const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),words=JSON.parse(fs.readFileSync(path.join(root,process.env.QOLDAU_VOCABULARY||'data/words.json'),'utf8')).words;
const manifest=require('../gesture-data/manifest.json'),{samples}=require('../gesture-data/processed.json');
const target=path.join(root,'examples/words'),existing=JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8'));
const chosen=words.filter(w=>Number.isInteger(w.slovoClass)).map(word=>{
 const old=existing.find(e=>e.wordId===word.id);
 let row=old&&manifest.find(r=>r.id===path.parse(old.sourceFile).name&&r.wordId===word.id);
 if(!row){const candidates=samples.filter(s=>s.wordId===word.id&&s.split==='test'&&s.sequence.length).sort((a,b)=>b.quality.validFrames/Math.max(1,b.quality.totalFrames)-a.quality.validFrames/Math.max(1,a.quality.totalFrames)||a.id.localeCompare(b.id));row=manifest.find(r=>r.id===candidates[0]?.id);}
 if(!row)throw Error('No usable video example: '+word.id);
 return {sourceFile:row.file,split:row.train.toLowerCase()==='true'?'train':'test',wordId:word.id,modified:false,sourceLabel:word.sourceLabel};
});
for(const entry of chosen)fs.copyFileSync(path.join(root,'gesture-data/videos',entry.sourceFile),path.join(target,entry.wordId+'.mp4'));
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(chosen,null,2));console.log('Video examples:',chosen.length);
