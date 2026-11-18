"""Create a credential-free project/data ZIP with an internal SHA256 manifest."""
from pathlib import Path
from datetime import datetime
import hashlib, json, re, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'exports'
OUT.mkdir(exist_ok=True)
stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
target = OUT / f'YunZhuJia_HuaweiCloud_{stamp}.zip'
folders = ['public', 'dist', 'src', 'server', 'scripts', 'tests', 'docs',
           '.local/abo', '.local/ambientcg', '.local/render-source']
top = ['README.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
       'tsconfig.json', 'vite.config.ts', 'index.html', '.gitignore',
       '.env.example', '\u542f\u52a8\u4e91\u7b51\u5bb6.cmd']
reports = ['.local/expanded-assets-report.json', '.local/advisor-live-report.json',
           '.local/live-agent-report.json', '.local/advisor-ui-report.json']
files = set()
for folder in folders:
    files.update(p for p in (ROOT / folder).rglob('*') if p.is_file())
files.update(ROOT / p for p in top + reports if (ROOT / p).is_file())
for p in files:
    rel = p.relative_to(ROOT)
    if p.is_symlink() or 'node_modules' in rel.parts or 'exports' in rel.parts:
        raise RuntimeError(f'Unexpected path: {rel}')
    if p.name.startswith('.env') and p.name != '.env.example':
        raise RuntimeError(f'Private environment file selected: {rel}')
    if p.suffix.lower() in {'.key', '.pem', '.pfx', '.p12'}:
        raise RuntimeError(f'Private key file selected: {rel}')
    if not str(rel).startswith(('.local/', '.local\\')) and p.suffix.lower() in {'.ts','.tsx','.mjs','.py','.md','.json','.txt'} or p.name == '.env.example':
        content = p.read_text(encoding='utf-8', errors='replace')
        if re.search(r'\bsk-[A-Za-z0-9]{24,}\b', content):
            raise RuntimeError(f'Potential API credential in {rel}; packaging stopped')

note = '''云筑家：华为云上传与AI开发者空间使用说明

这是普通项目/数据ZIP，不是AI开发者空间runtime/template标准环境制品。
不要把本ZIP直接填入runtimePackagePath或templatePackagePath。
ZIP可整体上传至私有OBS桶用于备份。应用运行需要解压，不能直接读取ZIP内部资源。

目录：
public/：运行素材、家具JSON、GLB、预览图、PBR贴图及许可。
dist/：已构建前端，含运行素材副本，用于现有启动方式。
src/、server/、scripts/、tests/：项目源码、Agent后端、处理脚本和测试。
docs/：作品文档、数据说明和已有截图。
.local/abo/：ABO原始模型、商品图片、源元数据与处理报告。
.local/ambientcg/：ambientCG原始压缩包与API元数据。
.local/render-source/：原有房间渲染资源的来源元数据。
MANIFEST.sha256：每个随包文件的SHA256。

OBS：
1. 整体备份：上传本ZIP到私有备份桶。
2. 应用素材：解压后将public里面的内容上传到素材桶根目录。
   保持data/、models/、previews/、render/、licenses/等层级。
3. ZIP中未包含真实.env.local、API密钥、OBS AK/SK、node_modules及运行日志。

AI开发者空间：
1. 在实际目标空间中上传/下载本ZIP，然后解压huaweiICT目录。
2. 按目标空间的官方功能打开项目，或创建支持Node.js的自定义环境。
3. Node.js需22.18以上；依赖未随包附带，可根据pnpm-lock.yaml安装。
4. Windows已有Node.js时可尝试双击“启动云筑家.cmd”。
   Linux环境应在项目目录安装依赖，再运行node scripts/serve.mjs 5174。
5. 当前服务监听127.0.0.1，Agent只接受本机Host/Origin；需要使用空间支持的
   端口转发，或完成部署适配。单纯上传不等于网站上线或Agent已经运行。
6. .env.example是无密钥示例；解压后在目标环境单独配置模型密钥。

保留ABO和其他素材的署名及许可。家具历史样本不保证当前售价或库存。
原始数据较大，public与dist含部署所需的重复素材，属于有意保留。
'''
entries = []
last_group = None
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED,
                     compresslevel=1, allowZip64=True) as archive:
    for p in sorted(files, key=lambda p: p.relative_to(ROOT).as_posix()):
        rel = p.relative_to(ROOT).as_posix()
        group = '/'.join(rel.split('/')[:2]) if rel.startswith('.local/') else rel.split('/')[0]
        if group != last_group:
            print('Packing', group, flush=True)
            last_group = group
        name = 'huaweiICT/' + rel
        before = p.stat()
        digest = hashlib.sha256()
        with p.open('rb') as source, archive.open(name, 'w', force_zip64=True) as output:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        after = p.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise RuntimeError(f'File changed during packaging: {rel}')
        entries.append((digest.hexdigest(), rel))
    note_bytes = note.encode('utf-8-sig')
    archive.writestr('huaweiICT/云端上传说明.txt', note_bytes)
    entries.append((hashlib.sha256(note_bytes).hexdigest(), '云端上传说明.txt'))
    archive.writestr('huaweiICT/MANIFEST.sha256', ''.join(f'{h}  {n}\n' for h,n in entries).encode('utf-8'))

print('Verifying every ZIP entry and SHA256...', flush=True)
with zipfile.ZipFile(target) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)) == len(entries) + 1
    assert not any(n.endswith('/.env.local') or '/node_modules/' in n for n in names)
    for expected, rel in entries:
        digest = hashlib.sha256()
        with archive.open('huaweiICT/' + rel) as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise RuntimeError(f'Archive checksum mismatch: {rel}')
digest = hashlib.sha256()
with target.open('rb') as source:
    while chunk := source.read(1024 * 1024):
        digest.update(chunk)
report = {'archive': str(target), 'files': len(names), 'bytes': target.stat().st_size,
          'sha256': digest.hexdigest(), 'allEntryHashesVerified': True,
          'excluded': ['real environment files', 'node_modules', 'logs', 'local credentials']}
(OUT / (target.stem + '.verification.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False), flush=True)
