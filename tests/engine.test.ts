import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {footprint,intersects,validate,totals,suggest} from '../src/engine.ts';
import type {Product,Plan,Item} from '../src/engine.ts';
const products:Product[]=[{id:'chair',name:'椅子',category:'armchair',width:1,depth:.6,height:1,kind:'asset',sourceUrl:''},{id:'table',name:'桌子',category:'coffee_table',width:1,depth:.8,height:.5,kind:'retail',price:199,sourceUrl:''}];
const item=(id:string,x:number,z:number):Item=>({id,productId:'chair',x,z,yaw:0,locked:false,estimate:null});
const plan=(items:Item[]):Plan=>({name:'test',room:{width:5,depth:4,height:2.8,doorX:3.6,doorWidth:.9},items,budget:1000,reserved:false});
test('90 degree rotation swaps footprint width and depth',()=>{const p=footprint({...item('a',2,2),yaw:90},products[0]);assert.ok(Math.abs(Math.max(...p.map(x=>x[0]))-Math.min(...p.map(x=>x[0]))-.6)<1e-8);});
test('touching edges do not count as collision, penetration does',()=>{const a=footprint(item('a',1,1),products[0]);assert.equal(intersects(a,footprint(item('b',2,1),products[0])),false);assert.equal(intersects(a,footprint(item('b',1.95,1),products[0])),true);});
test('detects room boundary and pairwise overlap',()=>{const p=plan([item('a',-.1,1),item('b',1,2),item('c',1.2,2)]);assert.deepEqual(validate(p,products).map(i=>i.type).sort(),['bounds','overlap']);});
test('door swing catches furniture inside the opening envelope',()=>{const p=plan([item('a',4,3.6)]);assert.ok(validate(p,products).some(i=>i.type==='door'));});
test('unknown price remains unpriced instead of being silently free',()=>{const p=plan([item('a',1,1),{...item('b',2,2),productId:'table'}]);assert.deepEqual(totals(p,products),{total:199,unpriced:1,exceeded:false});p.items[0].estimate=900;assert.equal(totals(p,products).exceeded,true);});
test('layout search preserves locks and returns only geometrically valid layouts',()=>{const fixed={...item('fixed',1,1),locked:true};const p=plan([fixed,item('move',1,1)]);const next=suggest(p,products);assert.ok(next);assert.deepEqual(next.items.find(i=>i.id==='fixed'),fixed);assert.equal(validate(next,products).length,0);assert.equal(p.items[1].x,1);});
test('conflicting locks return failure without mutating original plan',()=>{const p=plan([{...item('a',1,1),locked:true},{...item('b',1,1),locked:true}]);const before=JSON.stringify(p);assert.equal(suggest(p,products),null);assert.equal(JSON.stringify(p),before);});
test('explicit activity zone participates in validation',()=>{const p=plan([item('a',.9,2.3)]);assert.equal(validate(p,products).length,0);p.reserved=true;assert.ok(validate(p,products).some(i=>i.type==='reserved'));});
test('real local asset dimensions support all three default layout preferences',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
 const ps:Product[]=catalog.map((a:any)=>({id:a.asset_id,name:a.name,category:a.category,width:a.width_mm/1000,depth:a.depth_mm/1000,height:a.height_mm/1000,sourceUrl:a.source_url,kind:'asset'}));
 const ids=['sofa_02','modern_coffee_table_01','modern_wooden_cabinet','modern_arm_chair_01','side_table_01'];
 const positions=[[2.55,.72,180],[2.55,2.35,90],[2.5,4.35,0],[4.55,2.1,-90],[.85,.7,0]];
 const p:Plan={name:'actual assets',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:10000,reserved:false,items:ids.map((id,n)=>({...item('real'+n,positions[n][0],positions[n][1]),productId:'ph_'+id,yaw:positions[n][2]}))};
 assert.equal(validate(p,ps).length,0);
 for(const mode of ['airy','social','reading'] as const){const next=suggest(p,ps,mode);assert.ok(next,mode);assert.equal(validate(next,ps).length,0,mode);assert.equal(next.items.length,5);}
 p.reserved=true;const reserved=suggest(p,ps);assert.ok(reserved);assert.equal(validate(reserved,ps).length,0);
});
