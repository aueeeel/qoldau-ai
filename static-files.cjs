const fs=require('node:fs');
function parseRange(header,size){
 if(!header)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
 if(!m||(!m[1]&&!m[2])||!size)return false;
 let start,end;
 if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
 else{start=Number(m[1]);end=m[2]?Number(m[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return false;end=Math.min(end,size-1);}
 return {start,end};
}
function sendFile(req,res,file,type){
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');res.setHeader('Accept-Ranges','bytes');
  const range=req.method==='HEAD'?null:parseRange(req.headers.range,stat.size);
  if(range===false){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`,'Content-Length':0});res.end();return;}
  const length=range?range.end-range.start+1:stat.size;res.setHeader('Content-Length',length);res.statusCode=range?206:200;
  if(range)res.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${stat.size}`);
  if(req.method==='HEAD'||!length){res.end();return;}
  const stream=fs.createReadStream(file,range||undefined);stream.on('error',e=>res.destroy(e));res.on('close',()=>stream.destroy());stream.pipe(res);
 });
}
module.exports={parseRange,sendFile};
