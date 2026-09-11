"""Offline only. Runtime uses the same Tasks Vision models entirely in the browser."""
import sys,pathlib,json,time,os
from concurrent.futures import ProcessPoolExecutor,as_completed
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.gesture-tools'));os.environ['TF_CPP_MIN_LOG_LEVEL']='2'
import cv2,numpy as np,mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
cv2.setNumThreads(1)
HAND_MODEL=(ROOT/"vendor/models/hand_landmarker.task").read_bytes()
POSE_MODEL=(ROOT/"vendor/models/pose_landmarker_lite.task").read_bytes()
class OfflineBaseOptions(python.BaseOptions):
 def to_pb2(self):
  options=super().to_pb2()
  # Avoid oversubscribing CPU cores across extraction worker processes.
  options.acceleration.xnnpack.num_threads=1
  return options

OUT=ROOT/'gesture-data/raw';OUT.mkdir(parents=True,exist_ok=True)
def extract(row):
 dest=OUT/(row['id']+'.json')
 if dest.exists():
  cached=json.loads(dest.read_text(encoding='utf-8'));quality={**cached['quality'],'wordId':row['wordId']}
  if cached.get('wordId')!=row['wordId']:
   cached.update(row);cached['quality']=quality;dest.write_text(json.dumps(cached,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
  return quality
 frames=[];cap=cv2.VideoCapture(str(ROOT/'gesture-data/videos'/row['file']))
 fps=cap.get(cv2.CAP_PROP_FPS) or 25;index=0;next_time=0
 try:
  with vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=OfflineBaseOptions(model_asset_buffer=HAND_MODEL),running_mode=vision.RunningMode.VIDEO,num_hands=2,min_hand_detection_confidence=.5,min_hand_presence_confidence=.5,min_tracking_confidence=.5)) as hands, vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=OfflineBaseOptions(model_asset_buffer=POSE_MODEL),running_mode=vision.RunningMode.VIDEO,num_poses=1,min_pose_detection_confidence=.5,min_pose_presence_confidence=.5,min_tracking_confidence=.5)) as pose:
   while True:
    ok,im=cap.read()
    if not ok:break
    timestamp=round(index/fps*1000);index+=1
    if timestamp<next_time:continue
    next_time=timestamp+45
    h,w=im.shape[:2];scale=min(640/w,480/h,1)
    im=cv2.resize(im,(round(w*scale),round(h*scale)))
    image=mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(im,cv2.COLOR_BGR2RGB))
    hr=hands.detect_for_video(image,timestamp);pr=pose.detect_for_video(image,timestamp)
    frames.append({'t':timestamp,'aspect':w/h,'hands':[{'side':hr.handedness[i][0].category_name,'points':[[round(p.x,5),round(p.y,5),round(p.z,5)] for p in hand]} for i,hand in enumerate(hr.hand_landmarks)],'pose':[[round(p.x,5),round(p.y,5),round(p.z,5),round(p.visibility,3)] for p in pr.pose_landmarks[0]] if pr.pose_landmarks else []})
 finally:cap.release()
 quality={'id':row['id'],'wordId':row['wordId'],'frames':len(frames),'validFrames':sum(bool(f['hands']) for f in frames),'poseFrames':sum(bool(f['pose']) for f in frames)}
 data={**row,'extractor':'MediaPipe Tasks 0.10.21 hand + pose lite','quality':quality,'frames':frames}
 dest.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 return quality
if __name__=='__main__':
 manifest=json.loads((ROOT/'gesture-data/manifest.json').read_text(encoding='utf-8'));results=[];started=time.time()
 with ProcessPoolExecutor(max_workers=int(os.environ.get('QOLDAU_EXTRACT_WORKERS','4'))) as pool:
  for future in as_completed([pool.submit(extract,row) for row in manifest]):
   results.append(future.result())
   if len(results)%10==0:print('Extracted',len(results),'/',len(manifest),'in',round(time.time()-started),'seconds',flush=True)
 (ROOT/'gesture-data/quality.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Finished',len(results),'videos',flush=True)

