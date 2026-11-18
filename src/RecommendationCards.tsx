import type {Recommendation} from './agent-client';
import type {Plan,Product} from './engine';
import {useState} from 'react';
type Props={plan:Plan;products:Product[];busy:boolean;onApply:(r:Recommendation,action:'add'|'replace',itemId?:string)=>void};
export default function RecommendationCards({items,plan,products,busy,onApply}:{items:Recommendation[];plan:Plan;products:Product[];busy:boolean;onApply:(r:Recommendation,action:'add'|'replace',itemId?:string)=>void}){
 return <div className="recommendation-cards">{items.map((r,n)=><RecommendationCard key={r.productId+':'+(r.targetItemId||'add')} r={r} number={n+1} plan={plan} products={products} busy={busy} onApply={onApply}/>)}</div>;
}
function RecommendationCard({r,number,plan,products,busy,onApply}:Props&{r:Recommendation;number:number}){
 const [chosen,setChosen]=useState('');
 const p=products.find(p=>p.id===r.productId);if(!p)return null;
 const candidates=plan.items.filter(i=>!i.locked&&i.productId!==p.id&&products.find(x=>x.id===i.productId)?.category===p.category);
 const target=candidates.find(i=>i.id===(r.targetItemId||chosen||(candidates.length===1?candidates[0].id:'')));
 const targetName=products.find(p=>p.id===target?.productId)?.name;
 return <article><div className="recommendation-title">{p.preview&&<img loading="lazy" src={p.preview} alt="家具几何预览"/>}<div><small>候选 {number}</small><b>{p.name}</b><span>{r.price==null?'未定价':`¥${r.price} · 历史参考价`}</span></div></div>{r.fit&&<div className="recommendation-fit">{r.fit.mode==='replace'?'换购':'新增'}试放通过 · 保留锁定家具<small>试算后已知金额 ¥{r.fit.knownTotalAfter.toLocaleString()} · {r.fit.unpricedAfter} 件未定价</small></div>}<ul>{r.reasons.map((s,n)=><li key={n}>{s}</li>)}</ul><details><summary>待核验条件</summary>{r.limitations.map((s,n)=><p key={n}>{s}</p>)}</details>{!r.targetItemId&&candidates.length>1&&<label className="recommendation-target">选择替换目标<select aria-label={'替换目标：'+p.name} value={chosen} disabled={busy} onChange={e=>setChosen(e.target.value)}><option value="">请先选择一件已有家具</option>{candidates.map(i=><option key={i.id} value={i.id}>{products.find(p=>p.id===i.productId)?.name}（{i.x.toFixed(2)}, {i.z.toFixed(2)}）</option>)}</select></label>}<div className="recommendation-actions"><button disabled={busy} onClick={()=>onApply(r,'add')}>加入并布置</button>{candidates.length>0&&<button disabled={busy||!target} title={target?'替换'+targetName:'请先确定替换目标'} onClick={()=>target&&onApply(r,'replace',target.id)}>替换同类家具</button>}<a href={p.sourceUrl} target="_blank" rel="noreferrer">查看来源</a></div>{r.targetItemId&&!target?<small>原替换目标已锁定、移除或更换，请重新推荐。</small>:target&&<small>替换目标：{targetName}</small>}</article>;
}
