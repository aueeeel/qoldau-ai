"""Local-only Slovo inference. Camera frames are kept in memory, never saved."""
import sys, os, json, base64, time, threading
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.ml-tools'))
import numpy as np
import cv2
import onnxruntime as ort
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MEAN = np.array([123.675,116.28,103.53], dtype=np.float32)
STD = np.array([58.395,57.12,57.375], dtype=np.float32)
WORDS = json.loads((ROOT/'data/words.json').read_text(encoding='utf-8-sig'))['words']
SUPPORTED = {w['slovoClass']:w for w in WORDS if 'slovoClass' in w}
SESSION = None
LOCK = threading.Lock()

def prepare_frame(image):
    h,w=image.shape[:2]
    r=min(224/w,224/h)
    nw,nh=round(w*r),round(h*r)
    image=cv2.resize(image,(nw,nh),interpolation=cv2.INTER_LINEAR)
    dw,dh=(224-nw)/2,(224-nh)/2
    image=cv2.copyMakeBorder(image,round(dh-.1),round(dh+.1),round(dw-.1),round(dw+.1),cv2.BORDER_CONSTANT,value=(114,114,114))
    rgb=cv2.cvtColor(image,cv2.COLOR_BGR2RGB).astype(np.float32)
    return ((rgb-MEAN)/STD).transpose(2,0,1)

def load_model():
    global SESSION
    options=ort.SessionOptions()
    options.log_severity_level=3
    options.intra_op_num_threads=min(4,os.cpu_count() or 2)
    SESSION=ort.InferenceSession(str(ROOT/'vendor/slovo/mvit32-2.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    assert SESSION.get_inputs()[0].shape==[1,1,3,32,224,224]

def classify_scores(scores):
    scores=np.asarray(scores,dtype=np.float64).reshape(-1)
    if scores.shape!=(1001,) or not np.all(np.isfinite(scores)):
        raise ValueError('Invalid model output')
    # The upstream ONNX exports softmax; also handle a logits export explicitly.
    if np.min(scores)<0 or not np.isclose(scores.sum(),1,atol=.01):
        scores=np.exp(scores-scores.max());scores/=scores.sum()
    rank=np.argsort(scores)[::-1]
    idx=int(rank[0]);confidence=float(scores[idx]);margin=confidence-float(scores[rank[1]])
    if idx==1000:return {'status':'idle'}
    if confidence<.55 or margin<.15:
        result={'status':'uncertain'}
        # A tentative top-1 result remains uncertain. Never re-rank only the nine
        # supported words or turn a low-probability alternative into a match.
        if confidence>=.30 and margin>=.15 and idx in SUPPORTED:
            word=SUPPORTED[idx]
            result['candidate']={key:word[key] for key in ('id','kk','ru')}
        return result
    if idx not in SUPPORTED:return {'status':'unsupported'}
    word=SUPPORTED[idx]
    return {'status':'match','wordId':word['id'],'kk':word['kk'],'ru':word['ru']}

def infer_images(images):
    tensor=np.stack([prepare_frame(im) for im in images],axis=1)[None,None].astype(np.float32)
    started=time.perf_counter()
    scores=SESSION.run(None,{SESSION.get_inputs()[0].name:tensor})[0].reshape(-1)
    result=classify_scores(scores)
    result['elapsedMs']=round((time.perf_counter()-started)*1000)
    return result,scores

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,code,payload):
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_GET(self):
        if self.path!='/api/health':return self.reply(404,{'error':'Not found'})
        self.reply(200,{'ready':SESSION is not None,'model':'Slovo MViTv2 32-2 (RSL)','words':list(SUPPORTED.values())})
    def do_POST(self):
        if self.path not in ('/api/recognize','/api/demo'):return self.reply(404,{'error':'Not found'})
        if self.headers.get('Origin') not in (None,'http://127.0.0.1:3000','http://localhost:3000'):
            return self.reply(403,{'error':'Origin not allowed'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.reply(415,{'error':'JSON required'})
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.reply(400,{'error':'Invalid length'})
        if not 0<length<=3_000_000:return self.reply(413,{'error':'Request too large'})
        if not LOCK.acquire(blocking=False):return self.reply(429,{'error':'Model busy'})
        try:
            payload=json.loads(self.rfile.read(length))
            if self.path=='/api/demo':
                cap=cv2.VideoCapture(str(ROOT/'examples/salem.mp4'));images=[]
                for i in range(64):
                    ok,frame=cap.read()
                    if not ok:break
                    if i%2==0:images.append(frame)
                cap.release()
                if len(images)!=32:raise ValueError('Demo unavailable')
                result,_=infer_images(images);self.reply(200,result);return
            frames=payload.get('frames')
            if not isinstance(frames,list) or len(frames)!=32:raise ValueError('Exactly 32 frames required')
            images=[]
            for value in frames:
                if not isinstance(value,str) or len(value)>80000:raise ValueError('Invalid frame')
                raw=base64.b64decode(value,validate=True)
                im=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
                if im is None or im.shape[0]>480 or im.shape[1]>640:raise ValueError('Invalid image dimensions')
                images.append(im)
            result,_=infer_images(images);self.reply(200,result)
        except (ValueError,TypeError,KeyError):self.reply(400,{'error':'Invalid video frames'})
        except Exception as error:
            print(type(error).__name__,file=sys.stderr,flush=True);self.reply(500,{'error':'Inference failed'})
        finally:LOCK.release()

if __name__=='__main__':
    load_model()
    print('Slovo ready on 127.0.0.1:3001',flush=True)
    ThreadingHTTPServer(('127.0.0.1',3001),Handler).serve_forever()
