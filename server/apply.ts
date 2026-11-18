import type {Plan,Product} from '../src/engine.ts';
import {totals} from '../src/engine.ts';
import {createToolbox} from './tools.ts';
import {recommend} from './recommend.ts';
import {assessNeeds,reviewLayout} from './advisor.ts';
export function applyRecommendation(plan:Plan,products:Product[],action:'add'|'replace',productId:string,itemId?:string){
 const p=products.find(p=>p.id===productId);if(!p||p.mount==='wall')throw Error('商品不存在或不支持落地摆放');
 if(plan.brief?.buyingMode==='retail'&&p.kind!=='retail')throw Error('当前需求仅选真实商品，请先调整选购范围');
 if(action==='replace'&&!itemId)throw Error('请选择要替换的未锁定家具');
 const check=recommend(plan,products,{productId,...(action==='replace'?{itemId}:{})});
 if(!check.recommendations.length){if(Object.keys(check.rejected).some(s=>s.includes('预算')))throw Error('当前已知金额超过预算余量，本次未应用；请调整预算或家具');throw Error('当前需求或场景不再适用该推荐：'+Object.keys(check.rejected).join('；'));}
 const box=createToolbox(plan,products);const change=box.execute(action==='add'?'add_furniture':'replace_furniture',action==='add'?{productId}:{productId,itemId});
 if(!change.ok)throw Error(change.error);
 if(!box.execute('generate_layout',{mode:plan.brief?.layoutMode||'airy'}).ok)throw Error('加入或替换后未找到可行布局，本次未修改场景');
 box.execute('validate_layout',{});const result=box.finish();
 if(result.budgetExceeded)throw Error('当前方案的已知金额超过预算，本次未应用；请调整预算或家具');
 if(!result.accepted)throw Error('候选未通过空间或锁定校验，本次未应用');
 if(totals(result.plan,products).exceeded)throw Error('当前方案的已知金额超过预算，本次未应用；请调整预算或家具');
 return {...result,assessment:assessNeeds(result.plan,products),layoutReview:reviewLayout(result.plan,products),reply:`已${action==='add'?'加入':'替换为'}${p.name}，并重新布局。${result.budget.unpriced?`尚有${result.budget.unpriced}件家具未定价，不能确认整体预算。`:'历史参考价合计未超过预算。'}配送和库存未核验。`};
}
