import type {Plan,Product} from '../src/engine.ts';
import {totals,suggest,newItem} from '../src/engine.ts';
import {DEFAULT_BRIEF} from '../src/brief.ts';
export type Recommendation={productId:string;name:string;category:string;price:number|null;reasons:string[];limitations:string[];sourceUrl:string;kind:'asset'|'retail';targetItemId?:string;fit?:{mode:'add'|'replace';geometryChecked:true;lockedPreserved:true;knownTotalAfter:number;unpricedAfter:number;footprintChange:number|null}};
export type RecommendArgs={category?:string;query?:string;itemId?:string;productId?:string;maxWidth?:number;maxDepth?:number;maxHeight?:number;maxPrice?:number};
const preferenceGroups=[['木质','木框','木纹','桦木','实木'],['皮革','皮质'],['布艺'],['现代'],['极简'],['中式'],['复古','中古'],['玻璃'],['金属','钢制'],['圆形','圆桌'],['方形'],['黑'],['白'],['灰'],['蓝'],['棕','褐']];
export function preferenceTerms(text:string){
 const negative=[...text.matchAll(/(?:不要|不喜欢|不考虑|排除|避免|不选|不买)([^，。；\n]{1,48})/g)].map(m=>m[1]);
 const positive=text.replace(/(?:不要|不喜欢|不考虑|排除|避免|不选|不买)[^，。；\n]{1,48}/g,'');
 const excluded=preferenceGroups.flat().filter(k=>negative.some(n=>n.includes(k)));
 const wanted=preferenceGroups.filter(g=>g.some(k=>positive.includes(k)));
 const required=[...positive.matchAll(/(?:必须|只要|只考虑|仅考虑|只能|一定要)\s*(实木|木质|木框|皮革|布艺|现代|极简|中式|复古|中古|玻璃|金属|圆形|方形|黑色|白色|灰色|蓝色)/g)].map(m=>m[1]);
 return {excluded,wanted,required};
}
export function recommend(plan:Plan,products:Product[],args:RecommendArgs){
 const brief=plan.brief||DEFAULT_BRIEF;const replaced=args.itemId?plan.items.find(i=>i.id===args.itemId):null;
 if(args.itemId&&!replaced)throw Error('替换目标不存在');if(replaced?.locked)throw Error('替换目标已锁定');
 const old=products.find(p=>p.id===replaced?.productId),category=args.category||old?.category;
 if(old&&category!==old.category)throw Error('只能推荐同类别的替换品');
 const oldPrice=old?.kind==='retail'&&!old.archive?old.price:replaced?.estimate;
 const current=totals(plan,products),remaining=plan.budget-current.total+(oldPrice??0);
 const terms=preferenceTerms([brief.preferences,args.query||''].join('，'));
 const rejected:Record<string,number>={};
 function reject(reason:string){rejected[reason]=(rejected[reason]||0)+1;return false;}
 const candidates=products.filter(p=>{
  if(p.mount==='wall'||category&&p.category!==category||p.id===old?.id||args.productId&&p.id!==args.productId)return false;
  if(brief.buyingMode==='retail'&&p.kind!=='retail')return reject('当前只选真实商品');
  if(!replaced&&plan.items.length>=30)return reject('房间已达到30件家具上限');
  if(args.maxWidth!=null&&p.width>args.maxWidth||args.maxDepth!=null&&p.depth>args.maxDepth||args.maxHeight!=null&&p.height>args.maxHeight)return reject('超过指定尺寸');
  if(p.height>plan.room.height||!((p.width<=plan.room.width&&p.depth<=plan.room.depth)||(p.depth<=plan.room.width&&p.width<=plan.room.depth)))return reject('超过房间尺寸');
  const evidence=p.searchText||p.name;
  if(terms.excluded.some(k=>evidence.includes(k)))return reject('名称命中排除偏好');
  if(terms.required.some(k=>!evidence.includes(k)))return reject('目录名称无法证实必选条件');
  if(args.maxPrice!=null&&p.price==null)return reject('未定价，无法核实单件价格上限');
  if(p.price!=null&&p.price>Math.min(remaining,args.maxPrice??Infinity))return reject('超过已知预算余量或单件价格上限');
  return true;
 }).map(p=>({p,hits:terms.wanted.flatMap(g=>g.filter(k=>(p.searchText||p.name).includes(k)).slice(0,1))}))
 .sort((a,b)=>b.hits.length-a.hits.length||(a.p.price==null?1:0)-(b.p.price==null?1:0)||(a.p.price??Infinity)-(b.p.price??Infinity)||a.p.id.localeCompare(b.p.id));
 const recommendations:Recommendation[]=[];
 for(const {p,hits} of candidates){
  const trial=structuredClone(plan);
  if(replaced){const i=trial.items.find(i=>i.id===replaced.id)!;i.productId=p.id;i.estimate=null;}
  else trial.items.push(newItem(p,plan.room.width/2,plan.room.depth/2));
  const placed=suggest(trial,products,brief.layoutMode);
  if(!placed){reject('保留锁定家具后未找到可行摆放');continue;}
  const after=totals(placed,products);
  if(after.exceeded){reject('试放后的已知金额超过预算');continue;}
  const reasons:string[]=[],limitations:string[]=[];
  if(category)reasons.push('符合所选家具类别');
  if(hits.length)reasons.push((p.archive?'历史商品属性匹配：':'名称匹配偏好：')+hits.join('、'));
  if(p.price!=null)reasons.push(`历史参考价¥${p.price}，${replaced?'换购':'新增'}后的已知合计¥${after.total.toFixed(2)}`);else limitations.push('没有官方售价，无法判断总预算');
  reasons.push(`尺寸${Math.round(p.width*100)}×${Math.round(p.depth*100)}×${Math.round(p.height*100)}cm；已保留锁定项试放通过`);
  const areaChange=old?Math.round((p.width*p.depth-old.width*old.depth)*1000)/1000:null;
  if(areaChange!=null)reasons.push(`较原家具${areaChange<0?'减少':'增加'}占地${Math.abs(areaChange).toFixed(2)}㎡`);
  if(after.unpriced)limitations.push(`应用后仍有${after.unpriced}件未定价，整体预算不能确认`);
  if(brief.preferences||args.query)limitations.push('偏好仅按目录名称比对；未标注的材质、风格、颜色及耐用性不能保证');
  if(brief.location)limitations.push(`${brief.location}的配送、门店库存及运费未核验`);
  limitations.push('试放仅验证现有矩形房间几何；未验证入户搬运尺寸、完整通道可达性及施工规范');
  limitations.push(p.archive?'ABO历史商品样本；带原始商品模型和PBR贴图，无当前售价或在售保证':p.kind==='retail'?'2026-11-10历史价格；三维外观为尺寸示意':'开放素材未绑定真实在售商品');
  recommendations.push({productId:p.id,name:p.name,category:p.category,price:p.price??null,kind:p.kind,reasons,limitations,sourceUrl:p.sourceUrl,
   ...(replaced?{targetItemId:replaced.id}:{}),fit:{mode:replaced?'replace':'add',geometryChecked:true,lockedPreserved:true,knownTotalAfter:after.total,unpricedAfter:after.unpriced,footprintChange:areaChange}});
  if(recommendations.length>=6)break;
 }
 return {recommendations,remainingKnownBudget:remaining,unpricedExisting:current.unpriced,rejected,notice:'按目录名称、尺寸、历史价格及保留锁定家具的实际布局试算筛选；无候选时说明筛除原因，不自动放宽必选或排除条件。'};
}
