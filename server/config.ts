import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
export type AgentConfig={mode:'demo'|'cloud';endpoint:string;model:string;apiKey:string;provider:string};
export const CONFIG_FILE=new URL('../.env.local',import.meta.url);
export function readConfig(file:URL|string=CONFIG_FILE):AgentConfig{
 const local=existsSync(file)?parseEnv(readFileSync(file,'utf8')):{};
 const env={...process.env,...local};
 const mode=env.AGENT_MODE||'demo';if(!['demo','cloud'].includes(mode))throw Error('AGENT_MODE只能为demo或cloud');
 return {mode:mode as AgentConfig['mode'],endpoint:env.AGENT_API_URL||'',model:env.AGENT_MODEL||'',apiKey:env.AGENT_API_KEY||'',provider:env.AGENT_PROVIDER||'华为云 MaaS'};
}
export function publicStatus(config:AgentConfig){return {mode:config.mode,configured:config.mode==='cloud'&&!!config.endpoint&&!!config.model&&!!config.apiKey,provider:config.mode==='demo'?'本地工具演示':config.provider,model:config.mode==='cloud'?config.model:'',notice:config.mode==='demo'?'演示模式：固定规则选择工具，不调用大模型。':'云端模式：将向已配置的模型发送需求档案、文字需求、最近对话及房间和家具信息，不发送照片。'};}
