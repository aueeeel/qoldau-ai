/* Capture one complete gesture; model input is resampled in time, not camera frame count. */
(function(root){
  function resampleTimed(frames,count=32){
    if(!frames.length)return [];
    const start=frames[0].time,end=frames.at(-1).time;
    let cursor=0;
    return Array.from({length:count},(_,i)=>{
      const target=start+(end-start)*i/(count-1);
      while(cursor+1<frames.length&&Math.abs(frames[cursor+1].time-target)<Math.abs(frames[cursor].time-target))cursor++;
      return frames[cursor].image;
    });
  }
  class GestureCapture{
    constructor(){this.reset();}
    reset(){this.frames=[];this.history=[];this.phase='waiting';this.start=0;this.lastMove=0;this.motionCount=0;}
    begin(now){this.reset();this.phase='countdown';this.start=now+2500;}
    push(frame,automatic=false){
      const now=frame.time;
      if(this.phase==='countdown'){
        if(now<this.start)return {phase:'countdown',remaining:Math.ceil((this.start-now)/1000)};
        this.phase='guided';
      }
      if(this.phase==='guided'){
        this.frames.push(frame);
        if(now-this.start>=2400)return this.finish();
        return {phase:'recording',progress:Math.min(100,(now-this.start)/24)};
      }
      if(!automatic){this.history=[];return {phase:'waiting'};}
      const moving=frame.hands>0&&frame.motion>.012;
      if(this.phase==='waiting'){
        this.history.push(frame);this.history=this.history.filter(f=>now-f.time<=400);
        this.motionCount=moving?this.motionCount+1:0;
        if(this.motionCount>=2){this.phase='automatic';this.frames=this.history.slice();this.start=now;this.lastMove=now;}
      }else{
        this.frames.push(frame);if(moving)this.lastMove=now;
        if(now-this.start>=800&&(now-this.lastMove>550||now-this.start>3500))return this.finish();
      }
      return {phase:this.phase==='automatic'?'recording':'waiting',progress:Math.min(100,(now-this.start)/35)};
    }
    finish(){
      let frames=this.frames.slice();this.reset();
      // Retain a little context on both sides, but do not stretch preparation/rest
      // across the model's 32 slots. Never infer a word from this motion signal.
      const moving=frames.filter(f=>f.hands>0&&f.motion>.008);
      if(moving.length>=3){const start=moving[0].time-200,end=moving.at(-1).time+250;frames=frames.filter(f=>f.time>=start&&f.time<=end);}
      const duration=frames.length?frames.at(-1).time-frames[0].time:0;
      const visible=frames.filter(f=>f.hands>0).length;
      if(frames.length<10||duration<500||visible/frames.length<.4)return {phase:'invalid'};
      return {phase:'complete',frames:resampleTimed(frames),duration};
    }
  }
  const api={GestureCapture,resampleTimed};
  if(typeof module!=='undefined')module.exports=api;else root.CaptureTools=api;
})(globalThis);
