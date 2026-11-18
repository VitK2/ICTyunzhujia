import type {Plan,Product} from '../src/engine.ts';
import {totals,validate,footprint} from '../src/engine.ts';
import {DEFAULT_BRIEF} from '../src/brief.ts';

export function assessNeeds(plan:Plan,products:Product[]){
 const brief=plan.brief||DEFAULT_BRIEF,budget=totals(plan,products);
 const questions:string[]=[];
 if(!brief.preferences.trim())questions.push('偏好什么风格、颜色或材质？有哪些必须避开的款式？');
 if(!brief.activities.trim())questions.push('主要用于阅读、会客还是留出活动空间？');
 if(!plan.items.some(i=>i.locked)&&plan.items.length)questions.push('哪些已有家具需要保留原位？');
 return {room:{width:plan.room.width,depth:plan.room.depth,area:Math.round(plan.room.width*plan.room.depth*100)/100},brief,
  budget:{limit:plan.budget,knownTotal:budget.total,remainingKnown:plan.budget-budget.total,unpriced:budget.unpriced,complete:budget.unpriced===0},
  locked:plan.items.filter(i=>i.locked).map(i=>({itemId:i.id,name:products.find(p=>p.id===i.productId)?.name})),
  available:{retail:products.filter(p=>p.kind==='retail'&&p.mount!=='wall').length,assets:products.filter(p=>p.kind==='asset'&&p.mount!=='wall').length},
  questions:questions.slice(0,2),scope:'矩形单客厅；住房城市只记录条件，不能推断配送库存。缺少偏好可先提供候选，不强制用户填写地址。'};
}

export function reviewLayout(plan:Plan,products:Product[]){
 const advice:string[]=[];
 const items=plan.items.flatMap(i=>{const p=products.find(p=>p.id===i.productId);return p?[{i,p}]:[];});
 const area=items.reduce((s,{p})=>s+p.width*p.depth,0),ratio=area/(plan.room.width*plan.room.depth);
 if(ratio>.45)advice.push('家具占地较多，建议优先比较更小的家具；不会自动删掉已有家具。');
 const sofas=items.filter(x=>x.p.category==='sofa'),tables=items.filter(x=>x.p.category==='coffee_table');
 // Axis-aligned edge distance is only a preview heuristic, not a clearance standard.
 if(sofas.length&&tables.length){
  const gaps=tables.map(t=>Math.min(...sofas.map(s=>{
   const a=footprint(t.i,t.p),b=footprint(s.i,s.p);
   const range=(poly:typeof a,n:0|1)=>[Math.min(...poly.map(p=>p[n])),Math.max(...poly.map(p=>p[n]))];
   const ax=range(a,0),az=range(a,1),bx=range(b,0),bz=range(b,1);
   return Math.hypot(Math.max(0,ax[0]-bx[1],bx[0]-ax[1]),Math.max(0,az[0]-bz[1],bz[0]-az[1]));
  })));
  if(gaps.some(g=>g<.25))advice.push('茶几与沙发的外框距离偏近，可尝试挪开或换小茶几；这里只是预览建议。');
  if(gaps.some(g=>g>1.2))advice.push('茶几距离沙发较远，可尝试放到沙发前方便取用。');
 }
 return {issues:validate(plan,products),furnitureArea:Math.round(area*100)/100,occupancyRatio:Math.round(ratio*100),advice,
  notice:'占地比例与外框距离为布置启发式指标，不是人体工学、安全或施工达标结论；未验证完整通道可达性。'};
}

export function requestPolicy(message:string){
 const negatives=/(?:不要|无需|不需要|不许|不准|禁止|不得|不能|不(?=删除|移除|添加|增加|替换|更换|修改|调整|改变|移动))([^，。；\n]+)/g;
 const negative=[...message.matchAll(negatives)].map(m=>m[1]);
 const positive=message.replace(negatives,'');
 const readOnly=/(?:只|仅|先)(?:做|给我|帮我)?(?:推荐|比较|分析|看看)|保持(?:场景|布局|摆放)不变/.test(message);
 const changing=/布置|(?:修改|调整|优化|生成|重新|更改|设计).{0,8}(?:布局|方案|摆放)|移动|挪|换|加入|添加|删除|移除|去掉|清空|锁定|保留/.test(positive);
 const blockedTools:string[]=[];
 if(negative.some(n=>/删除|移除|去掉|清空|移走|拿掉/.test(n)))blockedTools.push('remove_furniture');
 if(negative.some(n=>/添加|加入|增加/.test(n)))blockedTools.push('add_furniture');
 if(negative.some(n=>/替换|更换/.test(n)))blockedTools.push('replace_furniture');
 if(negative.some(n=>/预算/.test(n)))blockedTools.push('update_preferences');
 if(negative.some(n=>/档案|需求/.test(n)))blockedTools.push('update_brief');
 const allowBudgetChange=/预算|总价|总共|一共|上限|只(?:有|花)|不超过/.test(positive)&&!/预算不变|不(?:修改|调整|改变)预算|保持.{0,12}预算/.test(message);
 return {allowFurnitureChanges:!readOnly&&changing,allowRemoval:!readOnly&&/删除|移除|去掉|清空|移走|拿掉/.test(positive),allowBudgetChange,blockedTools};
}
