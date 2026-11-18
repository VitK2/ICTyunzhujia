"""Import two official CC0 PBR sets with original archives and provenance."""
from pathlib import Path
import urllib.request,json,zipfile,io,hashlib,time
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];RAW=ROOT/'.local/ambientcg';RAW.mkdir(parents=True,exist_ok=True)
records=[]
for asset in ['WoodFloor051','Fabric030']:
 url='https://ambientcg.com/api/v2/full_json?id='+asset+'&include=downloadData,dimensionsData'
 data=urllib.request.urlopen(url,timeout=60).read();(RAW/(asset+'.json')).write_bytes(data)
 meta=json.loads(data)['foundAssets'][0];downloads=meta['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads']
 download=next(d for d in downloads if d['attribute']=='1K-JPG');p=RAW/download['fileName']
 if not p.exists():
  for attempt in range(3):
   try:
    request=urllib.request.Request(download['downloadLink'],headers={'User-Agent':'YunZhuJia-ICT/0.5','Referer':meta['shortLink']})
    p.write_bytes(urllib.request.urlopen(request,timeout=120).read());break
   except Exception:
    if attempt==2:raise
    time.sleep(2)
 with zipfile.ZipFile(p) as z:
  for channel,suffix in [('color','_Color.jpg'),('normal','_NormalGL.jpg'),('roughness','_Roughness.jpg')]:
   name=next(n for n in z.namelist() if n.endswith(suffix));raw=z.read(name);Image.open(io.BytesIO(raw)).verify()
   target=ROOT/'public/render'/asset/(channel+'.jpg');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
   records.append({'asset':asset,'channel':channel,'resolution':'1k','path':f'/render/{asset}/{channel}.jpg','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'downloadUrl':download['downloadLink'],'sourceUrl':meta['shortLink'],'license':'CC0-1.0','licenseUrl':'https://docs.ambientcg.com/license/','tileMetres':(meta.get('dimensionX') or 100)/100,'sourceZipSha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 print(asset,'3 maps imported',flush=True)
(ROOT/'public/render/ambientcg-manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
