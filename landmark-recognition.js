/* Versioned, shared browser/offline sequence pipeline. Scores are distances, not probabilities. */
(function(root){
'use strict';
const VERSION=4,FRAMES=40,HAND=136,SIZE=HAND*2;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const median=values=>{const a=values.slice().sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};
const clip=(v,limit=5)=>Math.max(-limit,Math.min(limit,v));
function fromResults(hands,pose,t,aspect=1){
 return {t,aspect,hands:hands.landmarks.map((points,i)=>({side:hands.handedness[i]?.[0]?.categoryName||'Right',points:points.map(p=>[p.x,p.y,p.z])})),pose:(pose?.landmarks?.[0]||[]).map(p=>[p.x,p.y,p.z,p.visibility??1])};
}
function normalize(raw){
 if(!Array.isArray(raw)||raw.length<8)return {sequence:[],reason:'frames',quality:{validFrames:0,totalFrames:raw?.length||0}};
 const totalFrames=raw.length,duration=raw.at(-1).t-raw[0].t;
 const firstHand=raw.findIndex(f=>f.hands.length);let lastHand=raw.length-1;
 while(lastHand>firstHand&&!raw[lastHand].hands.length)lastHand--;
 if(firstHand>=0)raw=raw.slice(firstHand,lastHand+1);
 // MediaPipe occasionally assigns the same handedness to both detected hands.
 // Keep both tracks; solve the two possible assignments against body wrists.
 raw=raw.map(f=>{
  if(f.hands.length!==2||f.hands[0].side!==f.hands[1].side||f.pose?.length<17)return f;
  const cost=(h,p)=>Math.hypot((h.points[0][0]-p[0])*f.aspect,h.points[0][1]-p[1]);
  const [a,b]=f.hands,normal=cost(a,f.pose[15])+cost(b,f.pose[16])<=cost(a,f.pose[16])+cost(b,f.pose[15]);
  return {...f,hands:[{...a,side:normal?'Left':'Right'},{...b,side:normal?'Right':'Left'}]};
 });
 const valid=raw.filter(f=>f.hands?.length),poses=raw.filter(f=>f.pose?.length>=17&&f.pose[11][3]>.4&&f.pose[12][3]>.4);
 const quality={validFrames:valid.length,totalFrames,activeFrames:raw.length,poseFrames:poses.length,duration,left:valid.filter(f=>f.hands.some(h=>h.side==='Left')).length,right:valid.filter(f=>f.hands.some(h=>h.side==='Right')).length};
 if(valid.length<8||valid.length/raw.length<.4)return {sequence:[],reason:'hands',quality};
 if(poses.length/raw.length<.4)return {sequence:[],reason:'body',quality};
 const bodyScale=median(poses.map(f=>Math.hypot((f.pose[11][0]-f.pose[12][0])*f.aspect,f.pose[11][1]-f.pose[12][1])));
 if(bodyScale<.04)return {sequence:[],reason:'body',quality};
 const palmScales=[[],[]];
 for(const f of raw)for(const h of f.hands){const a=h.points[0],b=h.points[9];palmScales[h.side==='Left'?0:1].push(Math.hypot((b[0]-a[0])*f.aspect,b[1]-a[1],(b[2]-a[2])*f.aspect));}
 const scales=palmScales.map(a=>Math.max(.01,median(a)));
 let previousPose=poses[0].pose;
 const frames=raw.map(f=>{
  if(f.pose?.length>=17&&f.pose[11][3]>.4&&f.pose[12][3]>.4)previousPose=f.pose;
  const p=previousPose,cx=(p[11][0]+p[12][0])*.5*f.aspect,cy=(p[11][1]+p[12][1])*.5;
  const vector=Array(SIZE).fill(0);
  for(const h of f.hands){
   const slot=h.side==='Left'?0:HAND,w=h.points[0],scale=scales[slot?1:0];
   vector[slot]=1;vector[slot+1]=clip((w[0]*f.aspect-cx)/bodyScale);vector[slot+2]=clip((w[1]-cy)/bodyScale);
   // Associate by position, not the hand model's mirrored handedness convention.
   const wristIndex=Math.hypot((p[15][0]-w[0])*f.aspect,p[15][1]-w[1])<Math.hypot((p[16][0]-w[0])*f.aspect,p[16][1]-w[1])?15:16;
   const elbow=p[wristIndex-2];vector[slot+3]=clip((elbow[0]*f.aspect-cx)/bodyScale);vector[slot+4]=clip((elbow[1]-cy)/bodyScale);
   vector[slot+70]=clip((p[wristIndex][2]-(p[11][2]+p[12][2])*.5)*f.aspect/bodyScale);
   vector[slot+72]=Math.hypot((h.points[9][0]-w[0])*f.aspect,h.points[9][1]-w[1])/scale;
   const local=h.points.map(point=>[(point[0]-w[0])*f.aspect/scale,(point[1]-w[1])/scale,(point[2]-w[2])*f.aspect/scale]);
   const yAxis=unit(local[9]),across=local[5].map((v,k)=>v-local[17][k]),along=dot(across,yAxis),xAxis=unit(across.map((v,k)=>v-along*yAxis[k]));
   const zAxis=[xAxis[1]*yAxis[2]-xAxis[2]*yAxis[1],xAxis[2]*yAxis[0]-xAxis[0]*yAxis[2],xAxis[0]*yAxis[1]-xAxis[1]*yAxis[0]];
   local.forEach((point,i)=>{for(let k=0;k<3;k++)vector[slot+5+i*3+k]=clip(point[k]);vector[slot+73+i*3]=clip(dot(point,xAxis));vector[slot+74+i*3]=clip(dot(point,yAxis));vector[slot+75+i*3]=clip(dot(point,zAxis));});
  }
  return {t:f.t,vector};
 });
 // Bridge only short detector dropouts, never an absent second hand throughout a sign.
 for(const slot of [0,HAND])for(let i=1;i<frames.length-1;i++)if(!frames[i].vector[slot]&&frames[i-1].vector[slot]){
  let end=i;while(end<frames.length&&!frames[end].vector[slot])end++;
  if(end<frames.length&&frames[end].t-frames[i-1].t<=250){for(let k=i;k<end;k++){const ratio=(frames[k].t-frames[i-1].t)/(frames[end].t-frames[i-1].t);for(let j=0;j<HAND;j++)frames[k].vector[slot+j]=frames[i-1].vector[slot+j]*(1-ratio)+frames[end].vector[slot+j]*ratio;}}
 }
 // Remove only leading/trailing frames with no hands; preserve internal pauses.
 const first=frames.findIndex(f=>f.vector[0]||f.vector[HAND]);let last=frames.length-1;
 while(last>first&&!frames[last].vector[0]&&!frames[last].vector[HAND])last--;
 const trimmed=frames.slice(first,last+1),sequence=resample(trimmed);
 // Wrist velocities retain direction. Smooth locally before differentiating.
 for(const slot of [0,HAND])for(let i=0;i<sequence.length;i++){
  const a=sequence[Math.max(0,i-1)],b=sequence[Math.min(sequence.length-1,i+1)];
  if(a[slot]&&b[slot]){sequence[i][slot+68]=(b[slot+1]-a[slot+1])*5;sequence[i][slot+69]=(b[slot+2]-a[slot+2])*5;sequence[i][slot+71]=(b[slot+70]-a[slot+70])*5;}
 }
 return {sequence,quality,reason:'ok'};
}
function resample(frames,count=FRAMES){
 if(!frames.length)return [];let cursor=0;const start=frames[0].t,end=frames.at(-1).t;
 return Array.from({length:count},(_,i)=>{
  const t=start+(end-start)*i/(count-1);while(cursor+1<frames.length&&frames[cursor+1].t<t)cursor++;
  const a=frames[cursor],b=frames[Math.min(cursor+1,frames.length-1)],ratio=b.t>a.t?(t-a.t)/(b.t-a.t):0,out=Array(SIZE).fill(0);
  for(const slot of [0,HAND]){
   if(a.vector[slot]!==b.vector[slot]){const nearest=ratio<.5?a:b;for(let j=0;j<HAND;j++)out[slot+j]=nearest.vector[slot+j];}
   else for(let j=0;j<HAND;j++)out[slot+j]=a.vector[slot+j]*(1-ratio)+b.vector[slot+j]*ratio;
  }
  return out;
 });
}
function mirror(sequence){return sequence.map(frame=>{const out=Array(SIZE).fill(0);for(const source of [0,HAND]){const target=source?0:HAND;for(let k=0;k<HAND;k++)out[target+k]=frame[source+k];for(const k of [1,3,68])out[target+k]*=-1;for(let k=5;k<68;k+=3)out[target+k]*=-1;for(let k=75;k<HAND;k+=3)out[target+k]*=-1;}return out;});}
function frameDistance(a,b,weights){
 let sum=0,count=0;
 for(const s of [0,HAND]){
  if(!a[s]&&!b[s])continue;count++;
  if(!a[s]||!b[s]){sum+=weights.missing;continue;}
  let shape=0,canonical=0;
  for(let j=5;j<68;j+=3){shape+=(a[s+j]-b[s+j])**2+(a[s+j+1]-b[s+j+1])**2+.2*(a[s+j+2]-b[s+j+2])**2;}
  if(weights.canonical)for(let j=73;j<HAND;j+=3)canonical+=(a[s+j]-b[s+j])**2+(a[s+j+1]-b[s+j+1])**2+.5*(a[s+j+2]-b[s+j+2])**2;
  const position=Math.hypot(a[s+1]-b[s+1],a[s+2]-b[s+2]);
  const elbow=Math.hypot(a[s+3]-b[s+3],a[s+4]-b[s+4]);
  const velocity=Math.hypot(a[s+68]-b[s+68],a[s+69]-b[s+69]);
  const depth=Math.abs(a[s+70]-b[s+70])+.3*Math.abs(a[s+71]-b[s+71]);
  sum+=weights.shape*Math.sqrt(shape/42)+(weights.canonical||0)*Math.sqrt(canonical/42)+weights.position*position+weights.elbow*elbow+weights.velocity*velocity+(weights.depth||0)*depth+(weights.palm||0)*Math.abs(a[s+72]-b[s+72]);
 }
 return count?sum/count:0;
}
const DEFAULT={shape:.55,position:.3,elbow:.05,velocity:.1,depth:0,palm:0,missing:.9,maxDistance:.65,minMargin:.08,k:2,band:10,distinctSigners:false};
function distance(a,b,options={}){
 if(!a.length||!b.length)return Infinity;
 const weights={...DEFAULT,...options},n=a.length,m=b.length;
 let prev=new Float64Array(m+1).fill(Infinity),next=new Float64Array(m+1);prev[0]=0;
 const band=Math.max(weights.band,Math.abs(n-m));
 for(let i=1;i<=n;i++){
  next.fill(Infinity);
  for(let j=Math.max(1,i-band);j<=Math.min(m,i+band);j++)next[j]=frameDistance(a[i-1],b[j-1],weights)+Math.min(prev[j],next[j-1],prev[j-1]);
  [prev,next]=[next,prev];
 }
 return prev[m]/Math.max(n,m);
}
function rank(sequence,templates,options={}){
 const opts={...DEFAULT,...options},flipped=mirror(sequence),groups=new Map();
 for(const sample of templates){
  if(!sample.sequence?.length||sample.wordId==='__unknown__')continue;
  const d=Math.min(distance(sequence,sample.sequence,opts),distance(flipped,sample.sequence,opts));
  if(!groups.has(sample.wordId))groups.set(sample.wordId,new Map());
  const signers=groups.get(sample.wordId),signer=opts.distinctSigners?(sample.signerId||sample.id):sample.id;
  signers.set(signer,Math.min(d,signers.get(signer)??Infinity));
 }
 return [...groups].map(([wordId,signers])=>{const ds=[...signers.values()].sort((a,b)=>a-b).slice(0,opts.k);return {wordId,distance:ds.reduce((a,b)=>a+b,0)/ds.length,references:signers.size};}).sort((a,b)=>a.distance-b.distance);
}
function decide(ranked,options={}){
 const opts={...DEFAULT,...options},[best,next]=ranked;
 if(!next)return {wordId:null,reason:'references',top:ranked.slice(0,3)};
 const margin=(next.distance-best.distance)/Math.max(next.distance,1e-6);
 const maximum=opts.maxDistanceByWord?.[best.wordId]??opts.maxDistance;
 const accepted=best.distance<=maximum&&margin>=opts.minMargin;
 return {wordId:accepted?best.wordId:null,reason:accepted?'match':best.distance>maximum?'distance':'ambiguous',distance:best.distance,margin,top:ranked.slice(0,3)};
}
function recognize(sequence,templates,options={}){return sequence.length?decide(rank(sequence,templates,options),options):{wordId:null,reason:'frames',top:[]};}
const api={VERSION,FRAMES,HAND,SIZE,DEFAULT,fromResults,normalize,resample,mirror,frameDistance,distance,rank,decide,recognize};
if(typeof module!=='undefined')module.exports=api;else root.LandmarkRecognizer=api;
})(globalThis);
