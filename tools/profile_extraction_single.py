import pathlib,json,time,collections
import extract_landmarks as e
stats=collections.defaultdict(float);counts=collections.Counter()
def instrument(owner,name):
 original=getattr(owner,name)
 def call(*args,**kwargs):
  start=time.perf_counter()
  try:return original(*args,**kwargs)
  finally:stats[name]+=time.perf_counter()-start;counts[name]+=1
 setattr(owner,name,call)
instrument(e.vision.HandLandmarker,'create_from_options')
instrument(e.vision.PoseLandmarker,'create_from_options')
instrument(e.vision.HandLandmarker,'detect_for_video')
instrument(e.vision.PoseLandmarker,'detect_for_video')
original_options=e.python.BaseOptions.to_pb2
def single_thread_options(self):
 options=original_options(self);options.acceleration.xnnpack.num_threads=1;return options
e.python.BaseOptions.to_pb2=single_thread_options
e.OUT=e.ROOT/'research/extraction-profile-single-thread';e.OUT.mkdir(exist_ok=True)
row=next(r for r in json.loads((e.ROOT/'gesture-data/manifest.json').read_text(encoding='utf-8')) if r['wordId']=='su')
start=time.perf_counter();q=e.extract(row)
print(json.dumps({'wall':time.perf_counter()-start,'timing':dict(stats),'calls':dict(counts),'quality':q}),flush=True)
