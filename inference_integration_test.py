"""Exercise real HTTP inference with the official Slovo demo, using browser-sized JPEGs."""
import json, base64, urllib.request, urllib.error
import backend as b

URL='http://127.0.0.1:3000'
with urllib.request.urlopen(URL+'/api/health') as response:
    health=json.load(response)
assert health['ready'] and len(health['words'])==9

def post(frames,origin=URL):
    req=urllib.request.Request(URL+'/api/recognize',data=json.dumps({'frames':frames}).encode(),headers={'Content-Type':'application/json','Origin':origin})
    with urllib.request.urlopen(req,timeout=35) as response:return json.load(response)

for frames,origin,expected in [([],URL,400),([], 'https://example.com',403)]:
    try:post(frames,origin)
    except urllib.error.HTTPError as error:assert error.code==expected,(error.code,expected)
    else:raise AssertionError('Invalid request accepted')

cap=b.cv2.VideoCapture(str(b.ROOT/'examples/salem.mp4'));frames=[]
for i in range(64):
    ok,frame=cap.read();assert ok
    if i%2:continue
    h,w=frame.shape[:2];scale=min(320/w,240/h)
    resized=b.cv2.resize(frame,(round(w*scale),round(h*scale)))
    ok,jpeg=b.cv2.imencode('.jpg',resized,[b.cv2.IMWRITE_JPEG_QUALITY,85]);assert ok
    frames.append(base64.b64encode(jpeg).decode())
cap.release()
result=post(frames)
print('Real demo via browser JPEG payload:',json.dumps(result,ensure_ascii=False),flush=True)
assert result.get('wordId')=='salem',result

# Both held-out father clips go through the actual camera payload dimensions.
manifest=json.loads((b.ROOT/'research/validation/manifest.json').read_text(encoding='utf-8'))
for row in manifest:
    if row['text']!='отец':continue
    cap=b.cv2.VideoCapture(str(b.ROOT/'research/validation'/row['file']));images=[]
    while True:
        ok,im=cap.read()
        if not ok:break
        images.append(im)
    cap.release();frames=[]
    for i in b.np.linspace(0,len(images)-1,32).round().astype(int):
        im=images[i];h,w=im.shape[:2];scale=min(320/w,240/h)
        im=b.cv2.resize(im,(round(w*scale),round(h*scale)))
        ok,jpeg=b.cv2.imencode('.jpg',im,[b.cv2.IMWRITE_JPEG_QUALITY,90]);assert ok
        frames.append(base64.b64encode(jpeg).decode())
    result=post(frames);print('Father video via camera payload:',json.dumps(result,ensure_ascii=False),flush=True)
    assert result.get('wordId')=='ake',result

for word in health['words']:
    with urllib.request.urlopen(URL+'/examples/words/'+word['id']+'.mp4') as response:
        assert response.headers['Content-Type']=='video/mp4'
        assert response.read(32)[4:8]==b'ftyp'

_,blank=b.cv2.imencode('.jpg',b.np.zeros((240,320,3),dtype=b.np.uint8))
result=post([base64.b64encode(blank).decode()]*32)
print('Blank video:',json.dumps(result,ensure_ascii=False),flush=True)
assert result['status']!='match',result
print('HTTP integration checks passed.',flush=True)
