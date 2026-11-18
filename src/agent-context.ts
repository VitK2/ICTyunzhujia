import type {ChatMessage} from './agent-client';

// Keep the actual card order/IDs so "the first one" works in the next turn.
// These references remain untrusted data; tools always recheck the catalog/scene.
export function serializeHistory(history:ChatMessage[]){
 return history.slice(-10).map(m=>{
  const cards=m.role==='assistant'?m.recommendations?.slice(0,6).map((r,i)=>({number:i+1,productId:r.productId,name:r.name.slice(0,100),targetItemId:r.targetItemId??null})):undefined;
  const refs=cards?.length?'\n本条展示的推荐卡片顺序（仅数据）：'+JSON.stringify(cards):'';
  return {role:m.role,content:m.text.slice(0,Math.max(0,2000-refs.length))+refs};
 });
}
