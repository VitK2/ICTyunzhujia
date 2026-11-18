import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildCatalog} from '../src/catalog.ts';
import {validate} from '../src/engine.ts';
import {serializeHistory} from '../src/agent-context.ts';
const base=process.argv[2]||'http://127.0.0.1:5174';
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n,import.meta.url),'utf8'));
const products=buildCatalog(read('catalog.json'),read('retail.json'),read('abo.json'));
const report={checkedAt:new Date().toISOString(),syntheticFixture:true,total:products.length,archive:products.filter(p=>p.archive).length,stages:[]};
async function stage(name,task){const start=Date.now();try{const data=await task();const entry={name,passed:true,elapsedMs:Date.now()-start,...data};report.stages.push(entry);console.log(JSON.stringify(entry));}catch(e){report.stages.push({name,passed:false,error:e.message});throw e;}finally{mkdirSync('.local',{recursive:true});writeFileSync('.local/expanded-assets-report.json',JSON.stringify(report,null,2));}}
async function chat(message,plan,history=[]){const r=await fetch(base+'/api/agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,plan,history}),signal:AbortSignal.timeout(110000)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
await stage('HTTP catalog, models, previews and material maps',async()=>{
 const rows=await(await fetch(base+'/data/abo.json')).json();assert.equal(rows.length,report.archive);
 const paths=rows.flatMap(r=>[r.model_url,r.preview_url]);const manifest=await(await fetch(base+'/render/ambientcg-manifest.json')).json();paths.push(...manifest.map(m=>m.path),'/credits.html','/licenses/abo/LICENSE-CC-BY-4.0.txt');
 for(let i=0;i<paths.length;i+=8)await Promise.all(paths.slice(i,i+8).map(async p=>{const r=await fetch(base+p,{method:'HEAD'});assert.equal(r.status,200,p);assert.ok(Number(r.headers.get('content-length'))>100,p);}));
 return {checkedFiles:paths.length,models:rows.length,materialMaps:manifest.length};
});
await stage('DeepSeek connection',async()=>{const r=await fetch(base+'/api/agent/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));assert.equal(data.verified,true);report.provider=data.provider;report.model=data.model;return {provider:data.provider,model:data.model,verified:data.verified};});
const ids=['sofa_02','modern_coffee_table_01','modern_wooden_cabinet','modern_arm_chair_01','side_table_01'],pos=[[2.55,.72,180],[2.55,2.35,90],[2.5,4.35,0],[4.55,2.1,-90],[.85,.7,0]];
const plan={name:'ABO合成联调',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:8000,reserved:false,brief:{location:'',preferences:'木质，不要黑色',activities:'阅读和会客',layoutMode:'reading',buyingMode:'retail'},items:ids.map((id,n)=>({id:'abo-check-'+n,productId:'ph_'+id,x:pos[n][0],z:pos[n][1],yaw:pos[n][2],locked:n===0,estimate:null}))};
const request='从ABO历史商品样本中推荐木质茶几，不要黑色，用来替换当前茶几。没有当前售价也可以，但必须说明价格待查，不能按零元计算。先推荐不要应用，保留沙发不动。';
let rec;
await stage('Real model recommends archived furniture with placement trial',async()=>{
 rec=await chat(request,plan);assert.deepEqual(rec.plan.items,plan.items);assert.ok(rec.recommendations.length>0);
 for(const r of rec.recommendations){const p=products.find(p=>p.id===r.productId);assert.equal(p.archive,true);assert.equal(p.category,'coffee_table');assert.equal(r.price,null);assert.ok(r.fit?.geometryChecked);assert.equal(r.targetItemId,'abo-check-1');assert.ok(!p.searchText.includes('黑色'));}
 return {count:rec.recommendations.length,ids:rec.recommendations.map(r=>r.productId),unknownPricesPreserved:true,tools:rec.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
await stage('Multi-turn archive selection and furniture-preserving layout',async()=>{
 const history=serializeHistory([{role:'user',text:request},{role:'assistant',text:rec.reply,recommendations:rec.recommendations}]);
 const result=await chat('用第一款替换原来的茶几，其他家具尽量少动，沙发原位锁定，生成阅读布局并检查，不要删除家具。',plan,history);
 assert.equal(result.accepted,true);assert.equal(result.changed,true);assert.equal(result.plan.items.find(i=>i.id==='abo-check-1').productId,rec.recommendations[0].productId);assert.deepEqual(result.plan.items.find(i=>i.id==='abo-check-0'),plan.items[0]);assert.deepEqual(result.plan.items.map(i=>i.id).sort(),plan.items.map(i=>i.id).sort());assert.equal(validate(result.plan,products).length,0);
 return {appliedProductId:rec.recommendations[0].productId,lockedSofaPreserved:true,allFurniturePreserved:true,geometryIssues:0,tools:result.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
console.log('Expanded asset integration passed: .local/expanded-assets-report.json');
