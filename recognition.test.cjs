const {test}=require('node:test');
const assert=require('node:assert/strict');
const {features,resample,distance,recognize}=require('./recognition.js');
function sequence(offset){return Array.from({length:24},(_,i)=>{const f=Array(132).fill(0);f[0]=1;for(let j=1;j<66;j++)f[j]=offset+i/100;return f;});}
const a=sequence(0),b=sequence(1),samples=[0,1,2].flatMap(i=>[{wordId:'salem',sequence:a},{wordId:'raqmet',sequence:b}]);
test('recognizes held-out small variation',()=>assert.equal(recognize(sequence(.02),samples).wordId,'salem'));
test('rejects distant unknown gesture',()=>assert.equal(recognize(sequence(5),samples).wordId,null));
test('rejects ambiguous labels',()=>assert.equal(recognize(a,samples.map(s=>({...s,sequence:a}))).reason,'unknown'));
test('requires 3 samples per label and 2 labels',()=>assert.equal(recognize(a,samples.slice(0,4)).reason,'training'));
test('preserves motion under sampling',()=>{const c=resample([a[0],a[23]]);assert.equal(c.length,24);assert.deepEqual(c[0],a[0]);assert.deepEqual(c[23],a[23]);assert.equal(distance(a,a),0);});
test('missing hands produce finite empty features',()=>assert.deepEqual(features({landmarks:[],handedness:[]}),Array(132).fill(0)));
test('hand slots do not depend on detector output order',()=>{const h=Array.from({length:21},(_,i)=>({x:.2+i/100,y:.4+i/200,z:0}));const k=h.map(p=>({...p,x:p.x+.2}));assert.deepEqual(features({landmarks:[h,k],handedness:[[{categoryName:'Left'}],[{categoryName:'Right'}]]}),features({landmarks:[k,h],handedness:[[{categoryName:'Right'}],[{categoryName:'Left'}]]}));});
