import type {Plan} from './engine';
import type {Recommendation} from '../server/recommend';
import type {assessNeeds,reviewLayout} from '../server/advisor';
import {serializeHistory} from './agent-context';
export type {Recommendation};
export type AgentStatus={mode:'demo'|'cloud';configured:boolean;provider:string;model:string;notice:string;verified?:boolean};
export type ToolTrace={tool:string;ok:boolean;summary:string};
export type CustomerAssessment=ReturnType<typeof assessNeeds>;
export type LayoutReview=ReturnType<typeof reviewLayout>;
export type ChatMessage={role:'user'|'assistant';text:string;trace?:ToolTrace[];recommendations?:Recommendation[];assessment?:CustomerAssessment;layoutReview?:LayoutReview};
export type AgentResult={plan:Plan;changed:boolean;accepted:boolean;reply:string;mode:'demo'|'cloud';trace:ToolTrace[];recommendations?:Recommendation[];assessment?:CustomerAssessment;layoutReview?:LayoutReview};
export type ModelSettingsView={mode:'demo'|'cloud';provider:string;endpoint:string;model:string;hasKey:boolean;verified:boolean;checkedAt:string|null;latencyMs:number|null};
async function readResponse(response:Response){if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Agent后端未启动或仍是旧版本，请重新运行启动脚本并使用其显示的地址。');const data=await response.json();if(!response.ok)throw Error(data.error||'Agent请求失败');return data;}
export async function getAgentStatus():Promise<AgentStatus>{return readResponse(await fetch('/api/agent/status',{signal:AbortSignal.timeout(6000)}));}
export async function askAgent(message:string,plan:Plan,history:ChatMessage[]):Promise<AgentResult>{return readResponse(await fetch('/api/agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(105000),body:JSON.stringify({message,plan,history:serializeHistory(history)})}));}
export async function applyRecommendation(plan:Plan,action:'add'|'replace',productId:string,itemId?:string):Promise<AgentResult>{return readResponse(await fetch('/api/agent/apply',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({message:'应用推荐家具',history:[],plan,action,productId,itemId})}));}
export async function getModelSettings():Promise<ModelSettingsView>{return readResponse(await fetch('/api/agent/config',{signal:AbortSignal.timeout(6000)}));}
export async function saveModelSettings(settings:{mode:'demo'|'cloud';model:string;apiKey?:string}):Promise<ModelSettingsView>{return readResponse(await fetch('/api/agent/config',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(6000),body:JSON.stringify(settings)}));}
export async function testModelConnection():Promise<ModelSettingsView>{return readResponse(await fetch('/api/agent/test',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:'{}'}));}
