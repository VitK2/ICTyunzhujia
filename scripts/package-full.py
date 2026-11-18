"""Archive the complete current workspace, with credentials excluded."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib, json, os, re, stat, zipfile

ROOT=Path(__file__).resolve().parents[1]
stamp=datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d_%H%M%S')
target=ROOT/'exports'/f'YunZhuJia_Full_{stamp}.zip'
partial=target.with_suffix('.zip.partial')
excluded=[]; entries=[]
def collect(folder):
    for entry in sorted(os.scandir(folder),key=lambda e:e.name):
        path=Path(entry.path); rel=path.relative_to(ROOT).as_posix()
        if path in [target,partial]: continue
        private=(entry.name.startswith('.env') and entry.name!='.env.example') or path.suffix.lower() in {'.pem','.key','.pfx','.p12'} or entry.name.lower() in {'credentials','credentials.json','service-account.json'}
        if entry.name=='.npmrc':
            private=bool(re.search(r'_auth|password|token\s*=',path.read_text(encoding='utf8',errors='replace'),re.I))
        if private or entry.name in {'.ssh','.aws','.azure','.gnupg'}:
            excluded.append(rel); continue
        if entry.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):
            entries.append((path,rel,'link')); continue
        if entry.is_dir(follow_symlinks=False): collect(path)
        elif entry.is_file(follow_symlinks=False): entries.append((path,rel,'file'))
collect(ROOT)
print(json.dumps({'selectedEntries':len(entries),'excludedPaths':excluded,'output':str(target)}),flush=True)
manifest=[]; last_group=None
stored={'.zip','.gz','.xz','.7z','.jpg','.jpeg','.png','.webp','.mp4','.woff2'}
with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as archive:
    for index,(path,rel,kind) in enumerate(entries):
        group=rel.split('/')[0]
        if group!=last_group:print('Packing',group,flush=True);last_group=group
        name='huaweiICT/'+rel; digest=hashlib.sha256()
        if kind=='link':
            data=os.readlink(path).encode('utf8');digest.update(data)
            info=zipfile.ZipInfo(name);info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16
            archive.writestr(info,data)
        else:
            before=path.stat(); info=zipfile.ZipInfo.from_file(path,name);info.compress_type=zipfile.ZIP_STORED if path.suffix.lower() in stored else zipfile.ZIP_DEFLATED
            info._compresslevel=1
            with path.open('rb') as source,archive.open(info,'w',force_zip64=True) as dest:
                while chunk:=source.read(1024*1024):digest.update(chunk);dest.write(chunk)
            after=path.stat()
            if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):raise RuntimeError('File changed while packaging: '+rel)
        manifest.append((digest.hexdigest(),rel,kind))
        if index and index%2000==0:print('Packed',index,'entries',flush=True)
    archive.writestr('FULL_BACKUP_MANIFEST.sha256',''.join(f'{h}  huaweiICT/{rel}\n' for h,rel,kind in manifest).encode('utf8'))
    archive.writestr('FULL_BACKUP_INFO.json',json.dumps({'createdAt':datetime.now(timezone(timedelta(hours=8))).isoformat(),'entries':len(entries),'excluded':excluded,'symlinks':sum(k=='link' for p,r,k in entries),'includes':['source','dependencies','raw data','processed assets','documents','existing exports','local reports and logs'],'note':'Full backup; contains older ZIPs and upload staging intentionally. Symlinks retained as ZIP symlink entries. Windows dependencies may need reinstalling after restoration. Real credentials must be configured separately.'},ensure_ascii=False,indent=2).encode('utf8'))
print('Verifying every archived entry against its SHA256...',flush=True)
with zipfile.ZipFile(partial) as archive:
    assert len(archive.namelist())==len(set(archive.namelist()))==len(manifest)+2
    for index,(expected,rel,kind) in enumerate(manifest):
        digest=hashlib.sha256()
        with archive.open('huaweiICT/'+rel) as source:
            while chunk:=source.read(1024*1024):digest.update(chunk)
        if digest.hexdigest()!=expected:raise RuntimeError('Archive verification failed: '+rel)
        if index and index%3000==0:print('Verified',index,'entries',flush=True)
partial.rename(target)
digest=hashlib.sha256()
with target.open('rb') as source:
    while chunk:=source.read(4*1024*1024):digest.update(chunk)
report={'archive':str(target),'bytes':target.stat().st_size,'entries':len(manifest)+2,'sha256':digest.hexdigest(),'allEntriesVerified':True,'excludedPaths':excluded}
target.with_suffix('.verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)
