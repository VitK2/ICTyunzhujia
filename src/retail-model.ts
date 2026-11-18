import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {Product} from './engine.ts';

/** A generic rounded dimension proxy, never an exact model of the retail SKU. */
export function createRetailModel(p:Product,surfaces:{wood:T.MeshPhysicalMaterial;fabric:T.MeshPhysicalMaterial}){
 const group=new T.Group(),w=p.width,d=p.depth,h=p.height;
 const fabric=surfaces.fabric.clone();fabric.color.set(p.name.includes('黑')?'#363a3b':'#c6bbaa');fabric.userData.shared=false;
 const wood=surfaces.wood.clone();wood.color.set(p.name.includes('黑')?'#38302b':'#baa27b');wood.userData.shared=false;
 const leg=new T.MeshStandardMaterial({color:'#514638',roughness:.65,metalness:0});
 const used=new Set<T.Material>();
 function block(width:number,height:number,depth:number,x:number,y:number,z:number,mat:T.Material,radius=.025){const m=new T.Mesh(new RoundedBoxGeometry(width,height,depth,3,Math.min(radius,width/5,height/5,depth/5)),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;used.add(mat);group.add(m);}
 function foot(x:number,z:number,height:number,mat:T.Material){const m=new T.Mesh(new T.CylinderGeometry(.024,.019,height,12),mat);m.position.set(x,height/2,z);m.castShadow=m.receiveShadow=true;used.add(mat);group.add(m);}
 if(['sofa','armchair'].includes(p.category)){
  const footH=Math.min(.13,h*.15),baseH=h*.23,baseY=footH+baseH/2,armW=Math.min(.11,w*.1),backD=Math.min(.13,d*.2),seatH=h*.15;
  block(w,baseH,d,0,baseY,0,fabric,.04);
  const backH=h-footH-baseH;block(w,backH,backD,0,footH+baseH+backH/2,-d/2+backD/2,fabric,.05);
  const armH=h*.45;for(const x of [-w/2+armW/2,w/2-armW/2])block(armW,armH,d-backD,x,footH+baseH+armH/2,backD/2,fabric,.04);
  const count=w>1.3?2:1,seatW=(w-2*armW-.025)/count,seatD=d-backD-.035;
  for(let i=0;i<count;i++)block(seatW-.012,seatH,seatD,-(w-2*armW-.025)/2+seatW*(i+.5),footH+baseH+seatH/2,backD/2,fabric,.045);
  for(const x of [-w/2+.09,w/2-.09])for(const z of [-d/2+.09,d/2-.09])foot(x,z,footH,leg);
 }else{
  const topH=Math.min(.045,h*.12);block(w,topH,d,0,h-topH/2,0,wood,.014);
  for(const x of [-w/2+.04,w/2-.04])for(const z of [-d/2+.04,d/2-.04])block(.055,h-topH,.055,x,(h-topH)/2,z,wood,.008);
  if(p.category==='tv_stand')block(w-.07,.028,d-.02,0,.11,0,wood,.008);
 }
 // Unused clones never enter the scene, so release them here.
 for(const m of [fabric,wood,leg])if(!used.has(m))m.dispose();
 return group;
}
