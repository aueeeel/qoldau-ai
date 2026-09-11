/* Personal template matcher; thresholds are heuristic, not calibrated probabilities. */
(function (root) {
  'use strict';
  function features(result) {
    const out = Array(132).fill(0);
    result.landmarks.forEach((hand, index) => {
      const slot = result.handedness[index]?.[0]?.categoryName === 'Left' ? 0 : 66;
      const wrist = hand[0];
      const scale = Math.max(0.03, Math.hypot(hand[9].x-wrist.x, hand[9].y-wrist.y));
      out[slot] = 1;
      out[slot+1] = wrist.x * 2;
      out[slot+2] = wrist.y * 2;
      hand.forEach((p, i) => {
        out[slot+3+i*3] = (p.x-wrist.x)/scale;
        out[slot+4+i*3] = (p.y-wrist.y)/scale;
        out[slot+5+i*3] = (p.z-wrist.z)/scale;
      });
    });
    return out;
  }
  function resample(frames, count = 24) {
    if (!frames.length) return [];
    return Array.from({length:count}, (_, i) => frames[Math.round(i*(frames.length-1)/(count-1))].slice());
  }
  function frameDistance(a,b) {
    let sum=0, count=0;
    for (const s of [0,66]) {
      if (a[s] !== b[s]) { sum+=2; count++; continue; }
      if (!a[s]) continue;
      let hand=0;
      for(let i=1;i<66;i++) hand+=(a[s+i]-b[s+i])**2;
      sum+=Math.sqrt(hand/65); count++;
    }
    return count ? sum/count : 0;
  }
  function distance(a,b) {
    if(!a.length || !b.length) return Infinity;
    const matrix=Array.from({length:a.length+1},()=>Array(b.length+1).fill(Infinity));
    matrix[0][0]=0;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
      matrix[i][j]=frameDistance(a[i-1],b[j-1])+Math.min(matrix[i-1][j],matrix[i][j-1],matrix[i-1][j-1]);
    }
    return matrix[a.length][b.length]/Math.max(a.length,b.length);
  }
  function recognize(sequence,samples) {
    const groups=new Map();
    for(const sample of samples) {
      if(!groups.has(sample.wordId)) groups.set(sample.wordId,[]);
      groups.get(sample.wordId).push(distance(sequence,sample.sequence));
    }
    const ranked=[...groups].filter(([,ds])=>ds.length>=3).map(([wordId,ds])=> {
      ds.sort((a,b)=>a-b);
      return {wordId,distance:(ds[0]+ds[1])/2};
    }).sort((a,b)=>a.distance-b.distance);
    if(ranked.length<2) return {wordId:null,reason:'training'};
    const [best,next]=ranked;
    if(best.distance>0.24 || next.distance-best.distance<0.06) return {wordId:null,reason:'unknown'};
    return {...best,reason:'match'};
  }
  const api={features,resample,distance,recognize};
  if(typeof module!=='undefined') module.exports=api;
  else root.GestureMatcher=api;
})(globalThis);
