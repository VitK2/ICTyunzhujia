import {existsSync,readFileSync,writeFileSync,renameSync,chmodSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {CONFIG_FILE,readConfig} from './config.ts';
import type {AgentConfig} from './config.ts';
import {createCloudCall} from './agent.ts';
import type {ModelCall} from './agent.ts';
export const DEEPSEEK_ENDPOINT='https://api.deepseek.com/chat/completions';
let verified:{signature:string;checkedAt:string;latencyMs:number}|undefined;
function signature(c:AgentConfig){return createHash('sha256').update(JSON.stringify(c)).digest('hex');}
export function settingsView(c:AgentConfig=readConfig()){
 const current=verified?.signature===signature(c)?verified:undefined;
 let endpoint='';try{const u=new URL(c.endpoint);endpoint=u.origin+u.pathname;}catch{}
 return {mode:c.mode,provider:c.provider,endpoint,model:c.model||'deepseek-flash',hasKey:!!c.apiKey,verified:!!current,checkedAt:current?.checkedAt||null,latencyMs:current?.latencyMs??null};
}
export function saveDeepSeekSettings(input:unknown,file:URL|string=CONFIG_FILE){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('配置必须为对象');
 const a=input as Record<string,unknown>;
 if(Object.keys(a).some(k=>!['mode','model','apiKey'].includes(k)))throw Error('配置包含不支持的字段');
 if(!['demo','cloud'].includes(a.mode as string)||typeof a.model!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(a.model))throw Error('模式或模型名称格式不正确');
 if(a.apiKey!==undefined&&(typeof a.apiKey!=='string'||a.apiKey.length>256))throw Error('密钥格式不正确');
 const previous=readConfig(file);const key=typeof a.apiKey==='string'&&a.apiKey.trim()?a.apiKey.trim():previous.apiKey;
 if(key&&!/^[a-zA-Z0-9_-]{12,256}$/.test(key))throw Error('密钥应为12至256位英文、数字、下划线或连字符，请检查是否误填了其他内容');
 if(a.mode==='cloud'&&!key)throw Error('请填写DeepSeek API Key');
 // Blank input means keep the existing key. A key from another provider is not silently reused.
 if(a.mode==='cloud'&&!(typeof a.apiKey==='string'&&a.apiKey.trim())&&previous.apiKey&&previous.endpoint!==DEEPSEEK_ENDPOINT)throw Error('切换到DeepSeek时请填写对应的API Key');
 const path=typeof file==='string'?file:fileURLToPath(file);let text=existsSync(path)?readFileSync(path,'utf8').replace(/^\uFEFF/,''):'';
 const preserveOtherProvider=a.mode==='demo'&&previous.endpoint&&previous.endpoint!==DEEPSEEK_ENDPOINT&&!(typeof a.apiKey==='string'&&a.apiKey.trim());
 const updates:Record<string,string>=preserveOtherProvider?{AGENT_MODE:'demo'}:{AGENT_MODE:String(a.mode),AGENT_PROVIDER:'DeepSeek',AGENT_API_URL:DEEPSEEK_ENDPOINT,AGENT_MODEL:a.model,AGENT_API_KEY:key};
 for(const [name,value] of Object.entries(updates)){const pattern=new RegExp('^'+name+'=.*$','gm');const line=name+'='+JSON.stringify(value);text=pattern.test(text)?text.replace(pattern,()=>line):text.replace(/\s*$/,'')+'\n'+line+'\n';}
 const temporary=path+'.'+randomUUID()+'.tmp';
 try{writeFileSync(temporary,text,{encoding:'utf8',mode:0o600});renameSync(temporary,path);try{chmodSync(path,0o600);}catch{}}catch{if(existsSync(temporary))try{unlinkSync(temporary);}catch{}throw Error('无法保存本机模型配置，请检查项目目录写入权限');}
 verified=undefined;return settingsView(readConfig(file));
}
export async function testDeepSeekConnection(c:AgentConfig=readConfig(),options:{signal?:AbortSignal;callModel?:ModelCall}={}){
 if(c.mode!=='cloud'||!c.apiKey)throw Error('请先保存真实模型配置和API Key');
 if(c.endpoint!==DEEPSEEK_ENDPOINT)throw Error('界面连接测试仅支持DeepSeek官方接口');
 const started=Date.now();const call=options.callModel||createCloudCall(c,options.signal||AbortSignal.timeout(45000),{type:'function',function:{name:'get_scene'}});
 const message=await call([{role:'system',content:'这是工具连接测试，只调用get_scene工具，参数为空对象。'},{role:'user',content:'请读取场景。'}]);
 if(!message.tool_calls?.some(t=>t?.type==='function'&&t.function?.name==='get_scene'))throw Error('接口已响应，但未返回预期工具调用；请检查模型是否支持Function Calling');
 verified={signature:signature(c),checkedAt:new Date().toISOString(),latencyMs:Date.now()-started};
 return settingsView(c);
}
