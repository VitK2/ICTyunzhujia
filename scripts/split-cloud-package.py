"""Split a verified backup into independently extractable ZIPs below the UI cap."""
from pathlib import Path
import hashlib, json, sys, zipfile
original=Path(sys.argv[1]).resolve()
assert original.is_file() and original.suffix=='.zip'
limit=850*1024*1024
with zipfile.ZipFile(original) as source:
    all_entries=source.infolist()
    app=[]; raw=[]
    for info in all_entries:
        (raw if '/.local/abo/' in info.filename or '/.local/ambientcg/' in info.filename else app).append(info)
    groups=[('app',app)]
    current=[]; size=0; index=1
    for info in raw:
        if current and size+info.file_size>limit:
            groups.append((f'raw_{index:02d}',current)); current=[];size=0;index+=1
        current.append(info);size+=info.file_size
    if current:groups.append((f'raw_{index:02d}',current))
    results=[];seen=[]
    for label,infos in groups:
        output=original.with_name(original.stem+'_'+label+'.zip')
        hashes={}
        print('Writing',label,len(infos),'files',flush=True)
        with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as target:
            for info in infos:
                digest=hashlib.sha256()
                with source.open(info) as src,target.open(info.filename,'w',force_zip64=True) as dst:
                    while chunk:=src.read(1024*1024):digest.update(chunk);dst.write(chunk)
                hashes[info.filename]=digest.hexdigest();seen.append(info.filename)
        print('Verifying',label,flush=True)
        with zipfile.ZipFile(output) as check:
            assert len(check.namelist())==len(infos)
            for name,expected in hashes.items():
                digest=hashlib.sha256()
                with check.open(name) as src:
                    while chunk:=src.read(1024*1024):digest.update(chunk)
                assert digest.hexdigest()==expected,name
        assert output.stat().st_size<1000*1000*1000
        digest=hashlib.sha256()
        with output.open('rb') as src:
            while chunk:=src.read(1024*1024):digest.update(chunk)
        results.append({'archive':str(output),'files':len(infos),'bytes':output.stat().st_size,'sha256':digest.hexdigest(),'allEntryHashesVerified':True})
        print(json.dumps(results[-1]),flush=True)
    assert len(seen)==len(set(seen))==len(all_entries)
    assert set(seen)=={i.filename for i in all_entries}
report={'original':str(original),'allOriginalEntriesPreserved':True,'totalFiles':len(seen),'parts':results,'restore':'Extract every ZIP into the same new directory; they have disjoint file paths. Verify huaweiICT/MANIFEST.sha256 after extracting all parts.'}
original.with_name(original.stem+'_parts.verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('All original files preserved and verified.',flush=True)
