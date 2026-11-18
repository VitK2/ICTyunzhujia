export type RenderQuality='detailed'|'smooth';
export type Lighting='day'|'warm'|'night';
export type Appearance={quality:RenderQuality;lighting:Lighting;exposure:number;sunlight:number;shadow:number;floorFinish:'matte'|'satin';wallTone:'ivory'|'greige'|'sage';floorMaterial:'original'|'oak';rugMaterial:'original'|'woven'};
export const APPEARANCE_KEY='yunzhujia-appearance-v1';
export const DEFAULT_APPEARANCE:Appearance={quality:'detailed',lighting:'day',exposure:1,sunlight:1,shadow:.75,floorFinish:'satin',wallTone:'ivory',floorMaterial:'oak',rugMaterial:'woven'};
/** Browser preferences are untrusted; preserve valid fields and repair corrupt values. */
export function parseAppearance(input:unknown):Appearance{
 const a=input&&typeof input==='object'?input as Record<string,unknown>:{};const result={...DEFAULT_APPEARANCE};
 for(const [key,choices] of Object.entries({quality:['detailed','smooth'],lighting:['day','warm','night'],floorFinish:['matte','satin'],wallTone:['ivory','greige','sage'],floorMaterial:['original','oak'],rugMaterial:['original','woven']}))if(choices.includes(a[key] as string))(result as any)[key]=a[key];
 for(const [key,min,max] of [['exposure',.65,1.4],['sunlight',0,1.6],['shadow',0,1]] as const){const value=a[key];if(typeof value==='number'&&Number.isFinite(value))result[key]=Math.min(max,Math.max(min,value));}
 return result;
}
export function restoreAppearance():Appearance{try{return parseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY)||'null'));}catch{return {...DEFAULT_APPEARANCE};}}
export const WALL_COLORS={ivory:'#faf8f3',greige:'#c9c4ba',sage:'#b6c3ac'};
