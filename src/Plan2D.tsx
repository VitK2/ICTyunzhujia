import {useEffect,useRef} from 'react';
import type {Item,Plan,Product} from './engine';
import {footprint,doorPolygon,reservePolygon} from './engine';
type Props={plan:Plan;products:Product[];selected:string|null;badIds:string[];onSelect:(id:string|null)=>void;onMove:(id:string,x:number,z:number)=>void;onShotReady:(fn:()=>string)=>void;reason?:string};
export default function Plan2D(props:Props){
 const svg=useRef<SVGSVGElement>(null),image=useRef(''),drag=useRef<{id:string;dx:number;dz:number}|null>(null);
 const {plan,products}=props;const r=plan.room;const points=(p:number[][])=>p.map(x=>x.join(',')).join(' ');
 const getPoint=(e:React.PointerEvent)=>{const s=svg.current!,pt=s.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(s.getScreenCTM()!.inverse());};
 useEffect(()=>{let alive=true;props.onShotReady(()=>image.current);const el=svg.current!;const text=new XMLSerializer().serializeToString(el);const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.onload=()=>{if(alive){try{const c=document.createElement('canvas');c.width=1000;c.height=800;const ctx=c.getContext('2d')!;ctx.fillStyle='#f1f1e9';ctx.fillRect(0,0,1000,800);ctx.drawImage(img,0,0,1000,800);image.current=c.toDataURL('image/png');}catch{image.current='';}}URL.revokeObjectURL(url);};img.src=url;return()=>{alive=false;URL.revokeObjectURL(url);};},[plan,props.selected,props.badIds]);
 const down=(e:React.PointerEvent,item:Item)=>{e.stopPropagation();props.onSelect(item.id);if(item.locked)return;const p=getPoint(e);drag.current={id:item.id,dx:item.x-p.x,dz:item.z-p.y};svg.current!.setPointerCapture(e.pointerId);};
 return <div className="plan2d"><div className="compat-note"><b>二维兼容视图</b><span>{props.reason||'无需WebGL，可继续选择、拖动和布置家具。'}</span></div><svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`-.6 -.8 ${r.width+1.2} ${r.depth+1.5}`} preserveAspectRatio="xMidYMid meet" onPointerDown={()=>props.onSelect(null)} onPointerMove={e=>{if(drag.current){const p=getPoint(e);props.onMove(drag.current.id,Math.round((p.x+drag.current.dx)*20)/20,Math.round((p.y+drag.current.dz)*20)/20);}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
 <rect x="-.6" y="-.8" width={r.width+1.2} height={r.depth+1.5} fill="#f1f1e9"/>
 <defs><pattern id="floor-grid" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M .25 0 L 0 0 0 .25" fill="none" stroke="#d7d7c9" strokeWidth=".008"/></pattern></defs>
 <rect width={r.width} height={r.depth} fill="#e7dfce" stroke="#6b7b66" strokeWidth=".06"/><rect width={r.width} height={r.depth} fill="url(#floor-grid)"/>
 <line x1={r.width*.25} x2={r.width*.75} y1="0" y2="0" stroke="#9fc8c8" strokeWidth=".12"/>
 <text x={r.width/2} y="-.25" textAnchor="middle" fontSize=".16" fill="#6b7b66">{r.width.toFixed(1)} m · 北窗</text>
 <polygon points={points(doorPolygon(r))} fill="#cfac6740" stroke="#b08f54" strokeWidth=".018"/>
 {plan.reserved&&<polygon points={points(reservePolygon())} fill="#89b48d55" stroke="#5d8a67" strokeWidth=".02"/>}
 {plan.items.map(i=>{const p=products.find(p=>p.id===i.productId);if(!p)return null;const bad=props.badIds.includes(i.id),selected=i.id===props.selected;return <g key={i.id} onPointerDown={e=>down(e,i)} style={{cursor:i.locked?'pointer':'grab'}}><polygon points={points(footprint(i,p))} fill={bad?'#d9967c':p.category==='sofa'?'#90a58b':p.category==='coffee_table'?'#bda58c':'#c8c8b0'} stroke={bad?'#ac533e':selected?'#235b3e':'#8d9880'} strokeWidth={selected ? .055 : .025}/><text x={i.x} y={i.z} dominantBaseline="middle" textAnchor="middle" fontSize=".115" fill="#2c4032" pointerEvents="none">{p.name.slice(0,9)}</text><text x={i.x} y={i.z+.18} textAnchor="middle" fontSize=".09" fill="#53604c" pointerEvents="none">{Math.round(p.width*100)} × {Math.round(p.depth*100)} cm{i.locked?' · 锁定':''}</text></g>;})}
 <text x={r.doorX+r.doorWidth/2} y={r.depth+.3} textAnchor="middle" fontSize=".13" fill="#89734e">入户门</text>
 </svg></div>;
}
