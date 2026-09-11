const textAliases={ake:['папа','аке'],ana:['мама'],salem:['салем','здравствуй','здравствуйте'],ia:['ия'],at:['есім'],bala:['ребенок']};
function normalizeText(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/[.,!?;:«»"“”]+/g,' ').trim().replace(/\s+/g,' ');}
function textNames(word){return [word.kk,word.ru,word.sourceLabel,...(textAliases[word.id]||[])].filter(Boolean).map(normalizeText);}
function pauseSignClip(){const clip=$('signResult').querySelector('video');clip?.pause?.();}
function renderTextWords(){
 const query=normalizeText($('textInput').value),available=words.filter(supported),matches=available.filter(w=>!query||textNames(w).some(name=>name.includes(query)));
 $('textWords').replaceChildren();$('textWordsHint').textContent=matches.length?`Выберите слово · ${matches.length} из ${available.length}`:'Такого слова в видеословаре пока нет. Попробуйте другое.';
 for(const word of matches){const button=document.createElement('button');button.className='word-chip';button.type='button';button.textContent=`${word.kk} · ${word.ru}`;button.onclick=()=>{$('textInput').value=word.kk;showSign();};$('textWords').append(button);}
}
function showSign(){
 const query=normalizeText($('textInput').value),word=words.find(w=>supported(w)&&textNames(w).includes(query));pauseSignClip();$('signResult').replaceChildren();
 const heading=document.createElement('p');heading.className='sign-heading';heading.textContent=word?`${word.kk} — ${word.ru}`:query?'Видео для этого слова пока нет':'Выберите слово или введите его название';heading.setAttribute('role','status');$('signResult').append(heading);
 if(!word){const note=document.createElement('p');note.textContent='Доступны 30 отдельных слов. Можно писать по-русски: «папа», «вода», «книга». Перевод целых предложений пока не поддерживается.';$('signResult').append(note);return;}
 const clip=document.createElement('video');clip.controls=true;clip.playsInline=true;clip.muted=true;clip.preload='metadata';clip.setAttribute('aria-label',`Жест: ${word.kk} — ${word.ru}`);
 const status=document.createElement('p');status.className='note';status.setAttribute('role','status');status.textContent='Нажмите ▶ для просмотра. Повторяйте движение по видео.';
 clip.onerror=()=>{status.textContent='Видео не загрузилось. Обновите страницу и попробуйте снова.';};
 const play=()=>{const pending=clip.play?.();pending?.catch(()=>{status.textContent='Нажмите ▶ на видео, чтобы начать просмотр.';});};
 clip.src=`examples/words/${word.id}.mp4`;$('signResult').append(clip);
 const controls=document.createElement('div');controls.className='sign-video-controls';
 const repeat=document.createElement('button');repeat.className='btn';repeat.textContent='Повторить';repeat.onclick=()=>{clip.currentTime=0;play();};controls.append(repeat);
 const slowLabel=document.createElement('label'),slow=document.createElement('input');slow.type='checkbox';slow.onchange=()=>{clip.playbackRate=slow.checked ? .5 : 1;};slowLabel.append(slow,document.createTextNode(' Замедлить вдвое'));controls.append(slowLabel);
 const loopLabel=document.createElement('label'),loop=document.createElement('input');loop.type='checkbox';loop.onchange=()=>{clip.loop=loop.checked;};loopLabel.append(loop,document.createTextNode(' По кругу'));controls.append(loopLabel);
 $('signResult').append(controls,status);
 const credit=document.createElement('p');credit.className='note';credit.append(document.createTextNode('Видео РЖЯ с казахским переводом. Источник: '));const source=document.createElement('a');source.href='https://github.com/hukenovs/slovo';source.target='_blank';source.rel='noopener noreferrer';source.textContent='Slovo';credit.append(source);$('signResult').append(credit);play();
}
