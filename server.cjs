const {sendFile}=require('./static-files.cjs');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.mp4':'video/mp4','.webm':'video/webm'};
const {spawn}=require('node:child_process');
const python=process.env.QOLDAU_PYTHON||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
// Optional legacy benchmark only. The application works as a static site.
const backend=process.env.QOLDAU_SLOVO==='1'?spawn(python,[path.join(root,'backend.py')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}}):null;
backend?.stdout.on('data',data=>process.stdout.write(data));
backend?.stderr.on('data',data=>process.stderr.write(data));
backend?.on('error',error=>console.error('Inference service:',error.message));
process.on('exit',()=>backend?.kill());
process.on('SIGINT',()=>{backend?.kill();process.exit();});
process.on('SIGTERM',()=>{backend?.kill();process.exit();});
http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){
    if(!backend){res.writeHead(404);return res.end('Browser inference requires no API');}
    if(!['/api/health','/api/recognize','/api/demo'].includes(req.url)){res.writeHead(404);return res.end();}
    if(req.headers.origin && !['http://127.0.0.1:3000','http://localhost:3000'].includes(req.headers.origin)){res.writeHead(403);return res.end();}
    if(Number(req.headers['content-length']||0)>3000000){res.writeHead(413);return res.end();}
    const proxy=http.request({host:'127.0.0.1',port:3001,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3001'},timeout:30000},upstream=>{
      res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);
    });
    proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Local model unavailable"}');});
    proxy.on('timeout',()=>proxy.destroy());req.pipe(proxy);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let file;
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}
  catch{res.writeHead(400);return res.end('Bad request');}
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  sendFile(req,res,file,types[path.extname(file)]||'application/octet-stream');
}).listen(3000,'127.0.0.1',()=>console.log('Qoldau AI: http://127.0.0.1:3000'));
