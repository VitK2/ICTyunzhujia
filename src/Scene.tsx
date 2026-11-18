import {Component,useEffect,useRef,useState} from 'react';
import Plan2D from './Plan2D';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {createRoomMaterials,worldBoxGeometry,createRenderPipeline,loadEnvironment} from './rendering';
import {APPEARANCE_KEY,DEFAULT_APPEARANCE,restoreAppearance,parseAppearance} from './appearance';
import type {Appearance} from './appearance';
import {createRetailModel} from './retail-model';
import type {Item,Plan,Product} from './engine';
import {footprint,doorPolygon,reservePolygon} from './engine';

type Props={plan:Plan;products:Product[];selected:string|null;badIds:string[];view:'3d'|'top'|'eye';grid:boolean;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,z:number)=>void;onShotReady:(fn:()=>string)=>void};
class SceneBoundary extends Component<Props,{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<Plan2D {...this.props} reason="当前浏览器无法初始化三维视图，已切换为可操作的平面布局。"/>:<SceneCanvas {...this.props}/>;}}
export default function Scene(props:Props){return <SceneBoundary {...props}/>;}
function SceneCanvas(props:Props){const host=useRef<HTMLDivElement>(null);const latest=useRef(props);latest.current=props;const api=useRef<{sync:()=>void;camera:(view:string)=>void;room:()=>void;settings:(a:Appearance)=>void}|undefined>(undefined);const [appearance,setAppearance]=useState<Appearance>(restoreAppearance),[settingsOpen,setSettingsOpen]=useState(false);const appearanceRef=useRef(appearance);appearanceRef.current=appearance;const [loading,setLoading]=useState(0);const [error,setError]=useState('');
 useEffect(()=>{const el=host.current!;let alive=true;const scene=new T.Scene();scene.background=new T.Color('#e5e7e4');const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;el.appendChild(renderer.domElement);
 const camera=new T.PerspectiveCamera(38,1,.1,100);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.475;controls.minDistance=3;controls.maxDistance=18;controls.target.set(2.8,.3,2.4);
 const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(new RoomEnvironment(),.04);scene.environment=env.texture;
 const sun=new T.DirectionalLight('#fff1d9',3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:40});sun.shadow.bias=-.00008;sun.shadow.normalBias=.012;sun.shadow.radius=2.5;
 const sky=new T.HemisphereLight('#e8efff','#b2a38f',.45);RectAreaLightUniformsLib.init();const windowLight=new T.RectAreaLight('#edf3ff',3,2.5,1.35);const ceilingLight=new T.SpotLight('#ffe1b5',0,20,Math.PI*.38,.85,2);ceilingLight.castShadow=true;ceilingLight.shadow.mapSize.set(1024,1024);ceilingLight.shadow.bias=-.0001;ceilingLight.shadow.normalBias=.012;ceilingLight.shadow.radius=3;scene.add(sun,sun.target,sky,windowLight,ceilingLight,ceilingLight.target);
 const materials=createRoomMaterials(renderer,setError),pipeline=createRenderPipeline(renderer,scene,camera,setError),disposeHDR=loadEnvironment(renderer,scene,setError);
 function settings(a:Appearance){
  pipeline.setQuality(a.quality);pipeline.setShadowStrength(a.shadow);materials.applyAppearance(a);
  const night=a.lighting==='night',warm=a.lighting==='warm';
  scene.background=new T.Color(night?'#252c36':warm?'#ded9d0':'#e5e7e4');sun.visible=!night;ceilingLight.visible=night||warm;
  renderer.toneMappingExposure=a.exposure*(night?1.12:warm?1.03:.95);
  scene.environmentIntensity=night ? .09 : warm ? .28 : .42;
  sun.color.set(warm?'#ffcf9c':'#fff1d9');sun.intensity=night?0:(warm?1.6:3)*a.sunlight;sun.shadow.intensity=a.shadow;
  windowLight.color.set(night?'#b8c9f6':warm?'#ffdab0':'#edf3ff');windowLight.intensity=night ? .35 : warm ? 2.2 : 3;
  sky.intensity=night ? .12 : warm ? .32 : .45;ceilingLight.intensity=night?65:warm?12:0;ceilingLight.shadow.intensity=a.shadow;
 }
 settings(appearanceRef.current);
 const roomGroup=new T.Group(),furniture=new T.Group(),marks=new T.Group();scene.add(roomGroup,furniture,marks);const loader=new GLTFLoader();const cache=new Map<string,T.Group>();const pending=new Set<string>();
 function box(w:number,h:number,d:number,x:number,y:number,z:number,color:string){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.85}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
 function clear(group:T.Group,dispose=true){for(const c of [...group.children]){group.remove(c);if(dispose)c.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){if(!o.geometry.userData.shared)o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(!m.userData.shared)m.dispose();});}});}}
 function line(points:T.Vector3[],color:string,closed=false){if(closed)points.push(points[0].clone());return new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color}));}
 function room(){clear(roomGroup);const r=latest.current.plan.room;
  const floorBase=box(r.width,.12,r.depth,r.width/2,-.065,r.depth/2,'#bda990');roomGroup.add(floorBase);
  const floorGeometry=new T.PlaneGeometry(r.width,r.depth);const uv=floorGeometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*r.width,uv.getY(i)*r.depth);
  const floor=new T.Mesh(floorGeometry,materials.floor);floor.rotation.x=-Math.PI/2;floor.position.set(r.width/2,0,r.depth/2);floor.receiveShadow=true;roomGroup.add(floor);
  function wall(w:number,h:number,d:number,x:number,y:number,z:number){const m=new T.Mesh(worldBoxGeometry(w,h,d),materials.wall);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
  const wh=r.height;roomGroup.add(wall(.12,wh,r.depth,-.07,wh/2,r.depth/2));
  // Back wall with a real window opening.
  const winW=Math.min(2.5,r.width*.5),start=(r.width-winW)/2,winH=Math.min(1.35,wh-1.1),topH=wh-.85-winH,midY=.85+winH/2;
  roomGroup.add(wall(start,wh,.12,start/2,wh/2,-.07),wall(start,wh,.12,r.width-start/2,wh/2,-.07),wall(winW,.85,.12,r.width/2,.425,-.07),wall(winW,topH,.12,r.width/2,wh-topH/2,-.07));
  const glass=new T.Mesh(new T.PlaneGeometry(winW,winH),new T.MeshPhysicalMaterial({color:'#eff5f6',metalness:0,roughness:.08,transmission:.88,thickness:.015,ior:1.5,side:T.DoubleSide}));glass.position.set(r.width/2,midY,-.08);roomGroup.add(glass);
  roomGroup.add(box(winW+.1,.06,.16,r.width/2,.85,0,'#e5e4dd'),box(.045,winH,.07,r.width/2,midY,0,'#fafafa'),box(winW,.045,.07,r.width/2,midY,0,'#fafafa'));
  roomGroup.add(box(.035,.08,r.depth,.01,.04,r.depth/2,'#ddd8cb'),box(r.width,.08,.035,r.width/2,.04,.01,'#ddd8cb'));
  const rugW=Math.min(2.8,r.width*.55),rugD=Math.min(2.45,r.depth*.55),rugGeometry=new T.PlaneGeometry(rugW,rugD),rugUv=rugGeometry.attributes.uv;for(let i=0;i<rugUv.count;i++)rugUv.setXY(i,rugUv.getX(i)*rugW,rugUv.getY(i)*rugD);
  const rug=new T.Mesh(rugGeometry,materials.rug);rug.rotation.x=-Math.PI/2;rug.position.set(r.width*.48,.006,r.depth*.48);rug.receiveShadow=true;roomGroup.add(rug);
  windowLight.width=winW;windowLight.height=winH;windowLight.position.set(r.width/2,midY,.02);windowLight.lookAt(r.width/2,1,r.depth/2);
  sun.position.set(r.width*.22,r.height*1.55,-r.depth*.65);sun.target.position.set(r.width*.6,0,r.depth*.58);sun.target.updateMatrixWorld();
  const shadowExtent=Math.hypot(r.width,r.depth)*.55+r.height*.4;Object.assign(sun.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});sun.shadow.camera.updateProjectionMatrix();
  ceilingLight.position.set(r.width*.57,r.height-.14,r.depth*.58);ceilingLight.target.position.set(r.width*.47,0,r.depth*.47);ceilingLight.target.updateMatrixWorld();
  const dp=doorPolygon(r);roomGroup.add(line(dp.map(([x,z])=>new T.Vector3(x,.016,z)),'#bc9a70',true));
  if(latest.current.grid){const g=new T.GridHelper(Math.max(r.width,r.depth),Math.round(Math.max(r.width,r.depth)/.25),'#aab5a9','#d9d7ce');g.position.set(r.width/2,.012,r.depth/2);roomGroup.add(g);}
  if(latest.current.plan.reserved){const poly=reservePolygon();const shape=new T.Shape(poly.map(p=>new T.Vector2(...p)));const zone=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color:'#78a58b',transparent:true,opacity:.25,side:T.DoubleSide}));zone.rotation.x=Math.PI/2;zone.position.y=.02;roomGroup.add(zone);roomGroup.add(line(poly.map(([x,z])=>new T.Vector3(x,.03,z)),'#47765a',true));}
 }
 function retail(p:Product){return createRetailModel(p,{wood:materials.floor,fabric:materials.rug});}
 function sync(){if(!alive)return;for(const o of [...furniture.children]){const item=latest.current.plan.items.find(i=>i.id===o.userData.id);if(!item||o.userData.productId!==item.productId){clear(o as T.Group);furniture.remove(o);}}
  for(const item of latest.current.plan.items){const p=latest.current.products.find(p=>p.id===item.productId);if(!p)continue;let group=furniture.children.find(o=>o.userData.id===item.id) as T.Group|undefined;
   if(!group){group=new T.Group();group.userData={id:item.id,productId:item.productId};furniture.add(group);if(p.model){const model=cache.get(p.id);if(model)group.add(model.clone(true));else if(!pending.has(p.id)){pending.add(p.id);setLoading(pending.size);loader.load(p.model,gltf=>{if(!alive){gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{for(const value of Object.values(m))if(value instanceof T.Texture)value.dispose();m.dispose();});}});return;}gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;o.geometry.userData.shared=true;const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.userData.shared=true;for(const v of Object.values(m))if(v instanceof T.Texture)v.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});}});cache.set(p.id,gltf.scene);pending.delete(p.id);setLoading(pending.size);for(const inst of [...furniture.children])if(inst.userData.productId===p.id){clear(inst as T.Group);furniture.remove(inst);}sync();},undefined,()=>{if(!alive)return;pending.delete(p.id);setLoading(pending.size);setError(`${p.name} 加载失败，请刷新重试`);});}}else group.add(retail(p));}
   group.position.set(item.x,0,item.z);group.rotation.y=item.yaw*Math.PI/180;
  }
  clear(marks);for(const item of latest.current.plan.items){const selected=item.id===latest.current.selected,bad=latest.current.badIds.includes(item.id);if(!selected&&!bad)continue;const p=latest.current.products.find(p=>p.id===item.productId)!;marks.add(line(footprint(item,p).map(([x,z])=>new T.Vector3(x,.025,z)),bad?'#d56c54':'#3b8063',true));}
 }
 function cameraView(view:string){const r=latest.current.plan.room;camera.fov=view==='eye'?60:38;camera.updateProjectionMatrix();controls.minDistance=view==='eye' ? .35 : 3;controls.maxDistance=view==='eye'?12:20;controls.target.set(r.width/2,view==='eye'?1.2:0,r.depth/2);if(view==='top'){camera.position.set(r.width/2,11,r.depth/2+.001);controls.enableRotate=false;}else if(view==='eye'){camera.position.set(r.width*.84,1.6,r.depth*.92);controls.enableRotate=true;}else{camera.position.set(r.width*1.36,6.1,r.depth*1.5);controls.enableRotate=true;}controls.update();}

 const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0);let drag:{id:string;dx:number;dz:number;startX:number;startY:number}|null=null;
 function ground(e:PointerEvent){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const point=new T.Vector3();return ray.ray.intersectPlane(plane,point);}
 function down(e:PointerEvent){if(e.button!==0)return;ground(e);const hit=ray.intersectObjects(furniture.children,true)[0];if(!hit){latest.current.onSelect(null);return;}let group=hit.object;while(group.parent!==furniture&&group.parent)group=group.parent;const id=group.userData.id as string;latest.current.onSelect(id);const item=latest.current.plan.items.find(i=>i.id===id);if(!item||item.locked)return;const pt=ground(e);if(pt){drag={id,dx:item.x-pt.x,dz:item.z-pt.z,startX:e.clientX,startY:e.clientY};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}}
 function move(e:PointerEvent){if(!drag)return;const pt=ground(e);if(pt&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>3)latest.current.onMove(drag.id,Math.round((pt.x+drag.dx)*20)/20,Math.round((pt.z+drag.dz)*20)/20);}
 function up(){drag=null;controls.enabled=true;}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
 const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();pipeline.resize(width,height);});observer.observe(el);room();sync();cameraView(latest.current.view);api.current={sync,camera:cameraView,room,settings};latest.current.onShotReady(()=>{pipeline.render();return renderer.domElement.toDataURL('image/png');});
 renderer.setAnimationLoop(()=>{controls.update();pipeline.render();});
 return()=>{alive=false;api.current=undefined;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();sun.shadow.dispose();ceilingLight.shadow.dispose();clear(roomGroup);clear(marks);clear(furniture);const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>(),texs=new Set<T.Texture>();cache.forEach(model=>model.traverse(o=>{if(o instanceof T.Mesh){geos.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{mats.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)texs.add(v);});}}));geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());texs.forEach(t=>t.dispose());materials.dispose();disposeHDR();pipeline.dispose();env.dispose();pmrem.dispose();renderer.dispose();el.removeChild(renderer.domElement);};
 },[]);
 useEffect(()=>{api.current?.settings(appearance);try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearance));}catch{}},[appearance]);
 const adjust=(patch:Partial<Appearance>)=>setAppearance(a=>parseAppearance({...a,...patch}));
 useEffect(()=>{api.current?.sync();},[props.plan.items,props.selected,props.badIds]);
 useEffect(()=>{api.current?.room();},[props.plan.room,props.grid,props.plan.reserved]);
 useEffect(()=>{api.current?.camera(props.view);},[props.view,props.plan.room.width,props.plan.room.depth]);
 return <div className="scene-host" ref={host} aria-label="三维客厅，可点击选择家具并拖动摆放"><div className="render-settings"><label>光线<select aria-label="场景光线" value={appearance.lighting} onChange={e=>adjust({lighting:e.target.value as Appearance['lighting']})}><option value="day">自然日光</option><option value="warm">暖调光线</option><option value="night">夜间室内光</option></select></label><label>画质<select aria-label="渲染画质" value={appearance.quality} onChange={e=>adjust({quality:e.target.value as Appearance['quality']})}><option value="detailed">精细 · 接触阴影</option><option value="smooth">流畅</option></select></label><button className="appearance-toggle" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(v=>!v)}>光影与材质 {settingsOpen?'−':'＋'}</button>{settingsOpen&&<div className="appearance-panel"><label>地板材质<select aria-label="地板材质" value={appearance.floorMaterial} onChange={e=>adjust({floorMaterial:e.target.value as Appearance['floorMaterial']})}><option value="oak">浅色木地板 · ambientCG</option><option value="original">原有深色木地板</option></select></label><label>地毯织物<select aria-label="地毯织物" value={appearance.rugMaterial} onChange={e=>adjust({rugMaterial:e.target.value as Appearance['rugMaterial']})}><option value="woven">灰色织物 · ambientCG</option><option value="original">原有米色织物</option></select></label><label>地板表面<select aria-label="地板表面" value={appearance.floorFinish} onChange={e=>adjust({floorFinish:e.target.value as Appearance['floorFinish']})}><option value="matte">哑光木纹</option><option value="satin">清漆木纹</option></select></label><label>墙面颜色<select aria-label="墙面颜色" value={appearance.wallTone} onChange={e=>adjust({wallTone:e.target.value as Appearance['wallTone']})}><option value="ivory">暖白</option><option value="greige">米灰</option><option value="sage">浅绿</option></select></label>{[['exposure','画面亮度',.65,1.4,.05],['sunlight','日光强度',0,1.6,.1],['shadow','阴影强度',0,1,.05]].map(([key,label,min,max,step])=><label className="appearance-range" key={key}><span>{label}<output>{appearance[key as 'exposure'|'sunlight'|'shadow'].toFixed(2)}</output></span><input aria-label={String(label)} type="range" min={min} max={max} step={step} value={appearance[key as 'exposure'|'sunlight'|'shadow']} disabled={key==='sunlight'&&appearance.lighting==='night'} onChange={e=>adjust({[String(key)]:e.target.valueAsNumber})}/></label>)}<div className="appearance-foot"><small>仅调整预览效果</small><button onClick={()=>setAppearance({...DEFAULT_APPEARANCE})}>恢复默认</button></div></div>}</div>{loading>0&&<div className="loading-model">正在加载 {loading} 件真实三维素材…</div>}{error&&<div className="scene-error">{error}</div>}</div>;
}
