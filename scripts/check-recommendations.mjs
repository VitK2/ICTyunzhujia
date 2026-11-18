import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCatalog} from '../src/catalog.ts';
import {validate} from '../src/engine.ts';
const base=process.argv[2]||'http://127.0.0.1:5174';
const status=await(await fetch(base+'/api/agent/status')).json();assert.equal(status.mode,'demo','This check only runs in demo mode.');
const read=name=>JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));
const products=buildCatalog(read('catalog.json'),read('retail.json'));
const ids=['sofa_02','modern_coffee_table_01','modern_wooden_cabinet','modern_arm_chair_01','side_table_01'],pos=[[2.55,.72,180],[2.55,2.35,90],[2.5,4.35,0],[4.55,2.1,-90],[.85,.7,0]];
const plan={name:'需求推荐HTTP验收',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:8000,reserved:false,brief:{location:'杭州滨江',preferences:'现代，木质',activities:'两人居住，经常阅读',layoutMode:'reading',buyingMode:'retail'},items:ids.map((id,n)=>({id:'brief-'+n,productId:'ph_'+id,x:pos[n][0],z:pos[n][1],yaw:pos[n][2],locked:n===0,estimate:null}))};
async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const json=await r.json();assert.equal(r.status,200,JSON.stringify(json));return json;}
const result=await post('/api/agent/chat',{message:'按我的需求推荐沙发和茶几',plan,history:[]});assert.ok(result.recommendations.length>=2);assert.deepEqual(result.plan.items,plan.items);assert.ok(result.recommendations.every(r=>r.kind==='retail'));assert.ok(result.recommendations.every(r=>r.limitations.some(s=>s.includes('配送'))));
const table=result.recommendations.find(r=>r.category==='coffee_table');assert.ok(table);
const applied=await post('/api/agent/apply',{message:'替换推荐茶几',plan,history:[],action:'replace',productId:table.productId,itemId:'brief-1'});assert.equal(applied.changed,true);assert.equal(applied.plan.items.find(i=>i.id==='brief-1').productId,table.productId);assert.deepEqual(applied.plan.items.find(i=>i.id==='brief-0'),plan.items[0]);assert.equal(validate(applied.plan,products).length,0);assert.deepEqual(applied.plan.brief,plan.brief);
console.log(JSON.stringify({mode:status.mode,recommendations:result.recommendations.length,originalPlacementPreserved:true,replacementApplied:true,lockedSofaPreserved:true,briefPreserved:true,geometryIssues:0},null,2));
