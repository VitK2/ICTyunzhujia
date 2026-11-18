"""Reproducible official ABO subset import; retain licensed source data."""
import csv,gzip,hashlib,io,json,struct,time,urllib.request,concurrent.futures
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'.local/abo';RAW.mkdir(parents=True,exist_ok=True)
BASE='https://amazon-berkeley-objects.s3.amazonaws.com/'
def fetch(key):
 p=RAW/(('query-'+hashlib.sha256(key.encode()).hexdigest()+'.xml') if key.startswith('?') else key);p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():return p.read_bytes()
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(BASE+key,headers={'User-Agent':'YunZhuJia-ICT/0.5'}),timeout=120) as r:data=r.read()
   p.write_bytes(data);return data
  except Exception:
   if attempt==2:raise
   time.sleep(1)
def values(row,key):
 v=row.get(key,[])
 if isinstance(v,str):return v
 return ' / '.join(dict.fromkeys(str(x.get('value','')) for x in v if x.get('language_tag','en_US') in ['en_US','en_GB','zh_CN']))
def category(name):
 import re
 n=name.lower()
 if re.search(r'\b(cover|slipcover|cushion|pillow|ottoman|stool|bench|dining|outdoor|patio|folding|office|desk|barstool|bed|mattress|crib|wall|floating|hanging)\b',n):return None
 if re.search(r'\b(sofa|couch|loveseat)\b',n):return 'sofa'
 if re.search(r'\b(accent chair|armchair|arm chair|lounge chair|recliner|reading chair)\b',n):return 'armchair'
 if 'coffee table' in n:return 'coffee_table'
 if re.search(r'\b(end table|side table)\b',n):return 'side_table'
 if re.search(r'\b(tv stand|media console|television stand)\b',n):return 'tv_stand'
 if re.search(r'\b(bookcase|bookshelf)\b',n):return 'shelf'
 if re.search(r'\b(storage cabinet|sideboard|credenza)\b',n):return 'cabinet'
 return None

