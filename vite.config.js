import {defineConfig,loadEnv} from 'vite';
import {payments} from './functions/payments.mjs';
import {mkdirSync} from 'node:fs';
import {openLocalStore} from './functions/local-payments-store.mjs';
export default defineConfig(({mode})=>({plugins:[{name:'g5-local-api',configureServer(server){const env=loadEnv(mode,process.cwd(),'');mkdirSync('.payments',{recursive:true});env.PAYMENTS_DB=openLocalStore('.payments/orders.sqlite');server.httpServer?.once('close',()=>env.PAYMENTS_DB.close());server.middlewares.use('/api',async(req,res)=>{
 if(req.url.startsWith('/payments/')){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16000){res.statusCode=413;res.end();return;}chunks.push(chunk);}const request=new Request('http://'+req.headers.host+'/api'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await payments(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 const {handleApi}=await import('./functions/api.mjs');const u=new URL(req.url,'http://localhost');req.path=u.pathname;req.query=Object.fromEntries(u.searchParams);res.status=n=>(res.statusCode=n,res);res.set=(k,v)=>(res.setHeader(k,v),res);res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};await handleApi(req,res);
 });}}]}));
