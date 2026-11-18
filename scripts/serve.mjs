import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,readFile} from 'node:fs/promises';
import {getBuildId} from './fingerprint.mjs';
import {buildCatalog} from '../src/catalog.ts';
import {handleApi} from '../server/api.ts';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.hdr':'application/octet-stream'};
const port=Number(process.argv[2]||process.env.PORT||5174);
const buildId=getBuildId();
const products=buildCatalog(JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8')),JSON.parse(await readFile(path.join(root,'data/retail.json'),'utf8')),JSON.parse(await readFile(path.join(root,'data/abo.json'),'utf8')));
http.createServer(async(req,res)=>{
 try{
  if(await handleApi(req,res,port,products))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({app:'yunzhujia',version:'0.2.0',agentApi:1,buildId}));return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
  const info=await stat(file);if(!info.isFile())throw Error('not a file');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404);res.end('Not found');}
}).on('error',e=>{console.error(e.message);process.exitCode=1;}).listen(port,'127.0.0.1',()=>console.log(`YunZhuJia ready: http://127.0.0.1:${port}/`));
