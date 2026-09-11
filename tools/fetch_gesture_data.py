"""Fetch labelled vocabulary data using bounded ZIP ranges, not the 16 GB archive."""
import sys,pathlib,json,csv,io,zipfile,urllib.request,zlib,struct,time,os
from concurrent.futures import ThreadPoolExecutor,as_completed
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL='https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/slovo/slovo.zip'
OUT=ROOT/'gesture-data';(OUT/'videos').mkdir(parents=True,exist_ok=True)
def get_range(start,size):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(URL,headers={'Range':f'bytes={start}-{start+size-1}'}),timeout=45) as response:
    if response.status!=206:raise ValueError('Server did not honor Range')
    data=response.read(size+1)
    if len(data)!=size:raise ValueError('Wrong range length')
    return data
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
class Remote(io.RawIOBase):
 def __init__(self):
  self.size=int(urllib.request.urlopen(urllib.request.Request(URL,method='HEAD'),timeout=30).headers['Content-Length']);self.pos=0
 def seekable(self):return True
 def seek(self,n,whence=0):
  self.pos=n if whence==0 else self.pos+n if whence==1 else self.size+n
  return self.pos
 def tell(self):return self.pos
 def read(self,n=-1):
  n=self.size-self.pos if n<0 else min(n,self.size-self.pos)
  if not n:return b''
  if n>20_000_000:raise ValueError('Oversized range')
  data=get_range(self.pos,n);self.pos+=n;return data
words=json.loads((ROOT/os.environ.get('QOLDAU_VOCABULARY','data/words.json')).read_text(encoding='utf-8-sig'))['words']
mapping={w['sourceLabel']:w['id'] for w in words if 'slovoClass' in w}
with zipfile.ZipFile(Remote()) as archive:
 infos=archive.infolist();content=archive.read(next(i for i in infos if i.filename.endswith('annotations.csv'))).decode('utf-8-sig')
 rows=list(csv.DictReader(io.StringIO(content),delimiter='\t' if '\t' in content.splitlines()[0] else ','))
 info_by_id={pathlib.PurePosixPath(i.filename).stem:i for i in infos if i.filename.endswith('.mp4')}
 selected=[{**r,'wordId':mapping[r['text']],'id':r['attachment_id'],'signerId':r['user_id'],'source':'Slovo','file':r['attachment_id']+'.mp4'} for r in rows if r['text'] in mapping]
 # A fixed unrelated vocabulary checks open-set rejection, never used as templates.
 negatives={'медведь','работать','любить','день','другой','среда'} - set(mapping)
 if any(sum(r['text']==label for r in rows)<4 for label in negatives):raise ValueError('Missing negative labels')
 for label in negatives:
  for split in ('true','false'):
   selected += [{**r,'wordId':'__unknown__','id':r['attachment_id'],'signerId':r['user_id'],'source':'Slovo','file':r['attachment_id']+'.mp4'} for r in rows if r['text']==label and r['train'].lower()==split][:2]
def fetch(row):
 dest=OUT/'videos'/row['file'];old=ROOT/'research/validation'/row['file']
 if dest.exists():return row
 if old.exists():dest.write_bytes(old.read_bytes());return row
 info=info_by_id[row['id']];header=get_range(info.header_offset,30)
 n,e=struct.unpack_from('<HH',header,26);raw=get_range(info.header_offset+30+n+e,info.compress_size)
 data=zlib.decompress(raw,-15) if info.compress_type==8 else raw
 if len(data)!=info.file_size or zlib.crc32(data)!=info.CRC:raise ValueError('Corrupt video')
 dest.write_bytes(data);return row
done=[]
with ThreadPoolExecutor(max_workers=5) as pool:
 for future in as_completed([pool.submit(fetch,row) for row in selected]):
  row=future.result();done.append(row)
  if len(done)%10==0:print(f'Fetched {len(done)}/{len(selected)} videos',flush=True)
done.sort(key=lambda r:r['id'])
(OUT/'manifest.json').write_text(json.dumps(done,ensure_ascii=False,indent=2),encoding='utf-8')
print('Complete:',len(done),'videos',flush=True)
