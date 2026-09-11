const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),R=require('./landmark-recognition.js');
const dataset=require('./gesture-data/references.json'),manifest=require('./gesture-data/manifest.json');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(dev=false){
 const {document}=parseHTML(fs.readFileSync('index.html','utf8')),requests=[],messages=[],stored=[];let now=0,stopped=0;
 const video=document.getElementById('video'),canvas=document.getElementById('canvas');
 Object.assign(video,{readyState:2,videoWidth:640,videoHeight:480,currentTime:0,play:async()=>{}});
 canvas.getContext=()=>new Proxy({},{get:()=>()=>{}});
 // linkedom intentionally has no media/IndexedDB implementation; boundaries are faked,
 // while the page handlers, normalization, data and recognizer are the real project code.
 for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{get(){return this._value||this.firstElementChild?.value||'';},set(value){this._value=value;}});
 const database={createObjectStore(){},transaction(){const tx={};tx.objectStore=()=>({getAll(){const r={result:stored.slice()};queueMicrotask(()=>tx.oncomplete());return r;},add(item){stored.push(item);const r={};queueMicrotask(()=>tx.oncomplete());return r;},delete(id){const i=stored.findIndex(s=>s.id===id);if(i>=0)stored.splice(i,1);const r={};queueMicrotask(()=>tx.oncomplete());return r;}});return tx;}};
 const context=vm.createContext({document,LandmarkRecognizer:R,URLSearchParams,location:{search:dev?'?dev=1':'',hash:''},performance:{now:()=>now},console,Map,Set,URL,Blob,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
  window:{addEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}],getVideoTracks:()=>[{}]})}},
  indexedDB:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}},
  fetch:async url=>{requests.push(url);return {ok:true,json:async()=>require('./data/words.json')};},
  Worker:class{
   postMessage(message){messages.push(message);queueMicrotask(()=>{
    if(message.type==='load')this.onmessage({data:{type:'ready',count:dataset.templates.length}});
    else {const normalized=R.normalize(message.frames),result=R.recognize(normalized.sequence,dataset.templates,dataset.options);this.onmessage({data:{type:'result',id:message.id,result,quality:normalized.quality,elapsedMs:1}});}
   });}terminate(){}
  }
 });
 vm.runInContext(fs.readFileSync('app.js','utf8'),context);await settle();await settle();
 return {context,document,requests,messages,stored,video,setTime:t=>now=t,stopped:()=>stopped};
}
test('production loads fifty examples and hides collection/debug controls',async()=>{
 const app=await setup();assert.equal(app.document.getElementById('exampleWord').children.length,50);
 assert.ok(app.document.querySelector('.training').classList.contains('hidden'));assert.ok(app.document.getElementById('debugPanel').classList.contains('hidden'));
 assert.equal(app.document.getElementById('start').disabled,false);assert.deepEqual(app.requests,['data/words.json']);
});
test('development tools require explicit dev flag',async()=>{
 const app=await setup(true);assert.equal(app.document.querySelector('.training').classList.contains('hidden'),false);
 assert.equal(app.document.getElementById('debugPanel').classList.contains('hidden'),false);
});
function injectRecording(app,wordId){
 const entry=manifest.find(r=>r.wordId===wordId&&r.train==='True'),raw=JSON.parse(fs.readFileSync('gesture-data/raw/'+entry.id+'.json','utf8')).frames;
 app.context.fakeFrames=raw;app.context.frameIndex=0;
 vm.runInContext(`handModel={detectForVideo(){const f=fakeFrames[frameIndex];return {landmarks:f.hands.map(h=>h.points.map(p=>({x:p[0],y:p[1],z:p[2]}))),handedness:f.hands.map(h=>[{categoryName:h.side}])};}};poseModel={detectForVideo(){return {landmarks:[fakeFrames[frameIndex].pose.map(p=>({x:p[0],y:p[1],z:p[2],visibility:p[3]}))]};}};`,app.context);
 app.video.videoWidth=raw[0].aspect*480;return raw;
}
test('full countdown/capture uses landmark sequence, not selected example or RGB uploads',async()=>{
 const app=await setup(),raw=injectRecording(app,'ake');await vm.runInContext('startCamera()',app.context);
 app.document.getElementById('exampleWord').value='qala';vm.runInContext('beginCapture()',app.context);
 app.setTime(1000);app.video.currentTime=1;vm.runInContext('tick(1000)',app.context);
 assert.equal(app.messages.filter(m=>m.type==='recognize').length,0);assert.match(app.document.getElementById('captureCue').textContent,/2/);
 for(let i=0;i<raw.length;i++){const t=3000+i*2000/(raw.length-1);app.setTime(t);app.context.frameIndex=i;app.video.currentTime=i+2;vm.runInContext(`tick(${t})`,app.context);}
 await settle();const request=app.messages.find(m=>m.type==='recognize');assert.ok(request.frames.length>=8);
 assert.equal('wordId' in request,false);assert.equal('image' in request.frames[0],false);assert.ok(request.frames[0].pose.length);
 assert.equal(app.document.getElementById('resultText').textContent,'Әке');assert.deepEqual(app.requests,['data/words.json']);
 vm.runInContext('stopCamera()',app.context);assert.equal(app.stopped(),1);
});
test('developer recording stores raw sequence and signer metadata without changing production templates',async()=>{
 const app=await setup(true),raw=injectRecording(app,'ake');await vm.runInContext('startCamera()',app.context);
 app.document.getElementById('signerId').value='person-01';app.document.getElementById('trainingWord').value='ake';vm.runInContext("beginCapture('collect')",app.context);
 for(let i=0;i<raw.length;i++){const t=3000+i*2000/(raw.length-1);app.setTime(t);app.context.frameIndex=i;app.video.currentTime=i+1;vm.runInContext(`tick(${t})`,app.context);}
 await settle();await settle();assert.equal(app.stored.length,1);assert.equal(app.stored[0].signerId,'person-01');assert.equal(app.stored[0].sequence.length,40);
 assert.equal(app.messages.filter(m=>m.type==='recognize').length,0);
});
test('stopping during countdown cancels capture and releases the camera',async()=>{
 const app=await setup();injectRecording(app,'ake');await vm.runInContext('startCamera()',app.context);vm.runInContext('beginCapture(); stopCamera(); tick(5100)',app.context);
 await settle();assert.equal(app.messages.filter(m=>m.type==='recognize').length,0);assert.equal(app.stopped(),1);
});


