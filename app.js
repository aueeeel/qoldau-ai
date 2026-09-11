'use strict';
const $=id=>document.getElementById(id),R=globalThis.LandmarkRecognizer;
const dev=new URLSearchParams(location.search).get('dev')==='1';
let words=[],samples=[],database,stream,handModel,poseModel,worker,refsReady=false;
let loading=false,busy=false,capture=null,raf=0,generation=0,pendingId=0,lastVideoTime=-1,lastDetection=0,facing='user',guidedRun=0;
const video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d');
const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const supported=word=>Number.isInteger(word?.slovoClass);
function controls(){
 $('start').disabled=!!stream||loading||busy||!refsReady;$('stop').disabled=!stream&&!loading;$('switch').disabled=!stream||loading||busy;
 $('recognize').disabled=!stream||loading||busy||!refsReady;$('record').disabled=!dev||!stream||loading||busy||!database;
 $('deleteSample').disabled=busy||!samples.some(s=>s.wordId===$('trainingWord').value);$('exportSamples').disabled=busy||!samples.length;
 $('trainingWord').disabled=busy;$('signerId').disabled=busy;
}
function setMode(mode){
 const sign=mode==='sign-text';$('signView').classList.toggle('hidden',!sign);$('textView').classList.toggle('hidden',sign);
 $('tabSign').classList.toggle('active',sign);$('tabText').classList.toggle('active',!sign);
 document.querySelector('.training').classList.toggle('hidden',!sign||!dev);document.querySelector('.engine-choice').classList.toggle('hidden',!sign);
 if(!sign)stopCamera();else pauseSignClip();
}
function setGestureVideo(clip,id){
 let fallback=false;const onFailure=clip.onerror;
 clip.onerror=()=>{if(!fallback){fallback=true;clip.src='examples/words/'+id+'.mp4';clip.load?.();}else onFailure?.call(clip);};
 clip.preload='metadata';
 clip.src='examples/words/'+id+'.webm';
 clip.load?.();
}
function showExample(){const word=words.find(w=>w.id===$('exampleWord').value);if(!word)return;const clip=$('exampleVideo');clip.onerror=()=>{$('exampleCaption').textContent='Видео не загрузилось. Обновите страницу и попробуйте снова.';};clip.muted=true;setGestureVideo(clip,word.id);clip.playbackRate=$('slowExample').checked ? .5 : 1;$('exampleCaption').textContent=`${word.kk} — ${word.ru}. Образец РЖЯ из Slovo, исходная метка «${word.sourceLabel}».`;const pending=clip.play?.();pending?.catch(()=>{});}
function openExample(word){setMode('sign-text');$('exampleWord').value=word.id;showExample();$('wordExamples').open=true;location.hash='wordExamples';}
function renderDictionary(){
 document.querySelector('[data-i18n="dict.text"]').textContent=words.length+' слов с видеообразцами РЖЯ и казахским переводом.';
 const q=$('search').value.trim().toLocaleLowerCase();$('dictionaryGrid').replaceChildren();
 for(const word of words.filter(w=>`${w.kk} ${w.ru} ${w.category}`.toLocaleLowerCase().includes(q))){
  const card=document.createElement('article');
  for(const [tag,text] of [['b',word.category],['h3',word.kk],['p',word.ru],['p',supported(word)?'Эталоны движения · РЖЯ → қазақша':'Только словарь · эталонов пока нет']]){const element=document.createElement(tag);element.textContent=text;if(tag==='h3')element.lang='kk';card.append(element);}
  if(supported(word)){
   const example=document.createElement('button');example.className='btn';example.textContent='Посмотреть жест';example.onclick=()=>openExample(word);card.append(example);
   const button=document.createElement('button');button.className='btn';button.textContent='Попробовать';button.onclick=()=>{setMode('sign-text');location.hash='translator';};card.append(button);
  }$('dictionaryGrid').append(card);
 }if(!$('dictionaryGrid').childElementCount)$('dictionaryGrid').textContent='Слово не найдено. Попробуйте «Сәлем» или «Әке».';
}
const textAliases={ake:['папа','аке'],ana:['мама'],salem:['салем','здравствуй','здравствуйте'],ia:['ия'],at:['есім'],bala:['ребенок']};
function normalizeText(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[.,!?;:«»"“”]+/g,' ').trim().replace(/\s+/g,' ');}
function textNames(word){return [word.kk,word.ru,word.sourceLabel,...(textAliases[word.id]||[])].filter(Boolean).map(normalizeText);}
function pauseSignClip(){guidedRun++;const clip=$('signResult').querySelector('video');clip?._stopGuided?.();clip?.pause?.();}
function startGuidedReview(clip,status,button){
 const token=++guidedRun;let round=0,timer=0;
 const stop=()=>{clearTimeout(timer);clip.onended=null;button.disabled=false;};clip._stopGuided=stop;
 const playRound=()=>{
  if(token!==guidedRun)return stop();round++;clip.currentTime=0;clip.playbackRate=round===1?1:.5;
  status.textContent=`Учебный просмотр: повтор ${round} из 3 · ${round===1?'обычная скорость':'скорость 0,5×'}`;
  const pending=clip.play?.();pending?.catch(()=>{status.textContent='Нажмите ▶ на видео, чтобы продолжить учебный просмотр.';button.disabled=false;});
 };
 clip.onended=()=>{if(token!==guidedRun)return stop();if(round>=3){stop();status.textContent='Готово: жест показан три раза. Теперь повторите его перед камерой.';return;}status.textContent='Пауза — приготовьтесь повторить движение.';timer=setTimeout(playRound,1200);};
 button.disabled=true;playRound();
}
function renderTextWords(){
 const query=normalizeText($('textInput').value),available=words.filter(supported),matches=available.filter(w=>!query||textNames(w).some(name=>name.includes(query)));
 $('textWords').replaceChildren();$('textWordsHint').textContent=matches.length?`Выберите слово · ${matches.length} из ${available.length}`:'Такого слова в видеословаре пока нет. Попробуйте другое.';
 for(const word of matches){const button=document.createElement('button');button.className='word-chip';button.type='button';button.textContent=`${word.kk} · ${word.ru}`;button.onclick=()=>{$('textInput').value=word.kk;showSign();};$('textWords').append(button);}
}
function showSign(){
 const query=normalizeText($('textInput').value),word=words.find(w=>supported(w)&&textNames(w).includes(query));pauseSignClip();$('signResult').replaceChildren();
 const heading=document.createElement('p');heading.className='sign-heading';heading.textContent=word?`${word.kk} — ${word.ru}`:query?'Видео для этого слова пока нет':'Выберите слово или введите его название';heading.setAttribute('role','status');$('signResult').append(heading);
 if(!word){const note=document.createElement('p');note.textContent='Доступны '+words.filter(supported).length+' отдельных слов. Можно писать по-русски: «папа», «вода», «книга». Перевод целых предложений пока не поддерживается.';$('signResult').append(note);return;}
 const clip=document.createElement('video');clip.controls=true;clip.playsInline=true;clip.muted=true;clip.preload='metadata';clip.setAttribute('aria-label',`Жест: ${word.kk} — ${word.ru}`);
 const status=document.createElement('p');status.className='note';status.setAttribute('role','status');status.textContent='Нажмите ▶ для просмотра. Повторяйте движение по видео.';
 clip.onerror=()=>{status.textContent='Видео не загрузилось. Обновите страницу и попробуйте снова.';};
 const play=()=>{const pending=clip.play?.();pending?.catch(()=>{status.textContent='Нажмите ▶ на видео, чтобы начать просмотр.';});};
 setGestureVideo(clip,word.id);$('signResult').append(clip);
 const controls=document.createElement('div');controls.className='sign-video-controls';
 const repeat=document.createElement('button');repeat.className='btn';repeat.textContent='Повторить';repeat.onclick=()=>{guidedRun++;clip._stopGuided?.();clip.currentTime=0;play();};controls.append(repeat);
 const guided=document.createElement('button');guided.className='btn primary';guided.textContent='Учебный просмотр ×3';guided.onclick=()=>startGuidedReview(clip,status,guided);controls.append(guided);
 const slowLabel=document.createElement('label'),slow=document.createElement('input');slow.type='checkbox';slow.onchange=()=>{clip.playbackRate=slow.checked ? .5 : 1;};slowLabel.append(slow,document.createTextNode(' Замедлить вдвое'));controls.append(slowLabel);
 const loopLabel=document.createElement('label'),loop=document.createElement('input');loop.type='checkbox';loop.onchange=()=>{guidedRun++;clip._stopGuided?.();clip.loop=loop.checked;};loopLabel.append(loop,document.createTextNode(' По кругу'));controls.append(loopLabel);
 $('signResult').append(controls,status);
 const credit=document.createElement('p');credit.className='note';credit.append(document.createTextNode('Видео РЖЯ с казахским переводом. Источник: '));const source=document.createElement('a');source.href='https://github.com/hukenovs/slovo';source.target='_blank';source.rel='noopener noreferrer';source.textContent='Slovo';credit.append(source);$('signResult').append(credit);play();
}

function initializeWorker(){
 worker=new Worker('recognition-worker.js');
 worker.onmessage=({data})=>{
  if(data.type==='ready'){refsReady=true;$('readyWords').textContent=`${words.filter(supported).length} слов · ${data.count} эталонов · `+words.filter(supported).map(w=>w.kk).join(' · ');controls();return;}
  if(data.type==='error'){if(data.id&&data.id!==pendingId)return;busy=false;$('recognitionMessage').textContent=`Ошибка распознавания: ${data.message}.`;controls();return;}
  if(data.type!=='result'||data.id!==pendingId)return;
  busy=false;const {result,quality}=data,word=words.find(w=>w.id===result.wordId);
  $('resultText').textContent=word?word.kk:'Жест не распознан';$('recognitionMessage').textContent=word?`${word.ru}. Совпадение движения с эталонами; проверьте результат.`:qualityMessage(result.reason);
  $('captureCue').textContent='Готово. Можно показать следующий жест.';
  if(dev)$('debugOutput').textContent=JSON.stringify({durationMs:quality.duration,validFrames:quality.validFrames,totalFrames:quality.totalFrames,left:quality.left,right:quality.right,poseFrames:quality.poseFrames,elapsedMs:data.elapsedMs,decision:result.reason,margin:result.margin,top3:result.top.map(r=>({...r,word:words.find(w=>w.id===r.wordId)?.kk}))},null,2);
  controls();
 };
 worker.onerror=()=>{refsReady=false;busy=false;$('recognitionMessage').textContent='Не удалось запустить распознаватель. Обновите страницу.';controls();};worker.postMessage({type:'load'});
}
function qualityMessage(reason){return ({hands:'Руки были видны недостаточно хорошо. Держите кисти целиком в кадре и повторите.',body:'Не видны плечи. Отойдите немного назад: лицо, плечи и обе руки должны попадать в кадр.',frames:'Слишком мало кадров. Закройте тяжёлые вкладки и повторите запись.',ambiguous:'Похожи несколько жестов. Сравните движение с видеообразцом и повторите один раз.',distance:'Жест не похож на доступные эталоны. Посмотрите образец и попробуйте ещё раз.',references:'Недостаточно эталонов для сравнения.'})[reason]||'Жест не распознан. Попробуйте показать его ещё раз.';}
async function startCamera(){
 const token=++generation;loading=true;controls();$('camMessage').textContent='Загружаем отслеживание рук и плеч…';
 try{
  if(!handModel||!poseModel){
   const {HandLandmarker,PoseLandmarker,FilesetResolver}=await import('./vendor/mediapipe/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
   const created=await Promise.allSettled([
    HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/models/hand_landmarker.task'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5}),
    PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/models/pose_landmarker_lite.task'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5})]);
   if(token!==generation||created.some(r=>r.status==='rejected')){created.forEach(r=>{if(r.status==='fulfilled')r.value.close();});if(token!==generation)return;throw new Error('Не удалось загрузить модели MediaPipe');}
   [handModel,poseModel]=created.map(r=>r.value);
  }if(token!==generation)return;
  const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:640},height:{ideal:480}},audio:false});
  if(token!==generation){media.getTracks().forEach(t=>t.stop());return;}stream=media;video.srcObject=media;await video.play();if(token!==generation)return;
  $('cameraPlaceholder').classList.add('hidden');$('camStatus').textContent='Камера включена';$('camMessage').textContent='Держите лицо, плечи и обе руки в кадре. Покажите одно слово после отсчёта.';$('captureCue').textContent='Нажмите «Показать жест»';
  stream.getVideoTracks()[0].onended=()=>{stopCamera();$('camMessage').textContent='Камера отключена. Подключите её снова.';};lastVideoTime=-1;lastDetection=0;raf=requestAnimationFrame(tick);
 }catch(error){if(token!==generation)return;stopCamera();$('camMessage').textContent=error.name==='NotAllowedError'?'Разрешите доступ к камере и нажмите «Включить камеру».':`Не удалось включить камеру: ${error.message}`;}
 finally{if(token===generation){loading=false;controls();}}
}
function stopCamera(){
 generation++;pendingId++;loading=false;busy=false;capture=null;cancelAnimationFrame(raf);const active=stream;stream=null;active?.getTracks().forEach(t=>{t.onended=null;t.stop();});video.srcObject=null;
 ctx.clearRect(0,0,canvas.width,canvas.height);$('cameraPlaceholder').classList.remove('hidden');$('camStatus').textContent='Камера выключена';$('badge').textContent='—';$('captureCue').textContent='Камера выключена';$('gestureProgress').value=0;$('captureProgress').value=0;controls();
}
function beginCapture(kind='recognize'){
 if(!stream||busy||!refsReady)return;const signerId=$('signerId').value.trim();
 if(kind==='collect'&&(!dev||!signerId)){$('sampleStatus').textContent='Укажите код исполнителя, например person-01. Для разных людей используйте разные коды.';return;}
 busy=true;capture={kind,wordId:kind==='collect'?$('trainingWord').value:null,signerId,start:performance.now()+3000,frames:[]};$('resultText').textContent='—';$('recognitionMessage').textContent='Приготовьтесь. После отсчёта покажите один жест.';$('captureCue').textContent='Приготовьтесь… 3';controls();
}
async function finishCapture(item){
 capture=null;$('gestureProgress').value=100;
 if(item.kind==='collect'){
  try{const normalized=R.normalize(item.frames);if(!normalized.sequence.length)throw new Error(qualityMessage(normalized.reason));
   const record={id:crypto.randomUUID(),version:R.VERSION,wordId:item.wordId,signerId:item.signerId,createdAt:new Date().toISOString(),source:'local-unverified',quality:normalized.quality,frames:item.frames,sequence:normalized.sequence};
   await dbAction('readwrite',store=>store.add(record));samples.push(record);updateSamples();$('recognitionMessage').textContent='Пример сохранён для разработки. Он не добавляется к рабочим эталонам автоматически.';
  }catch(error){$('sampleStatus').textContent=error.message;}finally{busy=false;$('captureCue').textContent='Запись завершена';controls();}
 }else{$('recognitionMessage').textContent='Сравниваем движение с эталонами…';$('captureCue').textContent='Распознавание…';worker.postMessage({type:'recognize',id:++pendingId,frames:item.frames});}
}
function draw(hands,pose){
 canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=3;ctx.strokeStyle='#64d9c0';ctx.fillStyle='#c8ffef';
 for(const hand of hands.landmarks){for(const [a,b] of connections){ctx.beginPath();ctx.moveTo(hand[a].x*canvas.width,hand[a].y*canvas.height);ctx.lineTo(hand[b].x*canvas.width,hand[b].y*canvas.height);ctx.stroke();}for(const p of hand){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}}
 if(dev&&pose.landmarks[0]){ctx.strokeStyle='#a3b8ff';for(const [a,b] of [[11,12],[11,13],[13,15],[12,14],[14,16]]){const p=pose.landmarks[0];ctx.beginPath();ctx.moveTo(p[a].x*canvas.width,p[a].y*canvas.height);ctx.lineTo(p[b].x*canvas.width,p[b].y*canvas.height);ctx.stroke();}}
}
function tick(now){
 if(!stream)return;
 try{if(video.readyState>=2&&video.currentTime!==lastVideoTime&&now-lastDetection>=45){
   lastDetection=now;lastVideoTime=video.currentTime;const hands=handModel.detectForVideo(video,now),pose=poseModel.detectForVideo(video,now);draw(hands,pose);$('badge').textContent=`Рук: ${hands.landmarks.length} · плечи: ${pose.landmarks.length?'видны':'не видны'}`;
   if(capture){const elapsed=now-capture.start;
    if(elapsed<0){$('captureCue').textContent=`Приготовьтесь… ${Math.ceil(-elapsed/1000)}`;$('gestureProgress').value=0;}
    else{capture.frames.push(R.fromResults(hands,pose,elapsed,video.videoWidth/video.videoHeight));$('captureCue').textContent='Сейчас: покажите одно слово';$('gestureProgress').value=Math.min(100,elapsed/20);
     if(dev)$('debugOutput').textContent=`Рук: ${hands.landmarks.length}; кадров с руками: ${capture.frames.filter(f=>f.hands.length).length}/${capture.frames.length}; время: ${Math.round(elapsed)} мс; ${hands.handedness.map(h=>h[0]?.categoryName).join(', ')}`;
     if(elapsed>=2000)void finishCapture(capture);
    }
   }
  }raf=requestAnimationFrame(tick);
 }catch(error){stopCamera();$('camMessage').textContent=`Отслеживание остановлено: ${error.message}. Включите камеру снова.`;}
}
function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('qoldau-gesture-dataset-v2',1);request.onupgradeneeded=()=>request.result.createObjectStore('samples',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function dbAction(mode,action){return new Promise((resolve,reject)=>{const tx=database.transaction('samples',mode),request=action(tx.objectStore('samples'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Запись отменена'));});}
function updateSamples(){const selected=samples.filter(s=>s.wordId===$('trainingWord').value);$('sampleStatus').textContent=`Выбранное слово: ${selected.length} примеров от ${new Set(selected.map(s=>s.signerId)).size} исполнителей. Цель: 20–30 примеров на слово от нескольких людей. Всего: ${samples.length}.`;controls();}
$('start').onclick=startCamera;$('stop').onclick=stopCamera;$('switch').onclick=()=>{stopCamera();facing=facing==='user'?'environment':'user';void startCamera();};$('recognize').onclick=()=>beginCapture();$('record').onclick=()=>beginCapture('collect');$('trainingWord').onchange=updateSamples;
$('exampleWord').onchange=showExample;$('slowExample').onchange=()=>{$('exampleVideo').playbackRate=$('slowExample').checked ? .5 : 1;};$('search').oninput=renderDictionary;
$('deleteSample').onclick=async()=>{const item=samples.filter(s=>s.wordId===$('trainingWord').value).at(-1);if(!item)return;busy=true;controls();try{await dbAction('readwrite',store=>store.delete(item.id));samples=samples.filter(s=>s.id!==item.id);updateSamples();}catch(error){$('sampleStatus').textContent=error.message;}finally{busy=false;controls();}};
$('exportSamples').onclick=()=>{const blob=new Blob([JSON.stringify({version:R.VERSION,kind:'qoldau-development-landmarks',samples})],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='qoldau-gesture-samples.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',event=>{stopCamera();if(!event.persisted){handModel?.close();poseModel?.close();worker?.terminate();}});
$('lang').disabled=true;$('lang').title='Интерфейс на русском, слова — на казахском';document.querySelector('.training').classList.toggle('hidden',!dev);$('debugPanel').classList.toggle('hidden',!dev);controls();
(async()=>{try{
 const response=await fetch('data/words.json');if(!response.ok)throw new Error('Не удалось загрузить словарь');words=(await response.json()).words;
 document.querySelector('#wordExamples summary').textContent=`Как показать слово: ${words.filter(supported).length} видеообразцов`;
 for(const word of words.filter(supported)){const option=document.createElement('option');option.value=word.id;option.textContent=`${word.kk} — ${word.ru}`;$('exampleWord').append(option);$('trainingWord').append(option.cloneNode(true));}
 $('exampleWord').value='ake';showExample();renderDictionary();renderTextWords();initializeWorker();if(dev){database=await openDatabase();samples=await dbAction('readonly',store=>store.getAll());updateSamples();}
}catch(error){$('recognitionMessage').textContent=error.message;controls();}})();

// Preview-only reflection; MediaPipe continues reading the original video frames.
$('mirrorPreview').onchange=()=>{const transform=$('mirrorPreview').checked?'scaleX(-1)':'none';video.style.transform=transform;canvas.style.transform=transform;};

$('textInput').oninput=renderTextWords;
$('textInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();showSign();}};
