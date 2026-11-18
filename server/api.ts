import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Product} from '../src/engine.ts';
import {validPlan} from '../src/plan-schema.ts';
import {readConfig,publicStatus} from './config.ts';
import {runAgent} from './agent.ts';
import {applyRecommendation} from './apply.ts';
import {settingsView,saveDeepSeekSettings,testDeepSeekConnection} from './model-settings.ts';
let active=0;
function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function body(req:IncomingMessage):Promise<any>{return new Promise((resolve,reject)=>{const chunks:Buffer[]=[];let size=0,done=false;req.on('data',(c:Buffer)=>{size+=c.length;if(size>100000){if(!done){done=true;reject(Error('请求过大'));}return;}chunks.push(c);});req.on('end',()=>{if(done)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('请求不是有效JSON'));}});req.on('error',()=>reject(Error('请求读取失败')));});}
export async function handleApi(req:IncomingMessage,res:ServerResponse,port:number,products:Product[]):Promise<boolean>{
 const pathname=new URL(req.url||'/',`http://127.0.0.1:${port}`).pathname;
 if(!pathname.startsWith('/api/'))return false;
 const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
 if(!hosts.includes(req.headers.host||'')||req.headers.origin&&![...hosts.map(h=>'http://'+h),'http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin)){json(res,403,{error:'仅接受本机工作台请求'});return true;}
 if(pathname==='/api/agent/status'&&req.method==='GET'){
  try{json(res,200,{...publicStatus(readConfig()),verified:settingsView().verified});}catch{json(res,500,{error:'Agent配置文件格式不正确，请检查.env.local'});}return true;
 }
 if(pathname==='/api/agent/config'&&req.method==='GET'){try{json(res,200,settingsView());}catch{json(res,500,{error:'无法读取本机模型配置'});}return true;}
 if(!['/api/agent/chat','/api/agent/apply','/api/agent/config','/api/agent/test'].includes(pathname)||req.method!=='POST'){json(res,404,{error:'接口不存在或请求方法错误'});return true;}
 if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'需要application/json请求'});return true;}
 if(active>=2){json(res,429,{error:'Agent正在处理其他需求，请稍后重试'});return true;}
 active++;
 try{
  let input;try{input=await body(req);}catch(e){json(res,e instanceof Error&&e.message==='请求过大'?413:400,{error:e instanceof Error?e.message:'请求读取失败'});return true;}
  if(pathname==='/api/agent/config'){try{json(res,200,saveDeepSeekSettings(input));}catch(e){json(res,400,{error:e instanceof Error?e.message:'配置保存失败'});}return true;}
  if(pathname==='/api/agent/test'){try{const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});const result=await testDeepSeekConnection(readConfig(),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});if(!res.destroyed)json(res,200,result);}catch(e){if(!res.destroyed)json(res,502,{error:e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'连接测试超时，请稍后重试':e instanceof Error?e.message:'连接测试失败'});}return true;}
  if(!input||typeof input.message!=='string'||!input.message.trim()||input.message.length>2000||!validPlan(input.plan,products)||!Array.isArray(input.history)||input.history.length>10||!input.history.every((m:any)=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=2000)){json(res,400,{error:'需求、对话记录或房间方案格式不正确；需求最多2000字、家具最多30件。'});return true;}
  const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  if(pathname==='/api/agent/apply'){if(!['add','replace'].includes(input.action)||typeof input.productId!=='string'||input.productId.length>100||(input.itemId!=null&&(typeof input.itemId!=='string'||input.itemId.length>100))){json(res,400,{error:'推荐应用参数不正确'});return true;}const result=applyRecommendation(input.plan,products,input.action,input.productId,input.itemId);json(res,200,{...result,mode:readConfig().mode});return true;}
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);
  const result=await runAgent(input,products,readConfig(),{signal});
  if(!res.destroyed)json(res,200,result);
 }catch(e){if(!res.destroyed)json(res,500,{error:e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'Agent请求超时或已取消，本次未应用修改。':e instanceof Error?e.message:'Agent执行失败，本次未应用修改。'});}
 finally{active--;}
 return true;
}
