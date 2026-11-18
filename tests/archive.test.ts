import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCatalog} from '../src/catalog.ts';
import {totals} from '../src/engine.ts';
import {recommend} from '../server/recommend.ts';
import {DEFAULT_BRIEF} from '../src/brief.ts';
import {parseAppearance} from '../src/appearance.ts';
const read=(n:string)=>JSON.parse(readFileSync(new URL('../public/'+n,import.meta.url),'utf8'));
test('archive catalog retains actual models, attributes, CC attribution and unknown price',()=>{
 const rows=read('data/abo.json'),products=buildCatalog([],[],rows);assert.ok(rows.length>=50);
 for(const p of products){assert.equal(p.archive,true);assert.ok(p.model?.endsWith('.glb'));assert.equal(p.price,undefined);assert.equal(p.license,'CC-BY-4.0');assert.ok(p.attribution?.includes('Amazon.com'));assert.ok(p.height>0&&p.width<4&&p.depth<4);}
 assert.equal(new Set(products.map(p=>p.id)).size,products.length);
});
test('all archive model bytes and source previews are present and geometry checked',()=>{
 for(const r of read('data/abo.json')){const b=readFileSync(new URL('../public'+r.model_url,import.meta.url));assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);assert.equal(r.geometry_verified,true);assert.ok(readFileSync(new URL('../public'+r.preview_url,import.meta.url)).length>1000);}
});
test('ABO attribute evidence participates in default product recommendations without fabricated prices',()=>{
 const products=buildCatalog([],[],read('data/abo.json'));
 const plan={name:'扩容检查',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:8000,reserved:false,items:[],brief:{...DEFAULT_BRIEF,preferences:'木质，不要黑色',activities:'阅读'}};
 const r=recommend(plan,products,{category:'coffee_table'});assert.ok(r.recommendations.length>0);assert.ok(r.recommendations.every(x=>x.price===null&&x.fit?.geometryChecked));
 assert.ok(r.recommendations.every(x=>!products.find(p=>p.id===x.productId)!.searchText!.includes('黑色')));
 const p=products[0],i={id:'sample',productId:p.id,x:2,z:2,yaw:0,locked:false,estimate:null as number|null};
 assert.equal(totals({...plan,items:[i]},products).unpriced,1);i.estimate=500;assert.equal(totals({...plan,items:[i]},products).total,500);
});
test('new material maps match their recorded hashes and invalid selections recover safely',()=>{
 const maps=read('render/ambientcg-manifest.json');assert.equal(maps.length,6);
 for(const r of maps){assert.equal(r.license,'CC0-1.0');assert.equal(createHash('sha256').update(readFileSync(new URL('../public'+r.path,import.meta.url))).digest('hex'),r.sha256);}
 assert.equal(parseAppearance({floorMaterial:'oak',rugMaterial:'woven'}).rugMaterial,'woven');assert.equal(parseAppearance({floorMaterial:'../../private'}).floorMaterial,'oak');
});
