const test=require('node:test'),assert=require('node:assert/strict');
const {GestureCapture,resampleTimed}=require('./capture.js');
const frame=(time,hands=2,motion=.03)=>({time,hands,motion,image:String(time)});
test('uniform time sampling handles an uneven camera rate and preserves both ends',()=>{
 const result=resampleTimed([0,30,60,400,700,1000].map(t=>frame(t)),5);
 assert.deepEqual(result,['0','400','400','700','1000']);
});
test('guided recording excludes countdown and produces exactly 32 frames',()=>{
 const capture=new GestureCapture();capture.begin(0);
 assert.deepEqual(capture.push(frame(1000)),{phase:'countdown',remaining:2});
 let result;for(let t=2500;t<=4900;t+=80)result=capture.push(frame(t));
 assert.equal(result.phase,'complete');assert.equal(result.frames.length,32);
 assert.equal(result.frames[0],'2500');assert.equal(result.frames.at(-1),'4900');
 assert.equal(capture.phase,'waiting');assert.equal(capture.frames.length,0);
});
test('slow camera does not shorten the gesture window',()=>{
 const capture=new GestureCapture();capture.begin(0);let result;
 for(let t=2500;t<=4900;t+=200)result=capture.push(frame(t));
 assert.equal(result.phase,'complete');assert.equal(result.duration,2400);assert.equal(result.frames.length,32);
});
test('automatic capture retains lead-in and waits for the end of movement',()=>{
 const capture=new GestureCapture();let result;
 for(let t=0;t<=1700;t+=100){result=capture.push(frame(t,2,t>=400&&t<=1000?.03:0),true);if(result.phase==='complete')break;}
 assert.equal(result.phase,'complete');assert.equal(result.frames[0],'200');assert.equal(result.frames.at(-1),'1200');
});
test('one tracking jump does not trigger automatic capture',()=>{
 const capture=new GestureCapture();capture.push(frame(0,2,0),true);capture.push(frame(100),true);
 assert.equal(capture.push(frame(200,2,0),true).phase,'waiting');
});
test('guided motion is trimmed with context at both ends',()=>{
 const capture=new GestureCapture();capture.begin(0);let result;
 for(let t=2500;t<=4900;t+=100)result=capture.push(frame(t,2,t>=3200&&t<=4000?.03:0));
 assert.equal(result.phase,'complete');assert.equal(result.frames[0],'3000');assert.equal(result.frames.at(-1),'4200');
});
test('no hands or too few frames is rejected before inference',()=>{
 const capture=new GestureCapture();capture.begin(0);let result;
 for(let t=2500;t<=4900;t+=100)result=capture.push(frame(t,0,0));
 assert.equal(result.phase,'invalid');
 capture.begin(0);capture.push(frame(2500));assert.equal(capture.push(frame(4900)).phase,'invalid');
});
test('stop/reset cancels a pending gesture and discards its images',()=>{
 const capture=new GestureCapture();capture.begin(0);capture.push(frame(2500));capture.reset();
 assert.equal(capture.push(frame(5000)).phase,'waiting');assert.equal(capture.frames.length,0);
});
