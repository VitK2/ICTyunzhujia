import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {buildCatalog} from '../src/catalog.ts';
import {validate} from '../src/engine.ts';
const base=process.argv[2]||'http://127.0.0.1:5174';
const status=await(await fetch(base+'/api/agent/status')).json();
assert.equal(status.mode,'cloud','请先在界面保存真实模型配置');assert.equal(status.configured,true,'请先填写密钥');assert.equal(status.verified,true,'请先在界面完成连接测试');
const read=name=>JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));
const products=buildCatalog(read('catalog.json'),read('retail.json'));
const ids=['sofa_02','modern_coffee_table_01','modern_wooden_cabinet','modern_arm_chair_01','side_table_01'],pos=[[2.55,.72,180],[2.55,2.35,90],[2.5,4.35,0],[4.55,2.1,-90],[.85,.7,0]];
const plan={name:'真实API联调测试房间',room:{width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9},budget:8000,reserved:false,brief:{location:'杭州滨江（合成测试条件）',preferences:'现代、木质；未标注材质时请说明',activities:'两人居住，阅读和会客',layoutMode:'reading',buyingMode:'retail'},items:ids.map((id,n)=>({id:'live-'+n,productId:'ph_'+id,x:pos[n][0],z:pos[n][1],yaw:pos[n][2],locked:n===0,estimate:null}))};
const report={checkedAt:new Date().toISOString(),provider:status.provider,model:status.model,syntheticFixture:true,stages:[]};
async function post(path,data){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(110000),body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'接口调用失败');return result;}
async function stage(name,task){const start=Date.now();try{const result=await task();const entry={name,passed:true,elapsedMs:Date.now()-start,...result};report.stages.push(entry);console.log(JSON.stringify(entry));}catch(e){report.stages.push({name,passed:false,elapsedMs:Date.now()-start,error:e.message});throw e;}finally{mkdirSync('.local',{recursive:true});writeFileSync('.local/live-agent-report.json',JSON.stringify(report,null,2));}}
let recommended,layout;
await stage('真实模型推荐家具',async()=>{
 recommended=await post('/api/agent/chat',{message:'请根据已保存需求和8000元预算，分别调用recommend_furniture推荐沙发和茶几，展示目录内候选及依据。仅推荐，不移动、替换或增加家具，不修改预算和需求档案。',plan,history:[]});
 assert.equal(recommended.mode,'cloud');assert.deepEqual(recommended.plan.items,plan.items);assert.ok(recommended.recommendations.some(r=>r.category==='sofa'));assert.ok(recommended.recommendations.some(r=>r.category==='coffee_table'));assert.ok(recommended.recommendations.every(r=>products.some(p=>p.id===r.productId&&p.kind==='retail')));assert.ok(recommended.trace.some(t=>t.tool==='recommend_furniture'&&t.ok));
 return {recommendations:recommended.recommendations.length,placementPreserved:true,tools:recommended.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
await stage('真实模型修改阅读布局',async()=>{
 layout=await post('/api/agent/chat',{message:'现在请实际修改布局：保留全部现有家具，锁定沙发位置完全不变，预算保持8000元。调用generate_layout，mode使用reading，再用validate_layout检查。不要添加、删除、替换家具，不要修改需求档案。',plan,history:[]});
 assert.equal(layout.mode,'cloud');assert.equal(layout.accepted,true);assert.equal(layout.changed,true);assert.ok(layout.trace.some(t=>t.tool==='generate_layout'&&t.ok));assert.deepEqual(layout.plan.items.find(i=>i.id==='live-0'),plan.items[0]);assert.deepEqual(layout.plan.items.map(i=>i.id).sort(),plan.items.map(i=>i.id).sort());assert.equal(layout.plan.budget,8000);assert.equal(validate(layout.plan,products).length,0);
 return {lockedSofaPreserved:true,geometryIssues:0,tools:layout.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
await stage('应用推荐茶几并重新布置',async()=>{
 const table=recommended.recommendations.find(r=>r.category==='coffee_table');const result=await post('/api/agent/apply',{message:'替换推荐茶几',history:[],plan:layout.plan,action:'replace',productId:table.productId,itemId:'live-1'});
 assert.equal(result.changed,true);assert.equal(result.plan.items.find(i=>i.id==='live-1').productId,table.productId);assert.deepEqual(result.plan.items.find(i=>i.id==='live-0'),plan.items[0]);assert.deepEqual(result.plan.brief,plan.brief);assert.equal(validate(result.plan,products).length,0);assert.equal(result.budget.exceeded,false);
 return {productId:table.productId,knownTotal:result.budget.total,unpriced:result.budget.unpriced,geometryIssues:0,lockedSofaPreserved:true,tools:result.trace.map(t=>({tool:t.tool,ok:t.ok}))};
});
console.log('Live Agent integration passed. Report: .local/live-agent-report.json');
