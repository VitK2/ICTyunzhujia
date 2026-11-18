import fs from 'node:fs';
import crypto from 'node:crypto';
const base=process.argv[2]||'http://127.0.0.1:5174';
const home=await fetch(base);if(!home.ok)throw Error('Home page unavailable');
const html=await home.text();
const links=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
for(const link of links){const r=await fetch(base+link);if(!r.ok)throw Error(link);}
const catalog=JSON.parse(fs.readFileSync('public/data/catalog.json','utf8'));
for(const asset of catalog){
 const p='public/models/'+asset.source_asset_id+'.glb';
 if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==asset.model_sha256)throw Error('Checksum mismatch '+p);
 const r=await fetch(base+'/models/'+asset.source_asset_id+'.glb',{method:'HEAD'});if(!r.ok)throw Error(asset.asset_id);
 const preview=await fetch(base+'/previews/'+asset.source_asset_id+'.png',{method:'HEAD'});if(!preview.ok)throw Error('Preview missing '+asset.asset_id);
}
const renderAssets=JSON.parse(fs.readFileSync('public/render/manifest.json','utf8'));
for(const asset of renderAssets){const local=fs.readFileSync('public'+asset.path);if(crypto.createHash('sha256').update(local).digest('hex')!==asset.sha256)throw Error('Render asset checksum mismatch '+asset.path);const response=await fetch(base+asset.path);if(!response.ok||response.headers.get('content-type')?.includes('text/html'))throw Error('Render asset unavailable '+asset.path);const remote=Buffer.from(await response.arrayBuffer());if(crypto.createHash('sha256').update(remote).digest('hex')!==asset.sha256)throw Error('Served render asset differs '+asset.path);}
console.log(JSON.stringify({home:home.status,builtEntrypoints:links.length,verifiedModels:catalog.length,verifiedPreviews:catalog.length,verifiedRenderAssets:renderAssets.length,health:await(await fetch(base+'/health')).json()},null,2));