test('text-to-sign finds all fifty words and Russian aliases without guessing unknown text',async()=>{
 const app=await setup();assert.equal(app.document.getElementById('textWords').children.length,50);
 for(const word of require('./data/words.json').words)for(const query of [word.kk,word.ru]){app.document.getElementById('textInput').value=query;vm.runInContext('showSign()',app.context);assert.equal(app.document.querySelector('#signResult video').src,'examples/words/'+word.id+'.webm');}
 app.document.getElementById('textInput').value='ЗЕЛЕНЫЙ!';vm.runInContext('showSign()',app.context);assert.equal(app.document.querySelector('#signResult video').src,'examples/words/jasyl.webm');
 app.document.getElementById('textInput').value='  ПАПА!  ';vm.runInContext('showSign()',app.context);assert.equal(app.document.querySelector('#signResult video').src,'examples/words/ake.webm');
 app.document.getElementById('textInput').value='несуществующее слово';vm.runInContext('showSign()',app.context);assert.equal(app.document.querySelector('#signResult video'),null);
});
test('text-to-sign playback supports slowing, looping, replaying and pausing on tab change',async()=>{
 const app=await setup();app.document.getElementById('textInput').value='вода';vm.runInContext('showSign()',app.context);
 const clip=app.document.querySelector('#signResult video'),inputs=app.document.querySelectorAll('#signResult input');let paused=0,played=0;clip.pause=()=>paused++;clip.play=async()=>{played++;};
 inputs[0].checked=true;inputs[0].onchange();assert.equal(clip.playbackRate,.5);inputs[1].checked=true;inputs[1].onchange();assert.equal(clip.loop,true);
 clip.currentTime=1;app.document.querySelector('#signResult button').onclick();assert.equal(clip.currentTime,0);assert.equal(played,1);
 vm.runInContext("setMode('sign-text')",app.context);assert.equal(paused,1);
});

test('learning view links to the teacher course and starts a three-pass review',async()=>{
 const app=await setup();const course=app.document.querySelector('.teacher-course a');assert.equal(course.href,'https://surdoclass.ru/courses/jestoviyyazik');
 app.document.getElementById('textInput').value='книга';vm.runInContext('showSign()',app.context);const clip=app.document.querySelector('#signResult video');clip.play=async()=>{};
 const guided=[...app.document.querySelectorAll('#signResult button')].find(button=>button.textContent.includes('×3'));guided.onclick();
 assert.equal(guided.disabled,true);assert.equal(clip.playbackRate,1);assert.match(app.document.getElementById('signResult').textContent,/повтор 1 из 3/);clip._stopGuided();
});

test('video player falls back from WebM to MP4 once and reports failure',async()=>{
 const app=await setup();app.document.getElementById('textInput').value='Сәлем';vm.runInContext('showSign()',app.context);const clip=app.document.querySelector('#signResult video');
 assert.equal(clip.src,'examples/words/salem.webm');clip.onerror();assert.equal(clip.src,'examples/words/salem.mp4');clip.onerror();assert.match(app.document.getElementById('signResult').textContent,/Видео не загрузилось/);
});