def metadata():
 for key in ['README.md','LICENSE-CC-BY-4.0.txt','3dmodels/README.md'] :fetch(key)
 models={r['3dmodel_id']:r for r in csv.DictReader(io.StringIO(gzip.decompress(fetch('3dmodels/metadata/3dmodels.csv.gz')).decode()))}
 listings={}
 def load(key):
  result=[]
  for line in gzip.decompress(fetch(key)).splitlines():
   r=json.loads(line);mid=r.get('3dmodel_id');name=values(r,'item_name');cat=category(name)
   if mid in models and cat and (not r.get('country') or r.get('country')=='US'):result.append((mid,r,cat,name))
  print('metadata shard',key,'candidates',len(result),flush=True);return result
 import xml.etree.ElementTree as ET
 keys=[e.text for e in ET.fromstring(fetch('?list-type=2&prefix=listings/metadata/&max-keys=100')).findall('.//{*}Key') if e.text.endswith('.json.gz')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for results in pool.map(load,keys):
   for mid,r,cat,name in results:
    m=models[mid]
    if mid not in listings and int(m['textures'])>=2 and int(m['faces'])<=80000 and .15<float(m['extent_y'])<2.5 and .2<float(m['extent_x'])<3.5 and .15<float(m['extent_z'])<2:
     listings[mid]={'id':mid,'category':cat,'name':name,'listing':r,'model':m}
 (RAW/'candidates.json').write_text(json.dumps(list(listings.values()),ensure_ascii=False),encoding='utf-8')
 print('Eligible',len(listings),dict((c,sum(r['category']==c for r in listings.values())) for c in sorted({r['category'] for r in listings.values()})),flush=True)

def process(row):
 mid=row['id'];data=fetch('3dmodels/original/'+row['model']['path'])
 assert data[:4]==b'glTF'
 length,kind=struct.unpack_from('<II',data,12);g=json.loads(data[20:20+length]);off=20+length;bl,bt=struct.unpack_from('<II',data,off);binary=data[off+8:off+8+bl]
 assert bt==0x004e4942
 replacements={};texture_pixels=[]
 for im in g.get('images',[]):
  assert 'bufferView' in im and 'uri' not in im
  idx=im['bufferView'];v=g['bufferViews'][idx];raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  image=Image.open(io.BytesIO(raw));texture_pixels.append(image.size)
  image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  out=io.BytesIO();image.save(out,format='PNG' if im.get('mimeType')=='image/png' else 'JPEG',**({} if im.get('mimeType')=='image/png' else {'quality':90}))
  replacements[idx]=out.getvalue()
 chunks=[];cursor=0
 for i,v in enumerate(g['bufferViews']):
  padding=(-cursor)%4
  if padding:chunks.append(b'\0'*padding);cursor+=padding
  raw=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);v['byteOffset']=cursor;v['byteLength']=len(raw);chunks.append(raw);cursor+=len(raw)
 # ABO guarantees metre-scale, Y-up, bottom-centred, +Z facing front.
 # Keep geometry and transforms byte-for-byte; only embedded textures are resized.
 binary=b''.join(chunks);g['buffers'][0]['byteLength']=len(binary);binary+=b'\0'*((-len(binary))%4)
 js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 output=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 target=ROOT/'public/models'/f'abo_{mid}.glb';target.write_bytes(output)
 preview=None
 if row.get('image_path'):
  raw=fetch('images/small/'+row['image_path']);im=Image.open(io.BytesIO(raw)).convert('RGB');im.save(ROOT/'public/previews'/f'abo_{mid}.jpg',quality=92);preview=f'/previews/abo_{mid}.jpg'
 m=row['model'];r=row['listing'];cat=row['category'];labels={'sofa':'沙发','armchair':'休闲椅','coffee_table':'茶几','side_table':'边几','tv_stand':'电视柜','shelf':'书架','cabinet':'储物柜'}
 attrs={k:values(r,k) for k in ['brand','color','material','style','finish_type','fabric_type']}
 record={'product_id':'abo_'+mid,'source_asset_id':'abo_'+mid,'name':labels[cat]+' · '+row['name'].split(' / ')[0], 'category':cat,'width_mm':float(m['extent_x'])*1000,'height_mm':float(m['extent_y'])*1000,'depth_mm':float(m['extent_z'])*1000,'model_url':f'/models/abo_{mid}.glb','preview_url':f'/previews/abo_{mid}.jpg','source_url':'https://amazon-berkeley-objects.s3.amazonaws.com/index.html#'+mid,'original_product_url':'https://www.'+r.get('domain_name','amazon.com')+'/dp/'+r['item_id'],'archive_product_id':r['item_id'],'attributes':attrs,'price_fen':None,'availability':'archive_not_live_inventory','license':'CC-BY-4.0','attribution':'Amazon.com; ABO dataset by Amazon.com and UC Berkeley','modifications':'Embedded textures resized to at most 1024 pixels; original geometry and node transforms preserved','dimension_basis':'ABO model geometry bounding box, metres; not verified manufacturer dimensions','front_yaw_deg':0,'source_sha256':hashlib.sha256(data).hexdigest(),'sha256':hashlib.sha256(output).hexdigest(),'bytes':len(output),'source_bytes':len(data),'texture_sizes_original':texture_pixels,'model_match_status':'ABO original product-to-model mapping; no mapping to IKEA SKUs'}
 record['preview_url']=preview
 print('imported',mid,cat,len(output),flush=True);return record

def models():
 rows=json.loads((RAW/'candidates.json').read_text(encoding='utf-8'));quotas={'sofa':18,'armchair':18,'coffee_table':14,'side_table':14,'tv_stand':8,'shelf':8,'cabinet':6}
 selected=[]
 for cat,n in quotas.items():
  candidates=[r for r in rows if r['category']==cat];candidates.sort(key=lambda r:(int(r['model']['faces']),r['id']))
  # Mix lower-poly and more detailed entries rather than selecting a single brand/style.
  used=set()
  for i in range(min(n,len(candidates))):
   r=candidates[min(len(candidates)-1,i*max(1,len(candidates)//n))]
   if r['id'] not in used:selected.append(r);used.add(r['id'])
 images={r['image_id']:r['path'] for r in csv.DictReader(io.StringIO(gzip.decompress(fetch('images/metadata/images.csv.gz')).decode()))}
 for r in selected:r['image_path']=images.get(r['listing'].get('main_image_id'))
 records=[];errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  futures={pool.submit(process,r):r for r in selected}
  for f in concurrent.futures.as_completed(futures):
   try:records.append(f.result())
   except Exception as e:errors.append({'id':futures[f]['id'],'error':str(e)});print('failed',errors[-1],flush=True)
 records.sort(key=lambda r:(r['category'],r['product_id']))
 (ROOT/'public/data/abo.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
 (RAW/'import-report.json').write_text(json.dumps({'count':len(records),'errors':errors,'categories':{c:sum(r['category']==c for r in records) for c in quotas},'sourceBytes':sum(r['source_bytes'] for r in records),'processedBytes':sum(r['bytes'] for r in records)},indent=2),encoding='utf-8')
 print('Completed',len(records),'errors',len(errors),flush=True)

if __name__=='__main__':
 import sys
 metadata() if len(sys.argv)>1 and sys.argv[1]=='metadata' else models()
