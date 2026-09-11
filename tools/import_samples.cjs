const fs=require('node:fs'),path=require('node:path'),R=require('../landmark-recognition.js');
function validate(sample,labels){
 if(!sample||![2,3,R.VERSION].includes(sample.version)||!labels.has(sample.wordId))throw new Error('Unsupported sample version or label');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(sample.id)||typeof sample.signerId!=='string'||!sample.signerId.trim()||sample.signerId.length>64)throw new Error('A valid ID and signer code are required');
 if(!Array.isArray(sample.frames)||sample.frames.length<8||sample.frames.length>200)throw new Error('Invalid frame count');
 let previous=-1;
 const point=p=>Array.isArray(p)&&p.length>=3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<100);
 for(const f of sample.frames){
  if(!Number.isFinite(f.t)||f.t<=previous||f.t>15000||!Number.isFinite(f.aspect)||f.aspect<.2||f.aspect>5)throw new Error('Invalid timestamp or aspect ratio');previous=f.t;
  if(!Array.isArray(f.hands)||f.hands.length>2||f.hands.some(h=>!['Left','Right'].includes(h.side)||!Array.isArray(h.points)||h.points.length!==21||!h.points.every(point)))throw new Error('Invalid hand landmarks');
  if(!Array.isArray(f.pose)||(f.pose.length!==0&&f.pose.length!==33)||!f.pose.every(p=>point(p)&&p.length===4))throw new Error('Invalid pose landmarks');
 }
 const normalized=R.normalize(sample.frames);if(!normalized.sequence.length)throw new Error('Insufficient tracking quality: '+normalized.reason);
 return {...sample,version:R.VERSION,signerId:'local:'+sample.signerId.trim(),source:'local-unverified',split:'train',sequence:normalized.sequence,quality:normalized.quality};
}
if(require.main===module){
 const filename=process.argv[2];if(!filename)throw new Error('Usage: node tools/import_samples.cjs path/to/qoldau-gesture-samples.json');
 const payload=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
 if(payload.kind!=='qoldau-development-landmarks'||!Array.isArray(payload.samples)||payload.samples.length>2000)throw new Error('Invalid dataset export');
 const root=path.resolve(__dirname,'..'),labels=new Set(require('../data/words.json').words.filter(w=>Number.isInteger(w.slovoClass)).map(w=>w.id));
 const samples=payload.samples.map(s=>validate(s,labels)); // Validate entire batch before writing.
 const directory=path.join(root,'gesture-data/local');fs.mkdirSync(directory,{recursive:true});let added=0;
 for(const sample of samples){const target=path.join(directory,sample.id+'.json');if(fs.existsSync(target))continue;fs.writeFileSync(target,JSON.stringify(sample));added++;}
 console.log(`Imported ${added} examples. Run npm run references:build and npm run evaluate:loso.`);
}
module.exports={validate};
