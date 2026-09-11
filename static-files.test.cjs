const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sendFile}=require('./static-files.cjs');
test('video streaming serves exact ranges, suffixes, HEAD and invalid-range responses',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qoldau-stream-')),file=path.join(dir,'sample.webm'),data=Buffer.from(Array.from({length:256},(_,i)=>i));fs.writeFileSync(file,data);
 const server=http.createServer((req,res)=>sendFile(req,res,file,'video/webm'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.unlinkSync(file);fs.rmdirSync(dir);});
 const url='http://127.0.0.1:'+server.address().port;
 for(const [range,start,end] of [['bytes=0-15',0,15],['bytes=100-',100,255],['bytes=-16',240,255],['bytes=250-999',250,255]]){
  const r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/webm');assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/256`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),data.subarray(start,end+1));
 }
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'256');assert.equal(head.headers.get('accept-ranges'),'bytes');assert.equal((await head.arrayBuffer()).byteLength,0);
 const bad=await fetch(url,{headers:{Range:'bytes=300-400'}});assert.equal(bad.status,416);assert.equal(bad.headers.get('content-range'),'bytes */256');assert.equal((await bad.arrayBuffer()).byteLength,0);
 const full=await fetch(url);assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),data);
});
