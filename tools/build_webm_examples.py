import sys,pathlib,json,os
from concurrent.futures import ThreadPoolExecutor
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.gesture-tools'))
import cv2
cv2.setNumThreads(1)
def convert(word):
 source=ROOT/'examples/words'/(word['id']+'.mp4');dest=source.with_suffix('.webm')
 if dest.exists() and dest.stat().st_mtime>=source.stat().st_mtime:return word['id']+' cached'
 cap=cv2.VideoCapture(str(source));fps=cap.get(cv2.CAP_PROP_FPS) or 25
 w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
 if not cap.isOpened() or not w or not h:raise RuntimeError('Cannot open '+str(source))
 scale=min(960/w,720/h,1);size=(max(2,round(w*scale/2)*2),max(2,round(h*scale/2)*2))
 temp=source.with_suffix('.partial.webm');writer=cv2.VideoWriter(str(temp),cv2.VideoWriter_fourcc(*'VP80'),fps,size)
 if not writer.isOpened():raise RuntimeError('VP8 encoder unavailable')
 count=0
 try:
  while True:
   ok,frame=cap.read()
   if not ok:break
   writer.write(cv2.resize(frame,size));count+=1
 finally:writer.release();cap.release()
 check=cv2.VideoCapture(str(temp));decoded=0
 while True:
  ok,frame=check.read()
  if not ok:break
  decoded+=1
 check.release()
 if count==0 or decoded!=count:raise RuntimeError('Incomplete conversion '+word['id'])
 os.replace(temp,dest)
 return f"{word['id']}: {count} frames, {size[0]}x{size[1]}"
if __name__=='__main__':
 words=json.loads((ROOT/os.environ.get('QOLDAU_VOCABULARY','data/words.json')).read_text(encoding='utf-8-sig'))['words']
 if '--sample' in sys.argv:words=words[:1]
 with ThreadPoolExecutor(max_workers=2) as pool:
  for result in pool.map(convert,words):print(result,flush=True)
 print('Verified WebM videos:',len(words),flush=True)
