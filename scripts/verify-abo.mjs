import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// Geometry-only import verification: Pillow separately decodes the actual images.
// No rendering is claimed by this image placeholder.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1024,height:1024,close(){}});
const rows=JSON.parse(readFileSync('public/data/abo.json','utf8')),good=[],errors=[];
for(const row of rows){
 try{
  if(/\b(wall|floating|hanging)\b/i.test(row.name))throw Error('Wall-mounted furniture quarantined from floor placement catalog');
  const path='public'+row.model_url;let data=readFileSync(path);
  const len=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+len).toString());
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>.05&&v<4))throw Error('invalid geometry bounds');
  for(const [actual,key] of [[size.x,'width_mm'],[size.y,'height_mm'],[size.z,'depth_mm']])if(Math.abs(actual-row[key]/1000)>.02)throw Error('metadata/geometry dimension mismatch');
  if(!g.asset.extras?.yunzhujiaNormalised){
   for(const scene of g.scenes){const n=g.nodes.length;g.nodes.push({name:'YunZhuJia ground-centred negative-Z-front',children:scene.nodes,translation:[center.x,-box.min.y,center.z],rotation:[0,1,0,0]});scene.nodes=[n];}
   g.asset.extras={...g.asset.extras,yunzhujiaNormalised:true};
   const text=Buffer.from(JSON.stringify(g)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),bin=data.subarray(20+len);
   const head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(20+json.length+bin.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);
   data=Buffer.concat([head,json,bin]);writeFileSync(path,data);
  }
  row.width_mm=size.x*1000;row.height_mm=size.y*1000;row.depth_mm=size.z*1000;row.sha256=createHash('sha256').update(data).digest('hex');row.bytes=data.length;
  row.modifications='Embedded textures resized to <=1024px; added root transform to ground centre and face project -Z. Original geometry, UVs and PBR channels retained.';row.front_yaw_deg=180;
  row.geometry_verified=true;good.push(row);
  gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
 }catch(e){errors.push({id:row.product_id,error:e.message});}
}
writeFileSync('public/data/abo.json',JSON.stringify(good,null,2));
const report={downloaded:rows.length,passed:good.length,errors,processedBytes:good.reduce((n,r)=>n+r.bytes,0),categories:Object.fromEntries([...new Set(good.map(r=>r.category))].map(c=>[c,good.filter(r=>r.category===c).length]))};
writeFileSync('.local/abo/geometry-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(errors.length)process.exitCode=1;
