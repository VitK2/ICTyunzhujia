import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {worldBoxGeometry} from '../src/rendering.ts';
import {parseAppearance,DEFAULT_APPEARANCE} from '../src/appearance.ts';
import {createRetailModel} from '../src/retail-model.ts';
import {buildCatalog} from '../src/catalog.ts';
import * as T from 'three';

test('room material assets match the recorded original checksums',()=>{
 const files=JSON.parse(readFileSync(new URL('../public/render/manifest.json',import.meta.url),'utf8'));
 assert.equal(files.length,10);
 for(const entry of files){const data=readFileSync(new URL('../public'+entry.path,import.meta.url));assert.equal(data.length,entry.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(entry.license,'CC0-1.0');}
 assert.ok(files.some((f:any)=>f.asset==='wood_floor'&&f.channel==='Diffuse'&&f.resolution==='2k'));
});
test('the downloaded HDR environment decodes into finite lighting data',()=>{
 const file=readFileSync(new URL('../public/render/lebombo/environment.hdr',import.meta.url));const array=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength) as ArrayBuffer;const hdr=new HDRLoader().parse(array);assert.equal(hdr.width,1024);assert.equal(hdr.height,512);assert.equal(hdr.data.length,1024*512*4);
});
test('wall texture coordinates retain metre scale for different wall widths',()=>{
 for(const width of [1.55,5.6]){const g=worldBoxGeometry(width,2.8,.12),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;const vertices:number[]=[];for(let i=0;i<p.count;i++)if(n.getZ(i)>.5)vertices.push(i);const span=(get:(i:number)=>number)=>Math.max(...vertices.map(get))-Math.min(...vertices.map(get));assert.ok(Math.abs(span(i=>uv.getX(i))-width)<1e-5);assert.ok(Math.abs(span(i=>uv.getY(i))-2.8)<1e-5);g.dispose();}
});

test('corrupt appearance preferences cannot inject invalid values into the renderer',()=>{
 for(const bad of [null,[],false,'bad'])assert.deepEqual(parseAppearance(bad),DEFAULT_APPEARANCE);
 const a=parseAppearance({quality:'unknown',lighting:'night',exposure:Infinity,sunlight:-10,shadow:30,wallTone:'#malformed',floorFinish:'mirror',budget:0});
 assert.equal(a.lighting,'night');assert.equal(a.exposure,DEFAULT_APPEARANCE.exposure);assert.equal(a.sunlight,0);assert.equal(a.shadow,1);assert.equal(a.wallTone,'ivory');assert.equal(a.floorFinish,'satin');assert.equal('budget' in a,false);
});
test('rendered retail proxies preserve all official outer dimensions and source surfaces',()=>{
 const read=(name:string)=>JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));
 const products=buildCatalog(read('catalog.json'),read('retail.json')).filter(p=>p.kind==='retail'&&p.mount!=='wall');
 const wood=new T.MeshPhysicalMaterial({color:'#ffffff',clearcoat:.2}),fabric=new T.MeshPhysicalMaterial({color:'#cdbfa6',sheen:.65});
 for(const p of products){const g=createRetailModel(p,{wood,fabric});const box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3());assert.ok(Math.abs(size.x-p.width)<1e-5,p.id+' width');assert.ok(Math.abs(size.y-p.height)<1e-5,p.id+' height');assert.ok(Math.abs(size.z-p.depth)<1e-5,p.id+' depth');assert.ok(Math.abs(box.min.y)<1e-5,p.id+' floor');const mats=new Set<T.Material>();g.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});mats.forEach(m=>{assert.notEqual(m,wood);assert.notEqual(m,fabric);m.dispose();});}
 assert.equal(wood.color.getHexString(),'ffffff');assert.equal(fabric.sheen,.65);wood.dispose();fabric.dispose();
});
