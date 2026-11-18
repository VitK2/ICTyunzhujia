"""Download the selected original CC0 PBR maps and HDRI; preserve provenance."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HEADERS = {'User-Agent': 'YunZhuJia-ICT-Prototype/0.3'}
SELECTION = {
    'wood_floor': [('Diffuse', '2k', 'jpg', 'color.jpg'), ('nor_gl', '1k', 'jpg', 'normal.jpg'), ('Rough', '1k', 'jpg', 'roughness.jpg')],
    'plastered_wall': [('Diffuse', '1k', 'jpg', 'color.jpg'), ('nor_gl', '1k', 'jpg', 'normal.jpg'), ('Rough', '1k', 'jpg', 'roughness.jpg')],
    'fabric_pattern_07': [('col_1', '1k', 'jpg', 'color.jpg'), ('nor_gl', '1k', 'jpg', 'normal.jpg'), ('Rough', '1k', 'jpg', 'roughness.jpg')],
    'lebombo': [('hdri', '1k', 'hdr', 'environment.hdr')],
}

def download(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
        return response.read()

records = []
for asset, maps in SELECTION.items():
    files = json.loads(download('https://api.polyhaven.com/files/' + asset))
    for channel, resolution, fmt, name in maps:
        source = files[channel][resolution][fmt]
        relative = 'render/' + asset + '/' + name
        target = ROOT / 'public' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = target.read_bytes() if target.exists() else download(source['url'])
        if hashlib.md5(data).hexdigest() != source['md5']:
            raise RuntimeError('Source checksum mismatch: ' + relative)
        target.write_bytes(data)
        records.append({'asset': asset, 'channel': channel, 'resolution': resolution, 'path': '/' + relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'sourceMd5': source['md5'], 'downloadUrl': source['url'], 'sourceUrl': 'https://polyhaven.com/a/' + asset, 'license': 'CC0-1.0'})
(ROOT / 'public/render/manifest.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(json.dumps({'files': len(records), 'bytes': sum(r['bytes'] for r in records)}))
