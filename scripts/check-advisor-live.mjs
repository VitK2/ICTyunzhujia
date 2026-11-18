import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildCatalog} from '../src/catalog.ts';
import {validate} from '../src/engine.ts';
import {serializeHistory} from '../src/agent-context.ts';
const base=process.argv[2]||'http://127.0.0.1:5174';
const status=await(await fetch(base+'/api/agent/status')).json();
assert.equal(status.mode,'cloud');assert.equal(status.configured,true);
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n,import.meta.url),'utf8'));
const products=buildCatalog(read('catalog.json'),read('retail.json'));
const ids=['sofa_02','modern_coffee_table_01','modern_wooden_cabinet','modern_arm_chair_01','side_table_01'],pos=[[2.55,.72,180],[2.55,2.35,90],[2.5,4.35,0],[4.55,2.1,-90],[.85,.7,0]];
const plan={name:'顾问合成联调',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:8000,reserved:false,brief:{location:'',preferences:'木质',activities:'阅读和会客',layoutMode:'reading',buyingMode:'retail'},items:ids.map((id,n)=>({id:'advisor-'+n,productId:'ph_'+id,x:pos[n][0],z:pos[n][1],yaw:pos[n][2],locked:n===0,estimate:null}))};
const report={checkedAt:new Date().toISOString(),provider:status.provider,model:status.model,syntheticFixture:true,stages:[]};
async function stage(name,task){const start=Date.now();try{const data=await task();const entry={name,passed:true,elapsedMs:Date.now()-start,...data};report.stages.push(entry);console.log(JSON.stringify(entry));}catch(e){report.stages.push({name,passed:false,error:e.message,elapsedMs:Date.now()-start});throw e;}finally{mkdirSync('.local',{recursive:true});writeFileSync('.local/advisor-live-report.json',JSON.stringify(report,null,2));}}
async function chat(message,plan,history=[]){const r=await fetch(base+'/api/agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,plan,history}),signal:AbortSignal.timeout(110000)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
let rec;
const request='现在的茶几太大，想换成宽度不超过90厘米、深度不超过60厘米、单件400元以内的。按已保存的需求帮我挑选，预算不变，保留沙发不动。先推荐，不应用。';
await stage('真实模型按换购目标与尺寸上限推荐',async()=>{
 rec=await chat(request,plan);assert.deepEqual(rec.plan.items,plan.items);assert.ok(rec.recommendations.length>0);assert.ok(rec.recommendations.every(r=>r.targetItemId==='advisor-1'&&r.fit?.mode==='replace'&&r.fit.geometryChecked));
 for(const r of rec.recommendations){const p=products.find(p=>p.id===r.productId);assert.ok(p.width<=.9&&p.depth<=.6&&p.price<=400);}
 return {count:rec.recommendations.length,targetPreserved:true,geometryTrial:true,tools:rec.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
await stage('多轮第一款选择与少移动布局',async()=>{
 const history=serializeHistory([{role:'user',text:request},{role:'assistant',text:rec.reply,recommendations:rec.recommendations}]);
 const result=await chat('就用第一款替换原茶几。其他家具尽量少动，保留沙发原位，不要删除家具，更新阅读布局并检查。',plan,history);
 assert.equal(result.accepted,true);assert.equal(result.changed,true);assert.equal(result.plan.items.find(i=>i.id==='advisor-1').productId,rec.recommendations[0].productId);assert.deepEqual(result.plan.items.find(i=>i.id==='advisor-0'),plan.items[0]);assert.deepEqual(result.plan.items.map(i=>i.id).sort(),plan.items.map(i=>i.id).sort());assert.equal(validate(result.plan,products).length,0);
 return {firstCardResolved:true,allFurniturePreserved:true,lockedSofaPreserved:true,geometryIssues:0,unrelatedMoves:result.plan.items.filter(i=>i.id!=='advisor-1'&&JSON.stringify(i)!==JSON.stringify(plan.items.find(j=>j.id===i.id))).length,tools:result.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
await stage('严格偏好无候选时保持原场景',async()=>{
 const r=await chat('茶几只要实木，不要黑色和白色，请推荐真实商品，先推荐不应用；没有符合的就说明原因。',plan);
 assert.deepEqual(r.plan.items,plan.items);assert.equal(r.recommendations.length,0);assert.ok(r.trace.some(t=>t.tool==='recommend_furniture'&&t.ok));
 return {recommendations:0,noInventedCandidate:true,placementPreserved:true,tools:r.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
console.log('Advisor live integration passed: .local/advisor-live-report.json');
