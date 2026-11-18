"""Split the complete ZIP into exactly eight byte-preserving volumes."""
from pathlib import Path
import hashlib,json,sys
source=Path(sys.argv[1]).resolve()
assert source.is_file() and source.suffix=='.zip'
original=json.loads(source.with_suffix('.verification.json').read_text(encoding='utf8'))
output=source.parent/(source.stem+'_8parts')
output.mkdir(exist_ok=False)
size=source.stat().st_size; chunk_size=(size+7)//8
assert chunk_size<1_000_000_000
whole=hashlib.sha256();parts=[]
with source.open('rb') as src:
    for index in range(1,9):
        name=source.name+f'.{index:03d}';target=output/name
        remaining=min(chunk_size,size-(index-1)*chunk_size);digest=hashlib.sha256()
        with target.open('xb') as dst:
            while remaining:
                data=src.read(min(4*1024*1024,remaining))
                if not data:raise RuntimeError('Unexpected end of original ZIP')
                dst.write(data);whole.update(data);digest.update(data);remaining-=len(data)
        parts.append({'file':name,'bytes':target.stat().st_size,'sha256':digest.hexdigest()})
        print(json.dumps(parts[-1]),flush=True)
    assert src.read(1)==b''
assert whole.hexdigest()==original['sha256']
print('Verifying all volumes in reconstruction order...',flush=True)
combined=hashlib.sha256()
for part in parts:
    digest=hashlib.sha256()
    with (output/part['file']).open('rb') as src:
        while data:=src.read(4*1024*1024):digest.update(data);combined.update(data)
    assert digest.hexdigest()==part['sha256']
assert combined.hexdigest()==original['sha256']
report={'originalFile':source.name,'originalBytes':size,'originalSha256':whole.hexdigest(),'volumes':parts,'verified':True,'note':'ZIP byte volumes: concatenate .001 through .008 in this exact order before extracting.'}
(output/'VOLUMES.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
merge='''from pathlib import Path
import hashlib,json,os
root=Path(__file__).resolve().parent
meta=json.loads((root/'VOLUMES.json').read_text(encoding='utf8'))
target=root/meta['originalFile']
temporary=target.with_suffix('.zip.merging')
if target.exists() or temporary.exists():raise SystemExit('Output already exists; refusing to overwrite.')
for part in meta['volumes']:
    path=root/part['file']
    if not path.is_file() or path.stat().st_size!=part['bytes']:raise SystemExit('Missing or incomplete volume: '+part['file'])
whole=hashlib.sha256()
with temporary.open('xb') as dst:
    for part in meta['volumes']:
        digest=hashlib.sha256()
        with (root/part['file']).open('rb') as src:
            while data:=src.read(4*1024*1024):dst.write(data);digest.update(data);whole.update(data)
        if digest.hexdigest()!=part['sha256']:raise SystemExit('Checksum mismatch: '+part['file'])
        print('Merged '+part['file'],flush=True)
if whole.hexdigest()!=meta['originalSha256']:raise SystemExit('Final ZIP checksum mismatch')
temporary.rename(target)
print('Verified complete ZIP: '+str(target))
'''
(output/'merge_parts.py').write_text(merge,encoding='utf8')
cmd='@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n'
cmd+=f'if exist "{source.name}" (echo Output already exists. & pause & exit /b 1)\r\n'
for part in parts:cmd+=f'if not exist "{part["file"]}" (echo Missing {part["file"]} & pause & exit /b 1)\r\n'
cmd+='copy /b '+ '+'.join('"'+p['file']+'"' for p in parts)+' "'+source.name+'"\r\n'
cmd+='if errorlevel 1 (pause & exit /b 1)\r\n'
cmd+=f'echo Expected SHA256: {whole.hexdigest()}\r\ncertutil -hashfile "{source.name}" SHA256\r\necho Compare the checksum above before extracting the ZIP.\r\npause\r\n'
(output/'Merge-Windows.cmd').write_bytes(cmd.encode('ascii'))
note='''八分卷使用说明

本目录的.zip.001至.zip.008是同一个完整ZIP的8个分卷，不能逐卷独立解压。
请将8卷和合并脚本放到同一个目录，保持文件名不变。

Windows：双击Merge-Windows.cmd，合并后对照显示的SHA256，再解压生成的ZIP。
Windows或Linux（推荐，自动校验）：安装Python 3.8以上，执行 python merge_parts.py。
Linux也可以执行 cat *.zip.00[1-8] > 完整项目.zip，然后核对VOLUMES.json中的原始SHA256。

每个分卷小于十进制1GB，适合目标空间的单文件上传限制。
合并时需要额外约8GB空间，解压时还需要约8.4GB空间。
完整备份包含历史压缩包、依赖与缓存，原始.env.local密钥配置已排除。
'''
(output/'使用说明.txt').write_text(note,encoding='utf-8-sig')
print(json.dumps({'directory':str(output),'parts':len(parts),'eachMaxBytes':chunk_size,'combinedBytes':size,'originalSha256':whole.hexdigest(),'verified':True}),flush=True)
