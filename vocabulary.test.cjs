const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const words=require('./data/words.json').words,refs=require('./gesture-data/references.json'),manifest=require('./gesture-data/manifest.json'),examples=require('./examples/words/manifest.json'),classes=require('./vendor/slovo/classes.json');
test('all fifty words have matching source classes, reference sequences and videos',()=>{
 assert.equal(words.length,50);assert.equal(new Set(words.map(w=>w.id)).size,50);assert.equal(examples.length,50);
 for(const word of words){
  assert.equal(classes[word.slovoClass],word.sourceLabel,word.id);
  assert.ok(refs.templates.some(t=>t.wordId===word.id&&t.sequence.length===40),word.id+' references');
  assert.ok(Number.isFinite(refs.options.maxDistanceByWord[word.id]),word.id+' calibrated limit');
  const example=examples.find(e=>e.wordId===word.id);assert.equal(example.sourceLabel,word.sourceLabel);
  assert.ok(fs.statSync('examples/words/'+word.id+'.mp4').size>1000);
  assert.ok(manifest.some(r=>r.file===example.sourceFile&&r.wordId===word.id));
 }
 assert.deepEqual(new Set(refs.templates.map(t=>t.wordId)),new Set(words.map(w=>w.id)));
});
test('expanded dataset has twenty distinct clips per word and disjoint negatives',()=>{
 assert.equal(new Set(manifest.map(r=>r.id)).size,manifest.length);
 const supported=new Set(words.map(w=>w.sourceLabel));
 for(const word of words){const rows=manifest.filter(r=>r.wordId===word.id);assert.equal(rows.length,20,word.id);assert.equal(rows.filter(r=>r.train.toLowerCase()==='false').length,5,word.id);}
 const negatives=manifest.filter(r=>r.wordId==='__unknown__');assert.equal(negatives.length,24);assert.ok(negatives.every(r=>!supported.has(r.text)));assert.ok(refs.templates.every(r=>r.wordId!=='__unknown__'));
});
