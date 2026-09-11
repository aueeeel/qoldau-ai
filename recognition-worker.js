importScripts('landmark-recognition.js');
let references=null;
self.onmessage=async({data})=>{
 try{
  if(data.type==='load'){
   const response=await fetch('gesture-data/references.json');if(!response.ok)throw new Error('Не найдены эталоны');
   references=await response.json();if(references.version!==LandmarkRecognizer.VERSION)throw new Error('Несовместимая версия эталонов');
   self.postMessage({type:'ready',count:references.templates.length,labels:[...new Set(references.templates.map(t=>t.wordId))]});
  }else if(data.type==='recognize'){
   if(!references)throw new Error('Эталоны не загружены');
   const started=performance.now(),normalized=LandmarkRecognizer.normalize(data.frames);
   const result=normalized.sequence.length?LandmarkRecognizer.recognize(normalized.sequence,references.templates,references.options):{wordId:null,reason:normalized.reason,top:[]};
   self.postMessage({type:'result',id:data.id,result,quality:normalized.quality,elapsedMs:Math.round(performance.now()-started)});
  }
 }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
