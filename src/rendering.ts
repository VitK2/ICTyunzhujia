import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {WALL_COLORS,DEFAULT_APPEARANCE} from './appearance.ts';
import type {Appearance,RenderQuality} from './appearance.ts';
export type {RenderQuality,Lighting} from './appearance.ts';

export function createRoomMaterials(renderer:T.WebGLRenderer,onError:(message:string)=>void){
 let alive=true;let current={...DEFAULT_APPEARANCE};const textures=new Set<T.Texture>();const materials=new Set<T.Material>();const loader=new T.TextureLoader();
 function pbr(asset:string,tile:number,color:string,normalStrength:number,roughness=1,colorMap=true){
  const m=new T.MeshPhysicalMaterial({color,roughness,metalness:0,normalScale:new T.Vector2(normalStrength,normalStrength)});m.userData.shared=true;materials.add(m);
  for(const [key,name] of [['map','color'],['normalMap','normal'],['roughnessMap','roughness']] as const){
   if(key==='map'&&!colorMap)continue;
   const texture=loader.load(`/render/${asset}/${name}.jpg`,t=>{if(!alive)return;t.colorSpace=key==='map'?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(1/tile,1/tile);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());m[key]=t;m.needsUpdate=true;applyAppearance(current);},undefined,()=>{if(alive)onError('部分房间贴图加载失败，已保留基础材质，请刷新重试。');});textures.add(texture);
  }
  return m;
 }
 const oldFloor=pbr('wood_floor',2,'#ffffff',.4,.9),newFloor=pbr('WoodFloor051',1.8,'#ffffff',.5,.9),wall=pbr('plastered_wall',2,'#faf8f3',.22,1),oldRug=pbr('fabric_pattern_07',1.4,'#d5cbb8',.45,1,false),newRug=pbr('Fabric030',1,'#ffffff',.5,1);
 const floor=oldFloor.clone(),rug=oldRug.clone();floor.userData.shared=true;rug.userData.shared=true;materials.add(floor);materials.add(rug);
 rug.sheen=.65;rug.sheenColor.set('#e1d8c8');rug.sheenRoughness=.9;
 function applyAppearance(a:Appearance){current={...a};const f=a.floorMaterial==='oak'?newFloor:oldFloor,r=a.rugMaterial==='woven'?newRug:oldRug;for(const k of ['map','normalMap','roughnessMap'] as const){floor[k]=f[k];rug[k]=r[k];}floor.normalScale.copy(f.normalScale);rug.normalScale.copy(r.normalScale);rug.color.copy(r.color);floor.needsUpdate=true;rug.needsUpdate=true;const satin=a.floorFinish==='satin';floor.clearcoat=satin ? .24 : 0;floor.clearcoatRoughness=satin ? .3 : .8;floor.roughness=satin ? .72 : 1;wall.color.set(WALL_COLORS[a.wallTone]);}
 return {floor,wall,rug,applyAppearance,dispose(){alive=false;textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}};
}

/** Box UVs in metres keep plaster scale independent of the dimensions of each wall segment. */
export function worldBoxGeometry(w:number,h:number,d:number){
 const geometry=new T.BoxGeometry(w,h,d),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
 for(let i=0;i<p.count;i++){if(Math.abs(n.getX(i))>.5)uv.setXY(i,p.getZ(i)+d/2,p.getY(i)+h/2);else if(Math.abs(n.getY(i))>.5)uv.setXY(i,p.getX(i)+w/2,p.getZ(i)+d/2);else uv.setXY(i,p.getX(i)+w/2,p.getY(i)+h/2);}
 return geometry;
}

export function createRenderPipeline(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.PerspectiveCamera,onError:(message:string)=>void){
 if(!renderer.extensions.has('EXT_color_buffer_float')){
  onError('当前设备使用流畅渲染，已保留材质、灯光和基础阴影。');
  return {render(){renderer.render(scene,camera);},resize(w:number,h:number){w=Math.max(1,w);h=Math.max(1,h);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();},setQuality(_value:RenderQuality){},setShadowStrength(_value:number){},dispose(){}};
 }
 let quality:RenderQuality='detailed',width=1,height=1,failed=false;
 const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
 const composer=new EffectComposer(renderer,target),renderPass=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1),output=new OutputPass();
 ao.output=GTAOPass.OUTPUT.Default;ao.blendIntensity=.65;ao.updateGtaoMaterial({radius:.25,thickness:.6,distanceExponent:1,distanceFallOff:1,scale:1,samples:16,screenSpaceRadius:false});ao.updatePdMaterial({radius:4,rings:2,samples:8});
 composer.addPass(renderPass);composer.addPass(ao);composer.addPass(output);
 function resize(w:number,h:number){width=Math.max(1,w);height=Math.max(1,h);const ratio=Math.min(window.devicePixelRatio||1,quality==='detailed'?1.75:1);renderer.setPixelRatio(ratio);renderer.setSize(width,height);composer.setPixelRatio(ratio);composer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
 function render(){if(quality==='smooth'||failed){renderer.render(scene,camera);return;}try{composer.render();}catch{failed=true;onError('精细渲染不可用，已切换基础渲染；可继续布置家具。');renderer.setRenderTarget(null);scene.overrideMaterial=null;renderer.render(scene,camera);}}
 return {render,resize,setQuality(value:RenderQuality){if(quality!==value){quality=value;resize(width,height);}},setShadowStrength(value:number){ao.enabled=value>0;ao.blendIntensity=value*.95;},dispose(){ao.dispose();renderPass.dispose();output.dispose();composer.dispose();}};
}

export function loadEnvironment(renderer:T.WebGLRenderer,scene:T.Scene,onError:(message:string)=>void){
 let alive=true,env:T.WebGLRenderTarget|undefined;const pmrem=new T.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
 const texture=new HDRLoader().load('/render/lebombo/environment.hdr',hdr=>{if(!alive){hdr.dispose();return;}try{env=pmrem.fromEquirectangular(hdr);scene.environment=env.texture;}catch{onError('HDR环境光加载失败，已使用基础光照。');}finally{hdr.dispose();}},undefined,()=>{if(alive)onError('HDR环境光加载失败，已使用基础光照。');});
 return ()=>{alive=false;texture.dispose();env?.dispose();pmrem.dispose();};
}
