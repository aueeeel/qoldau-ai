const test=require('node:test'),assert=require('node:assert/strict'),R=require('./landmark-recognition.js');
function raw({dx=0,dy=0,scale=1,reverse=false,side='Right'}={}){
 const transform=p=>[p[0]*scale+dx,p[1]*scale+dy,p[2]*scale,p[3]??1];
 return Array.from({length:35},(_,i)=>{
  const t=reverse?34-i:i,pose=Array.from({length:33},()=>[.5,.4,0,1]);
  pose[11]=[.65,.45,0,1];pose[12]=[.35,.45,0,1];pose[13]=[.72,.62,0,1];pose[14]=[.28,.62,0,1];
  const points=Array.from({length:21},(_,j)=>transform([.3+t*.007+(j%4)*.016,.4-Math.floor(j/4)*.015,j*.001]));
  return {t:i*60,aspect:4/3,pose:pose.map(transform),hands:[{side,points}]};
 });
}
test('normalization removes translation and person scale while preserving direction',()=>{
 const a=R.normalize(raw()).sequence,b=R.normalize(raw({scale:.7,dx:.1,dy:.15})).sequence;
 assert.equal(a.length,40);assert.ok(R.distance(a,b)<1e-10);
 assert.ok(R.distance(a,R.normalize(raw({reverse:true})).sequence)>.1);
});
test('two mirror operations preserve both hands and movement',()=>{
 const a=R.normalize(raw()).sequence;assert.deepEqual(R.mirror(R.mirror(a)),a);
});
test('interpolation produces intermediate positions, not nearest-frame copies',()=>{
 const a=Array(R.SIZE).fill(0),b=a.slice();a[0]=b[0]=1;b[1]=2;
 const result=R.resample([{t:0,vector:a},{t:100,vector:b}],3);
 assert.equal(result[1][1],1);
});
test('hand detector output order does not change slots',()=>{
 const frames=raw();for(const f of frames)f.hands.push({side:'Left',points:f.hands[0].points.map(p=>[p[0]+.25,p[1],p[2]])});
 const a=R.normalize(frames).sequence;frames.forEach(f=>f.hands.reverse());
 assert.deepEqual(R.normalize(frames).sequence,a);
});
test('relative position of two hands survives independent hand shape normalization',()=>{
 const frames=raw();for(const f of frames)f.hands.push({side:'Left',points:f.hands[0].points.map(p=>[p[0]+.2,p[1],p[2]])});
 const a=R.normalize(frames).sequence;
 for(const f of frames)for(const p of f.hands[1].points)p[0]+=.2;
 assert.ok(R.distance(a,R.normalize(frames).sequence)>.05);
});
test('duplicate detector labels do not overwrite the second hand',()=>{
 const frames=raw();for(const f of frames)f.hands.push({side:'Right',points:f.hands[0].points.map(p=>[p[0]+.25,p[1],p[2]])});
 const result=R.normalize(frames);assert.ok(result.sequence.every(f=>f[0]===1&&f[R.HAND]===1));
});
test('no hands and no shoulders are rejected, not classified',()=>{
 let frames=raw();frames.forEach(f=>f.hands=[]);assert.equal(R.normalize(frames).reason,'hands');
 frames=raw();frames.forEach(f=>f.pose=[]);assert.equal(R.normalize(frames).reason,'body');
});
test('a complete short sign is not rejected because hands were lowered during preparation',()=>{
 const frames=raw();for(let i=0;i<frames.length;i++)if(i<20||i>30)frames[i].hands=[];
 const result=R.normalize(frames);assert.equal(result.reason,'ok');assert.equal(result.quality.validFrames,11);assert.equal(result.quality.totalFrames,35);assert.equal(result.quality.activeFrames,11);
});
test('unrelated and ambiguous sequences are rejected instead of forced to a word',()=>{
 assert.equal(R.decide([{wordId:'a',distance:2},{wordId:'b',distance:3}]).wordId,null);
 assert.equal(R.decide([{wordId:'a',distance:.3},{wordId:'b',distance:.301}]).wordId,null);
});
test('learned per-class distance limits still reject excessive distance',()=>{
 const top=[{wordId:'a',distance:.5},{wordId:'b',distance:.9}];
 assert.equal(R.decide(top,{maxDistanceByWord:{a:.4}}).wordId,null);
 assert.equal(R.decide(top,{maxDistanceByWord:{a:.6}}).wordId,'a');
});
test('multiple references from one signer do not outvote different signers',()=>{
 const sequence=R.normalize(raw()).sequence;
 const templates=[{id:'1',wordId:'a',signerId:'person1',sequence},{id:'2',wordId:'a',signerId:'person1',sequence},{id:'3',wordId:'a',signerId:'person2',sequence:R.normalize(raw({reverse:true})).sequence}];
 const ranked=R.rank(sequence,templates,{distinctSigners:true});assert.equal(ranked[0].references,2);assert.ok(ranked[0].distance>0);
});

test('3D palm scale does not collapse for a hand turned toward the camera',()=>{
 const a=raw(),b=structuredClone(a);
 for(const f of b)for(const h of f.hands){const wrist=h.points[0].slice();for(const p of h.points){const y=p[1]-wrist[1],z=(p[2]-wrist[2])*f.aspect;p[1]=wrist[1]+z;p[2]=wrist[2]-y/f.aspect;}}
 const first=R.normalize(a).sequence[10],turned=R.normalize(b).sequence[10];let error=0;
 for(let i=73;i<R.HAND;i++)error+=Math.abs(first[R.HAND+i]-turned[R.HAND+i]);
 assert.ok(error<1e-6);
});

test('import recomputes untrusted feature vectors and isolates signer identities',()=>{
 const {validate}=require('./tools/import_samples.cjs');
 const result=validate({id:'example-001',version:2,wordId:'ake',signerId:' person-01 ',frames:raw(),sequence:[[999]],quality:{validFrames:999}},new Set(['ake']));
 assert.equal(result.version,R.VERSION);assert.equal(result.signerId,'local:person-01');assert.equal(result.sequence.length,40);assert.equal(result.quality.validFrames,35);assert.equal(result.split,'train');
});
test('import rejects paths, unsupported labels and corrupted frame timing',()=>{
 const {validate}=require('./tools/import_samples.cjs');
 const sample={id:'example-001',version:R.VERSION,wordId:'ake',signerId:'person-01',frames:raw()};
 assert.throws(()=>validate({...sample,id:'../../outside'},new Set(['ake'])),/valid ID/);
 assert.throws(()=>validate({...sample,wordId:'unsupported'},new Set(['ake'])),/label/);
 const frames=raw();frames[5].t=frames[4].t;
 assert.throws(()=>validate({...sample,frames},new Set(['ake'])),/timestamp/);
});
test('import rejects missing shoulders instead of saving unusable references',()=>{
 const {validate}=require('./tools/import_samples.cjs');const frames=raw();frames.forEach(f=>f.pose=[]);
 assert.throws(()=>validate({id:'example-001',version:R.VERSION,wordId:'ake',signerId:'person-01',frames},new Set(['ake'])),/tracking quality: body/);
});
