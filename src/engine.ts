export type Category='sofa'|'armchair'|'coffee_table'|'side_table'|'nightstand'|'cabinet'|'shelf'|'tv_stand'|'wall_shelf';
export type Product={id:string;name:string;category:Category;width:number;depth:number;height:number;model?:string;preview?:string;sourceUrl:string;kind:'asset'|'retail';price?:number;sku?:string;mount?:string;archive?:boolean;license?:string;attribution?:string;searchText?:string;attributes?:Record<string,string>};
export type Item={id:string;productId:string;x:number;z:number;yaw:number;locked:boolean;estimate:number|null};
export type Room={width:number;depth:number;height:number;doorX:number;doorWidth:number};
export type Plan={name:string;room:Room;items:Item[];budget:number;reserved:boolean;brief?:import('./brief.ts').UserBrief};
export type Point=[number,number];
export type Issue={type:'bounds'|'overlap'|'door'|'reserved';ids:string[];message:string};
export const DEFAULT_ROOM:Room={width:5.6,depth:4.8,height:2.8,doorX:4.25,doorWidth:.9};
export function footprint(item:Item,p:Product):Point[]{const a=item.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[item.x+c*x*p.width/2+s*z*p.depth/2,item.z-s*x*p.width/2+c*z*p.depth/2]);}
export function intersects(a:Point[],b:Point[],epsilon=0.001):boolean{for(const poly of [a,b]){for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],axis=[p[1]-q[1],q[0]-p[0]],len=Math.hypot(...axis);const aa=a.map(v=>(v[0]*axis[0]+v[1]*axis[1])/len),bb=b.map(v=>(v[0]*axis[0]+v[1]*axis[1])/len);if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=epsilon)return false;}}return true;}
export function doorPolygon(room:Room):Point[]{return [[room.doorX,room.depth],...Array.from({length:33},(_,i)=>{const a=i*Math.PI/64;return [room.doorX+room.doorWidth*Math.cos(a),room.depth-room.doorWidth*Math.sin(a)] as Point;})];}
export function reservePolygon():Point[]{return [[.25,1.6],[1.55,1.6],[1.55,3],[.25,3]];}
export function validate(plan:Plan,products:Product[]):Issue[]{const issues:Issue[]=[];const shapes:{item:Item;poly:Point[];name:string}[]=[];for(const item of plan.items){const p=products.find(p=>p.id===item.productId);if(!p)continue;const poly=footprint(item,p);shapes.push({item,poly,name:p.name});if(poly.some(([x,z])=>x<-.001||z<-.001||x>plan.room.width+.001||z>plan.room.depth+.001))issues.push({type:'bounds',ids:[item.id],message:`${p.name} 超出房间边界`});if(intersects(poly,doorPolygon(plan.room)))issues.push({type:'door',ids:[item.id],message:`${p.name} 占用入户门开启区域`});if(plan.reserved&&intersects(poly,reservePolygon()))issues.push({type:'reserved',ids:[item.id],message:`${p.name} 占用预留活动区`});}for(let i=0;i<shapes.length;i++)for(let j=0;j<i;j++)if(intersects(shapes[i].poly,shapes[j].poly))issues.push({type:'overlap',ids:[shapes[i].item.id,shapes[j].item.id],message:`${shapes[i].name} 与 ${shapes[j].name} 重叠`});return issues;}
export function totals(plan:Plan,products:Product[]){let total=0,unpriced=0;for(const i of plan.items){const p=products.find(p=>p.id===i.productId);const amount=p?.kind==='retail'&&!p.archive?p.price:i.estimate;if(amount==null)unpriced++;else total+=amount;}return {total,unpriced,exceeded:total>plan.budget};}
export function newItem(p:Product,x=2.8,z=2.5):Item{return {id:crypto.randomUUID(),productId:p.id,x,z,yaw:0,locked:false,estimate:null};}
export function suggest(plan:Plan,products:Product[],mode:'airy'|'social'|'reading'='airy',strategy:'balanced'|'minimal'='balanced'):Plan|null{
 const next=structuredClone(plan);next.items=plan.items.filter(i=>i.locked).map(i=>({...i}));if(validate(next,products).length)return null;
 const w=plan.room.width,d=plan.room.depth;
 const ordered=plan.items.filter(i=>!i.locked).sort((a,b)=>{const pa=products.find(p=>p.id===a.productId)!,pb=products.find(p=>p.id===b.productId)!;return Number(pb.category==='sofa')-Number(pa.category==='sofa')||pb.width*pb.depth-pa.width*pa.depth;});
 for(const original of ordered){const p=products.find(p=>p.id===original.productId)!;let preferred:[number,number,number];
  if(p.category==='sofa')preferred=[w*.48,.65,180];else if(['cabinet','tv_stand','shelf'].includes(p.category))preferred=[w*.45,d-.4,0];else if(p.category==='coffee_table')preferred=[w*.48,d*.48,90];else if(p.category==='armchair')preferred=[mode==='reading'?w-.65:w-.8,mode==='social'?d*.52:1.8,-90];else preferred=[w*.19,.8,0];
  if(mode==='social'&&p.category==='sofa')preferred=[w*.35,.7,180];
  const sofa=next.items.find(i=>products.find(p=>p.id===i.productId)?.category==='sofa');
  if(sofa&&p.category==='coffee_table'){
   const sp=products.find(p=>p.id===sofa.productId)!,angle=sofa.yaw*Math.PI/180;
   const yaw=sofa.yaw+(p.width<p.depth?90:0),forwardSize=Math.min(p.width,p.depth);
   const distance=sp.depth/2+.45+forwardSize/2;
   preferred=[sofa.x-Math.sin(angle)*distance,sofa.z-Math.cos(angle)*distance,yaw];
  }
  const candidates:[number,number,number][]=[preferred,[original.x,original.z,original.yaw]];for(const yaw of [...new Set([preferred[2],original.yaw,0,90,180,270])])for(let x=.3;x<w;x+=.3)for(let z=.3;z<d;z+=.3)candidates.push([x,z,yaw]);
  const cost=(a:[number,number,number])=>Math.hypot(a[0]-preferred[0],a[1]-preferred[1])*(strategy==='minimal'?.1:1)+Math.hypot(a[0]-original.x,a[1]-original.z)*(strategy==='minimal'?4:.04)+.15*(a[2]!==preferred[2]?1:0)+(strategy==='minimal'&&a[2]!==original.yaw?.5:0);
  candidates.sort((a,b)=>cost(a)-cost(b));
  let placed=false;for(const [x,z,yaw] of candidates){const item={...original,x:Math.round(x*100)/100,z:Math.round(z*100)/100,yaw};next.items.push(item);if(!validate(next,products).length){placed=true;break;}next.items.pop();}if(!placed)return null;
 }
 next.name={airy:'自在留白',social:'围坐会客',reading:'窗边阅读'}[mode];if(next.brief)next.brief.layoutMode=mode;return next;
}
