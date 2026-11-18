import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function getBuildId(){const hash=createHash('sha256');for(const file of ['dist/index.html','dist/data/abo.json','dist/render/ambientcg-manifest.json','src/engine.ts','src/catalog.ts','src/brief.ts','src/plan-schema.ts','server/agent.ts','server/advisor.ts','server/tools.ts','server/recommend.ts','server/apply.ts','server/api.ts','server/config.ts','server/model-settings.ts','scripts/serve.mjs','scripts/fingerprint.mjs'])hash.update(file).update(readFileSync(new URL('../'+file,import.meta.url)));return hash.digest('hex').slice(0,16);}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(getBuildId());
