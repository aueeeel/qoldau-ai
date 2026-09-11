'use strict';
const $=id=>document.getElementById(id), matcher=globalThis.GestureMatcher;
let words=[],samples=[],database,landmarker,stream,raf,facing='user',busy=false,loading=false;
let capture=null,lastVideoTime=-1,lastDetection=0,cameraGeneration=0;
let presetReady=false,inferencePending=false,inferenceController=null;
const frameCanvas=document.createElement('canvas'),frameContext=frameCanvas.getContext('2d');
const isPreset=()=>$('engine').value==='pretrained';
const gestureCapture=new CaptureTools.GestureCapture();
let previousHands=new Map();
const video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d');
const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function setMode(mode){
  const sign=mode==='sign-text';
  $('signView').classList.toggle('hidden',!sign);$('textView').classList.toggle('hidden',sign);
  $('tabSign').classList.toggle('active',sign);$('tabText').classList.toggle('active',!sign);
  document.querySelector('.training').classList.toggle('hidden',!sign||isPreset());
  document.querySelector('.engine-choice').classList.toggle('hidden',!sign);if(!sign)stopCamera();
}
function count(id){return samples.filter(s=>s.wordId===id).length;}
function controls(){
  const active=!!stream,ready=isPreset()?words.length:database&&words.length;
  $('start').disabled=active||loading||busy||!ready;$('stop').disabled=!active&&!loading;
  $('switch').disabled=!active||busy||loading;
  $('record').disabled=!active||busy||!ready||count($('trainingWord').value)>=15;
  const capturing=gestureCapture.phase!=='waiting';
  $('recognize').disabled=!active||busy||loading||(isPreset()?(!presetReady||inferencePending||capturing):words.filter(w=>count(w.id)>=3).length<2);
  $('engine').disabled=busy||loading;
  $('autoCapture').disabled=busy||loading||inferencePending||capturing;
  $('trainingWord').disabled=busy;$('deleteSample').disabled=busy||!count($('trainingWord').value);
  $('exportSamples').disabled=busy||!samples.length;
}
function updateSamples(){
  const word=words.find(w=>w.id===$('trainingWord').value),trained=words.filter(w=>count(w.id)>=3).length;
  $('sampleStatus').textContent=word?`${word.kk}: ${count(word.id)} из 3 необходимых примеров (максимум 15). Подготовлено слов: ${trained}. Всего примеров: ${samples.length}.`:'База слов пуста.';
  renderDictionary();controls();
}
function renderDictionary(){
  const q=$('search').value.trim().toLocaleLowerCase();
  const filtered=words.filter(w=>`${w.kk} ${w.ru} ${w.category}`.toLocaleLowerCase().includes(q));
  $('dictionaryGrid').replaceChildren();
  for(const word of filtered){
    const card=document.createElement('article'),category=document.createElement('b'),title=document.createElement('h3'),translation=document.createElement('p'),status=document.createElement('p'),button=document.createElement('button');
    category.textContent=word.category;title.textContent=word.kk;title.lang='kk';translation.textContent=word.ru;
    status.className='note';status.textContent=Number.isInteger(word.slovoClass)?'Готовая модель · РЖЯ → қазақша':'Только словарь · готового распознавания нет';
    button.className='btn';button.textContent=Number.isInteger(word.slovoClass)?'Попробовать':'Записать свой пример';
    button.onclick=()=>{if(busy)return;$('engine').value=Number.isInteger(word.slovoClass)?'pretrained':'personal';changeEngine();$('trainingWord').value=word.id;setMode('sign-text');updateSamples();location.hash='translator';};
    card.append(category,title,translation,status,button);
    if(Number.isInteger(word.slovoClass)){const example=document.createElement('button');example.className='btn';example.textContent='Посмотреть жест';example.onclick=()=>{setMode('sign-text');$('exampleWord').value=word.id;showExample();$('wordExamples').open=true;location.hash='wordExamples';};card.append(example);}
    $('dictionaryGrid').append(card);
  }
  if(!filtered.length)$('dictionaryGrid').textContent='Слово не найдено. Попробуйте «Сәлем» или «Көмек».';
}
function exampleVideo(word){const clip=document.createElement('video');clip.src=`examples/words/${word.id}.mp4`;clip.controls=true;clip.playsInline=true;clip.preload='metadata';clip.setAttribute('aria-label',`${word.kk} — пример РЖЯ`);return clip;}
function showExample(){const word=words.find(w=>w.id===$('exampleWord').value);if(!word)return;$('exampleVideo').src=`examples/words/${word.id}.mp4`;$('exampleVideo').playbackRate=$('slowExample').checked?.5:1;$('exampleCaption').textContent=`${word.kk} — ${word.ru}. Исходная метка Slovo: «${word.sourceLabel}».`;}
function showSign(){
  const query=$('textInput').value.trim().toLocaleLowerCase(),word=words.find(w=>[w.kk,w.ru].some(s=>s.toLocaleLowerCase()===query));
  $('signResult').replaceChildren();const p=document.createElement('p');
  p.textContent=word?`${word.kk} — ${word.ru}. ${Number.isInteger(word.slovoClass)?'Видео РЖЯ из Slovo, с казахским переводом.':'Видео этого жеста пока не подключено.'}`:'Введите одно слово из словаря, например «Сәлем».';
  $('signResult').append(p);
  if(Number.isInteger(word?.slovoClass))$('signResult').append(exampleVideo(word));
  else if(word){const link=document.createElement('a');link.href='https://special-edu.kz/kz/news/6/single/961';link.target='_blank';link.rel='noopener noreferrer';link.textContent='О видеословаре е-Ымдау';$('signResult').append(link);}
}
function openDatabase(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open('qoldau-personal-gestures',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('samples',{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
function dbAction(mode,action){return new Promise((resolve,reject)=>{
  const tx=database.transaction('samples',mode),request=action(tx.objectStore('samples'));
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));
});}
async function startCamera(){
  const generation=++cameraGeneration;loading=true;controls();$('camMessage').textContent='Загружаем отслеживание рук и запрашиваем камеру…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Камера доступна на localhost или HTTPS');
    if(isPreset()){
      const health=await fetch('/api/health',{signal:AbortSignal.timeout(15000)});
      if(!health.ok || !(await health.json()).ready)throw new Error('Локальная модель ещё не готова. Запустите node server.cjs и повторите попытку');
      presetReady=true;
    }
    if(!landmarker){
      const {HandLandmarker,FilesetResolver}=await import('./vendor/mediapipe/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      const model=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/models/hand_landmarker.task'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:0.6,minTrackingConfidence:0.6});
      if(generation!==cameraGeneration){model.close();return;}landmarker=model;
    }
    if(generation!==cameraGeneration)return;
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:640},height:{ideal:480}},audio:false});
    if(generation!==cameraGeneration){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;video.srcObject=media;await video.play();if(generation!==cameraGeneration)return;
    $('cameraPlaceholder').classList.add('hidden');$('camStatus').textContent='Камера включена';
    $('camMessage').textContent=isPreset()?'Лицо, плечи и обе руки должны быть видны. Нажмите «Показать жест», дождитесь отсчёта и покажите слово один раз.':'Запишите примеры, затем нажмите «Распознать мой жест».';
    $('captureCue').textContent=$('autoCapture').checked?'Покажите один жест и сделайте паузу.':'Нажмите «Показать жест», чтобы начать отсчёт.';
    stream.getVideoTracks()[0].onended=()=>{stopCamera();$('camMessage').textContent='Камера отключена. Подключите её и попробуйте снова.';};
    lastVideoTime=-1;raf=requestAnimationFrame(tick);
  }catch(error){
    if(generation!==cameraGeneration)return;stopCamera();
    $('camMessage').textContent=error.name==='NotAllowedError'?'Доступ к камере запрещён. Разрешите его в настройках браузера и нажмите «Включить камеру».':`Не удалось включить камеру: ${error.message}. Проверьте интернет и доступность камеры.`;
  }finally{if(generation===cameraGeneration){loading=false;controls();}}
}
function stopCamera(){
  cameraGeneration++;loading=false;cancelAnimationFrame(raf);
  inferenceController?.abort();inferenceController=null;inferencePending=false;presetReady=false;
  gestureCapture.reset();previousHands.clear();$('gestureProgress').value=0;$('captureCue').textContent='Камера выключена';
  if(capture){capture=null;$('recognitionMessage').textContent='Запись отменена.';}busy=false;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;ctx.clearRect(0,0,canvas.width,canvas.height);
  $('cameraPlaceholder').classList.remove('hidden');$('camStatus').textContent='Камера выключена';$('badge').textContent='—';$('captureProgress').value=0;$('resultText').textContent='—';controls();
}
function changeEngine(){
  stopCamera();
  const preset=isPreset();document.querySelector('.training').classList.toggle('hidden',preset);
  $('recognize').textContent=preset?'Показать жест':'Распознать мой жест';
  $('captureOptions').classList.toggle('hidden',!preset);
  $('modelTitle').textContent=preset?'Готовая модель · РЖЯ → қазақша':'Персональные примеры';
  $('modelDescription').textContent=preset?'Модель Slovo обучена на РЖЯ. Показывает казахский текст; варианты жестов Казахстана отдельно не проверены. Возможны ошибки.':'Сравнивает жест с вашими записями. Нужно по 3 примера минимум для двух слов.';
  $('recognitionMessage').textContent=preset?'Включите камеру и нажмите «Показать жест». Обучать модель не нужно.':'Сначала добавьте по 3 примера минимум для двух разных слов.';
  controls();
}
async function predictPreset(frames,generation){
  inferencePending=true;inferenceController=new AbortController();
  controls();
  $('recognitionMessage').textContent='Распознаём жест на этом компьютере… Это может занять 5–15 секунд.';
  $('captureCue').textContent='Жест записан. Дождитесь результата.';
  $('resultText').classList.remove('tentative');
  try{
    const response=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames}),signal:AbortSignal.any([inferenceController.signal,AbortSignal.timeout(30000)])});
    if(!response.ok)throw new Error(response.status===503?'Модель недоступна. Перезапустите node server.cjs.':'Не удалось обработать кадры. Попробуйте ещё раз.');
    const result=await response.json();if(generation!==cameraGeneration)return;
    if(result.status==='match'){$('resultText').textContent=result.kk;$('recognitionMessage').textContent=`Предположение: ${result.ru}. Можно показать следующий жест.`;}
    else if(result.status==='uncertain'&&result.candidate){$('resultText').textContent=`Возможно: ${result.candidate.kk}`;$('resultText').classList.add('tentative');$('recognitionMessage').textContent=`Неуверенный вариант: ${result.candidate.ru}. Сравните с видеообразцом и повторите. Это ещё не уверенное распознавание.`;}
    else{$('resultText').textContent='—';$('recognitionMessage').textContent=result.status==='unsupported'?'Модель предположила другое слово. Это может быть ошибка: посмотрите пример и повторите жест.':result.status==='idle'?'Модель не увидела жест. Покажите движение после отсчёта.':'Не удалось уверенно распознать. Повторите жест один раз после отсчёта, удерживая руки и лицо в кадре.';}
  }catch(error){if(generation!==cameraGeneration)return;$('resultText').textContent='—';$('recognitionMessage').textContent=error.name==='TimeoutError'?'Расчёт занял слишком долго. Повторите жест.':error.message;}
  finally{if(generation===cameraGeneration){inferencePending=false;inferenceController=null;gestureCapture.reset();$('captureCue').textContent='Готово. Можно показать следующий жест.';controls();}}
}
function collectPreset(result,now){
  if(inferencePending||!presetReady)return;
  const current=new Map();let motion=0,points=0;
  result.landmarks.forEach((hand,i)=>{const label=result.handedness[i]?.[0]?.categoryName||String(i);current.set(label,hand);const prev=previousHands.get(label);if(prev)for(const k of [0,4,8,12,16,20]){motion+=Math.hypot(hand[k].x-prev[k].x,hand[k].y-prev[k].y);points++;}});
  previousHands=current;motion=points?motion/points:0;
  if(gestureCapture.phase==='waiting'&&!$('autoCapture').checked)return;
  const scale=Math.min(320/video.videoWidth,240/video.videoHeight);
  frameCanvas.width=Math.round(video.videoWidth*scale);frameCanvas.height=Math.round(video.videoHeight*scale);
  frameContext.drawImage(video,0,0,frameCanvas.width,frameCanvas.height);
  const state=gestureCapture.push({time:now,image:frameCanvas.toDataURL('image/jpeg',.9).split(',')[1],hands:result.landmarks.length,motion},$('autoCapture').checked);
  if(state.phase==='countdown'){$('captureCue').textContent=`Приготовьтесь… ${state.remaining}`;$('gestureProgress').value=0;}
  if(state.phase==='recording'){$('captureCue').textContent='Сейчас: покажите одно слово';$('gestureProgress').value=state.progress;}
  if(state.phase==='invalid'){$('captureCue').textContent='Не удалось записать движение рук. Повторите запись.';$('gestureProgress').value=0;controls();}
  if(state.phase==='complete'){$('gestureProgress').value=100;void predictPreset(state.frames,cameraGeneration);}
}
function draw(result){
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#64d9c0';ctx.fillStyle='#c8ffef';ctx.lineWidth=3;
  for(const hand of result.landmarks){
    for(const [a,b] of links){ctx.beginPath();ctx.moveTo(hand[a].x*canvas.width,hand[a].y*canvas.height);ctx.lineTo(hand[b].x*canvas.width,hand[b].y*canvas.height);ctx.stroke();}
    for(const p of hand){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,2*Math.PI);ctx.fill();}
  }
}
function beginCapture(kind){
  if(busy||!stream)return;busy=true;$('resultText').textContent='—';$('captureProgress').value=0;
  capture={kind,wordId:$('trainingWord').value,start:performance.now()+3000,frames:[],total:0};controls();
}
async function finishCapture(item){
  try{
    if(item.frames.length<12||item.frames.length/Math.max(1,item.total)<0.75){$('recognitionMessage').textContent='Руки были видны недостаточно хорошо. Повторите запись, удерживая руки в кадре.';return;}
    const sequence=matcher.resample(item.frames);
    if(item.kind==='record'){
      const sample={id:crypto.randomUUID(),wordId:item.wordId,sequence,createdAt:new Date().toISOString(),verified:false,featureVersion:1};
      await dbAction('readwrite',store=>store.add(sample));samples.push(sample);updateSamples();
      $('recognitionMessage').textContent='Пример сохранён. Повторите тот же жест или выберите другое слово.';
    }else{
      const result=matcher.recognize(sequence,samples);$('resultText').textContent=words.find(w=>w.id===result.wordId)?.kk||'Не распознано';
      $('recognitionMessage').textContent=result.wordId?'Предположение по вашим примерам. Проверьте, верно ли определено слово.':result.reason==='training'?'Нужно по 3 примера для двух разных слов.':'Нет однозначного совпадения. Повторите жест или добавьте более разные примеры.';
    }
  }catch(error){$('recognitionMessage').textContent=`Ошибка обработки примера: ${error.message}. Попробуйте ещё раз.`;}
  finally{busy=false;$('captureProgress').value=0;controls();}
}
function tick(now){
  if(!stream)return;
  try{
    if(video.readyState>=2&&video.currentTime!==lastVideoTime&&now-lastDetection>=65){
      lastVideoTime=video.currentTime;lastDetection=now;const result=landmarker.detectForVideo(video,now);draw(result);
      $('badge').textContent=`Рук в кадре: ${result.landmarks.length}`;
      if(isPreset())collectPreset(result,now);
      if(capture){
        const elapsed=now-capture.start;$('recognitionMessage').textContent=elapsed<0?`Приготовьтесь: ${Math.ceil(-elapsed/1000)}`:'Покажите один жест…';
        if(elapsed>=0&&elapsed<=2000){capture.total++;if(result.landmarks.length)capture.frames.push(matcher.features(result));$('captureProgress').value=elapsed/20;}
        if(elapsed>2000){const completed=capture;capture=null;void finishCapture(completed);}
      }
    }
    raf=requestAnimationFrame(tick);
  }catch(error){stopCamera();$('camMessage').textContent=`Отслеживание остановлено: ${error.message}. Попробуйте включить камеру снова.`;}
}
$('start').onclick=startCamera;$('stop').onclick=stopCamera;
$('switch').onclick=()=>{stopCamera();facing=facing==='user'?'environment':'user';void startCamera();};
$('record').onclick=()=>beginCapture('record');$('recognize').onclick=()=>{if(isPreset()){gestureCapture.begin(performance.now());controls();$('resultText').textContent='—';$('recognitionMessage').textContent='Приготовьтесь. Начинайте жест после отсчёта.';}else beginCapture('recognize');};
$('exampleWord').onchange=showExample;$('slowExample').onchange=()=>{$('exampleVideo').playbackRate=$('slowExample').checked?.5:1;};
$('autoCapture').onchange=()=>{gestureCapture.reset();$('captureCue').textContent=$('autoCapture').checked?'Покажите один жест и сделайте паузу.':'Нажмите «Показать жест», чтобы начать отсчёт.';};
$('engine').onchange=changeEngine;
$('demoCheck').onclick=async()=>{
  stopCamera();$('demoCheck').disabled=true;$('demoStatus').textContent='Модель обрабатывает демонстрационное видео…';
  try{const response=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Модель ещё загружается или недоступна. Повторите попытку.');const result=await response.json();$('demoStatus').textContent=result.status==='match'?`Результат модели: ${result.kk} — ${result.ru}. Расчёт: ${(result.elapsedMs/1000).toFixed(1)} с.`:'Модель не дала уверенного результата на демонстрационном видео.';}
  catch(error){$('demoStatus').textContent=error.message;}finally{$('demoCheck').disabled=false;}
};
$('trainingWord').onchange=updateSamples;$('search').oninput=renderDictionary;
$('deleteSample').onclick=async()=>{
  const sample=samples.filter(s=>s.wordId===$('trainingWord').value).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
  if(!sample)return;busy=true;controls();
  try{await dbAction('readwrite',store=>store.delete(sample.id));samples=samples.filter(s=>s.id!==sample.id);updateSamples();}
  catch(error){$('sampleStatus').textContent=`Не удалось удалить: ${error.message}`;}finally{busy=false;controls();}
};
$('exportSamples').onclick=()=>{
  const blob=new Blob([JSON.stringify({version:1,featureVersion:1,kind:'personal-unverified-templates',words,samples},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='qoldau-my-gestures.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
$('lang').disabled=true;$('lang').title='Сейчас интерфейс на русском, слова и результаты — на казахском';
controls();
(async()=>{
  try{
    const response=await fetch('data/words.json');if(!response.ok)throw new Error(`Словарь: HTTP ${response.status}`);words=(await response.json()).words;
    $('readyWords').textContent='Слова готовой модели (качество различается): '+words.filter(w=>Number.isInteger(w.slovoClass)).map(w=>w.kk).join(' · ');
    for(const word of words){const option=document.createElement('option');option.value=word.id;option.textContent=`${word.kk} — ${word.ru}`;$('trainingWord').append(option);if(Number.isInteger(word.slovoClass))$('exampleWord').append(option.cloneNode(true));}
    $('exampleWord').value='ake';showExample();
    renderDictionary();database=await openDatabase();samples=await dbAction('readonly',store=>store.getAll());updateSamples();
  }catch(error){$('sampleStatus').textContent=`Не удалось открыть базу: ${error.message}. Проверьте доступ к хранилищу браузера и обновите страницу.`;controls();}
})();
