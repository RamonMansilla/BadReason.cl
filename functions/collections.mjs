import collections from '../public/data/collections.json' with {type:'json'};
import {parseCatalog} from './catalog.mjs';
import {getExchangeRate} from './pricing.mjs';
const origin='https://www.g5sneaker.ru';
const cache=new Map();
export function selectCollection(id,kind='shoes'){
 const group=collections.find(g=>g.id===id);
 if(!group||!['shoes','clothing'].includes(kind))throw Object.assign(Error('Categoría inválida'),{status:400});
 return {group,path:kind==='shoes'?group.path:group.clothingPath,search:kind==='clothing'&&!group.clothingPath?group.clothingSearch:null};
}
export async function getCollection(id,kind='shoes',page=1){
 const {group,path,search}=selectCollection(id,kind);page=Math.max(1,Math.min(500,Math.floor(Number(page))||1));
 const key=[id,kind,page].join(':');const hit=cache.get(key);if(hit&&Date.now()-hit.at<300000)return hit.data;
 let target=search?origin+'/?'+new URLSearchParams({s:search,post_type:'product',paged:String(page)}):origin+path+(page>1?`page/${page}/`:'')+(kind==='shoes'?'?orderby=popularity':'');
 const options={headers:{'User-Agent':'BadreasonCatalog/1.0'},redirect:'error',signal:AbortSignal.timeout(20000)};
 let response;try{response=await fetch(target,options);}catch(error){if(!search)throw error;}
 if(search&&!response?.ok){target=origin+'/product-category/clothes/'+(page>1?`page/${page}/`:'');response=await fetch(target,{...options,signal:AbortSignal.timeout(20000)});}
 if(!response.ok)throw Error('G5 no está disponible.');
 const fx=await getExchangeRate();const data=parseCatalog(await response.text(),fx);
 const clothing=/cloth|jersey|shirt|short|pant|jacket|suit|hoodie|sweat|tracksuit|north face|moncler|vest|tee|polo|apparel|top|uniform/i;
 const products=data.products.filter(p=>kind==='shoes'?!/\b(bag|socks?|laces?|shoe box)\b/i.test(p.name):!search||(clothing.test(p.name)&&new RegExp(group.clothingPattern,'i').test(p.name)));
 if(kind==='shoes'&&!products.length)throw Error('No se pudo verificar calzado para esta categoría.');
 const result={...data,products,group:id,kind,source:'live',sourceUrl:target,updatedAt:new Date().toISOString()};
 cache.set(key,{at:Date.now(),data:result});return result;
}

export async function productImage(request){
 try{
  const url=new URL(new URL(request.url).searchParams.get('url'));
  if(url.protocol!=='https:'||url.hostname!=='www.g5sneaker.ru'||url.port||url.username||url.password||!url.pathname.startsWith('/wp-content/uploads/')||!/^.*\.(png|jpe?g|webp)$/i.test(url.pathname))return new Response('Imagen no permitida',{status:400});
  const r=await fetch(url.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok||!/^image\/(png|jpeg|webp)(;|$)/i.test(r.headers.get('Content-Type')||''))return new Response('Imagen no disponible',{status:502});
  if(Number(r.headers.get('Content-Length'))>5000000)return new Response('Imagen demasiado grande',{status:413});
  const reader=r.body.getReader();const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5000000){await reader.cancel();return new Response('Imagen demasiado grande',{status:413});}chunks.push(value);}
  return new Response(new Blob(chunks),{headers:{'Content-Type':r.headers.get('Content-Type'),'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Imagen no disponible',{status:502});}
}
