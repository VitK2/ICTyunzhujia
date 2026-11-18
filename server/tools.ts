import {suggest,validate,totals,newItem} from '../src/engine.ts';
import {validPlan} from '../src/plan-schema.ts';
import type {Plan,Product} from '../src/engine.ts';
import {DEFAULT_BRIEF,validBrief} from '../src/brief.ts';
import {recommend} from './recommend.ts';
import type {Recommendation} from './recommend.ts';
import {assessNeeds,reviewLayout} from './advisor.ts';

type Schema={type:string;enum?:unknown[];minimum?:number;maximum?:number;maxLength?:number};
const str:Schema={type:'string',maxLength:100};
const category:Schema={type:'string',enum:['sofa','armchair','coffee_table','side_table','nightstand','cabinet','shelf','tv_stand','wall_shelf']};
function tool(name:string,description:string,properties:Record<string,Schema>,required:string[]=[]){return {type:'function' as const,function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}};}
export const TOOLS=[
 tool('get_scene','读取当前房间、家具实例ID、锁定状态、预算和空间问题。',{}),
 tool('assess_needs','汇总客户需求、已知预算余量、未定价缺口、锁定家具、目录数量与最多两个待补问题。缺信息可先给有条件的候选，不要求填写地址。',{}),
 tool('review_layout','分析当前候选的几何问题、占地比例及沙发茶几距离建议。建议不是规范达标判断，不自动移动家具。',{}),
 tool('compare_furniture','比较两个真实目录候选的价格、尺寸、占地与实际试放结果。换购须传itemId；不会修改场景。',{productIdA:str,productIdB:str,itemId:str},['productIdA','productIdB']),
 tool('update_brief','仅依据用户明确输入更新城市区域、家具偏好和生活需求。没有配送库存数据，不推断地址或气候事实。',{location:{type:'string',maxLength:80},preferences:{type:'string',maxLength:500},activities:{type:'string',maxLength:500},layoutMode:{type:'string',enum:['airy','social','reading']},buyingMode:{type:'string',enum:['retail','mixed']}}),
 tool('recommend_furniture','按名称偏好、必选/排除条件、预算及保留锁定项的实际试放推荐候选，返回无候选原因。先展示候选不改摆放。换购必须传准确itemId以扣除旧价；宽深高单位米，maxPrice为单件价格上限。',{category,query:{type:'string',maxLength:500},itemId:str,maxWidth:{type:'number',minimum:.1,maximum:10},maxDepth:{type:'number',minimum:.1,maximum:10},maxHeight:{type:'number',minimum:.1,maximum:4},maxPrice:{type:'number',minimum:0,maximum:10000000}}),
 tool('search_furniture','检索本地真实目录。尺寸单位米，未知售价为null。不能编造商品ID或价格。',{category,query:str,maxWidth:{type:'number',minimum:.1,maximum:10}}),
 tool('update_preferences','设置预算上限或左侧活动区预留，不调整商品价格。',{budget:{type:'number',minimum:0,maximum:10000000},reserved:{type:'boolean'}}),
 tool('lock_furniture','按类别或实例ID锁定家具。已有锁定项不得解锁或变更。',{category,itemId:str}),
 tool('replace_furniture','以目录中另一件同类别家具替换未锁定实例；外观和售价证据以目录为准。',{itemId:str,productId:str},['itemId','productId']),
 tool('add_furniture','向房间加入一个目录中的落地家具，之后须生成布局并校验。',{productId:str},['productId']),
 tool('remove_furniture','删除一个未锁定的家具实例。',{itemId:str},['itemId']),
 tool('move_furniture','移动或旋转未锁定的家具实例。单位米，之后须校验。',{itemId:str,x:{type:'number',minimum:-20,maximum:20},z:{type:'number',minimum:-20,maximum:20},yaw:{type:'number',minimum:-360,maximum:360}},['itemId','x','z','yaw']),
 tool('generate_layout','生成布局并保留锁定项。strategy=minimal优先减少移动，balanced按阅读/会客目标安排。失败时说明约束，不能删除家具凑结果。',{mode:{type:'string',enum:['airy','social','reading']},strategy:{type:'string',enum:['balanced','minimal']}},['mode']),
 tool('validate_layout','检查家具边界、重叠、门扇、预留区及预算；不包含专业施工规范和完整通道可达性。',{}),
];
export type Trace={tool:string;ok:boolean;summary:string};
export function checkArgs(name:string,value:unknown):Record<string,any>{
 const spec=TOOLS.find(t=>t.function.name===name)?.function.parameters;
 if(!spec)throw Error('不支持的工具');
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('参数必须为对象');
 const a=value as Record<string,any>;
 for(const k of spec.required)if(!(k in a))throw Error('缺少参数 '+k);
 for(const [k,v] of Object.entries(a)){const s=spec.properties[k];if(!s)throw Error('不支持的参数 '+k);if(typeof v!==s.type||s.type==='number'&&!Number.isFinite(v))throw Error('参数类型错误 '+k);if(s.enum&&!s.enum.includes(v)||s.minimum!=null&&v<s.minimum||s.maximum!=null&&v>s.maximum||s.maxLength!=null&&v.length>s.maxLength)throw Error('参数超出范围 '+k);}
 return a;
}
export function createToolbox(original:Plan,products:Product[],policy?:{allowFurnitureChanges:boolean;allowRemoval:boolean;allowBudgetChange?:boolean;blockedTools?:string[]}){
 let plan=structuredClone(original);const trace:Trace[]=[];const recommendations=new Map<string,Recommendation>();
 function execute(name:string,value:unknown){const before=structuredClone(plan);try{
  const a=checkArgs(name,value);let result:any;let summary='';
  if(policy&&!policy.allowFurnitureChanges&&['lock_furniture','replace_furniture','add_furniture','remove_furniture','move_furniture','generate_layout'].includes(name))throw Error('本轮只分析或推荐，客户尚未要求应用家具修改；请先展示候选');
  if(policy&&!policy.allowRemoval&&name==='remove_furniture')throw Error('客户未明确要求删除家具，不能用删除来凑布局');
  if(policy?.blockedTools?.includes(name))throw Error('客户明确排除了这类家具修改，本次不执行');
  if(policy&&name==='update_preferences'&&a.budget!=null&&a.budget!==plan.budget&&!policy.allowBudgetChange)throw Error('客户本轮未要求改变预算上限，不能为选购或布局自动加预算');
  const getProduct=(id:string)=>{const p=products.find(p=>p.id===id);if(!p||p.mount==='wall')throw Error('不存在的落地家具ID');return p;};
  const getItem=(id:string)=>{const i=plan.items.find(i=>i.id===id);if(!i)throw Error('不存在的家具实例ID');if(i.locked)throw Error('该家具已锁定，请在界面中手动解锁');return i;};
  switch(name){
   case 'assess_needs':result=assessNeeds(plan,products);summary='整理客户需求、预算缺口与保留条件';break;
   case 'review_layout':result=reviewLayout(plan,products);summary=`分析家具占地${result.occupancyRatio}%，给出${result.advice.length}条布置建议`;break;
   case 'compare_furniture':{const entries=[a.productIdA,a.productIdB].map(id=>{const p=getProduct(id),current=plan.items.find(i=>i.id===a.itemId&&i.productId===id),r=current?{recommendations:[],rejected:{}}:recommend(plan,products,{productId:id,...(a.itemId?{itemId:a.itemId}:{})});return {productId:p.id,name:p.name,dimensions:{width:p.width,depth:p.depth,height:p.height},area:p.width*p.depth,price:p.price??null,currentlyOwned:!!current,candidate:r.recommendations[0]??null,exclusions:r.rejected};});result={entries,notice:'同一当前场景条件的试算；currentlyOwned为原家具基线，不必重新购买。不自动选择或应用。'};summary='比较2件家具的价格、尺寸和可行性';break;}
   case 'update_brief':{if(!Object.keys(a).length)throw Error('须提供至少一个需求字段');const brief={...(plan.brief||DEFAULT_BRIEF),...a};if(!validBrief(brief))throw Error('需求档案格式错误');plan.brief=brief;result={brief};summary='更新城市区域、家具偏好或生活需求';break;}
   case 'recommend_furniture':{result=recommend(plan,products,a);result.recommendations.forEach((r:Recommendation)=>recommendations.set(r.productId,r));summary=`按需求筛选出${result.recommendations.length}件家具，推荐尚未应用`;break;}
   case 'get_scene':result={plan,products:plan.items.map(i=>getProduct(i.productId)),issues:validate(plan,products),budget:totals(plan,products)};summary=`读取${plan.items.length}件家具和房间尺寸`;break;
   case 'search_furniture':{const found=products.filter(p=>p.mount!=='wall'&&(!a.category||p.category===a.category)&&(!a.query||(p.searchText||p.name).toLowerCase().includes(a.query.toLowerCase()))&&(!a.maxWidth||p.width<=a.maxWidth));result=found.slice(0,20).map(p=>({...p,price:p.price??null,priceEvidence:p.archive?'ABO历史样本，没有当前售价':p.kind==='asset'?'无官方售价':'2026-11-10历史参考价',appearance:p.archive?'ABO原商品模型和贴图；非在售保证':p.kind==='asset'?'开放素材，未绑定在售商品':'仅尺寸示意模型'}));summary=`找到${found.length}件目录家具`;break;}
   case 'update_preferences':if(a.budget==null&&a.reserved==null)throw Error('须指定预算或预留区');if(a.budget!=null)plan.budget=a.budget;if(a.reserved!=null)plan.reserved=a.reserved;result={budget:plan.budget,reserved:plan.reserved};summary='更新预算或活动区偏好';break;
   case 'lock_furniture':{if(!a.category&&!a.itemId)throw Error('须指定类别或实例ID');const items=plan.items.filter(i=>(!a.itemId||i.id===a.itemId)&&(!a.category||getProduct(i.productId).category===a.category));if(!items.length)throw Error('没有匹配的家具实例');items.forEach(i=>i.locked=true);result={lockedIds:items.map(i=>i.id)};summary=`锁定${items.length}件家具`;break;}
   case 'replace_furniture':{const i=getItem(a.itemId),p=getProduct(a.productId);if(p.category!==getProduct(i.productId).category)throw Error('只允许同类别替换');i.productId=p.id;i.estimate=null;result={item:i};summary=`替换为${p.name}`;break;}
   case 'add_furniture':{if(plan.items.length>=30)throw Error('每个房间最多30件家具');const p=getProduct(a.productId),i=newItem(p,plan.room.width/2,plan.room.depth/2);plan.items.push(i);result={item:i};summary=`加入${p.name}`;break;}
   case 'remove_furniture':{const i=getItem(a.itemId);plan.items=plan.items.filter(x=>x.id!==i.id);result={removed:i.id};summary='移除一件未锁定家具';break;}
   case 'move_furniture':{const i=getItem(a.itemId);Object.assign(i,{x:a.x,z:a.z,yaw:a.yaw});result={item:i};summary='更新家具位置和角度';break;}
   case 'generate_layout':{const next=suggest(plan,products,a.mode,a.strategy);if(!next)throw Error('当前约束下没有找到可行布局；候选保持原状');plan=next;result={plan,issues:validate(plan,products),review:reviewLayout(plan,products)};summary=`生成${plan.name}并通过空间检查`;break;}
   case 'validate_layout':result={issues:validate(plan,products),budget:totals(plan,products)};summary=`空间问题${result.issues.length}项，未定价${result.budget.unpriced}件`;break;
  }
  if(!validPlan(plan,products))throw Error('候选方案数据不合法');
  trace.push({tool:name,ok:true,summary});return {ok:true,data:structuredClone(result)};
 }catch(e){plan=before;const error=e instanceof Error?e.message:'工具执行失败';trace.push({tool:name.slice(0,80),ok:false,summary:error});return {ok:false,error};}}
 function finish(){const issues=validate(plan,products);const changed=JSON.stringify(plan)!==JSON.stringify(original);const furnitureChanged=JSON.stringify(plan.items)!==JSON.stringify(original.items);const locksPreserved=original.items.filter(i=>i.locked).every(i=>JSON.stringify(plan.items.find(x=>x.id===i.id))===JSON.stringify(i));const budgetExceeded=furnitureChanged&&totals(plan,products).exceeded;const accepted=validPlan(plan,products)&&!issues.length&&locksPreserved&&!budgetExceeded;const result=accepted?plan:original;return {plan:structuredClone(result),changed:accepted&&changed,issues,budget:totals(result,products),budgetExceeded,trace:structuredClone(trace),recommendations:structuredClone([...recommendations.values()]).slice(0,12),accepted};}
 return {execute,finish};
}
