import {getExchangeRate} from './pricing.mjs';
import {getBestsellers} from './bestsellers.mjs';
import {getCollection,productImage} from './collections.mjs';
import {parseCatalog,parseProduct} from './catalog.mjs';
const origin='https://www.g5sneaker.ru';
export async function handleApi(req,res){
 try{const path=req.path.replace(/^\/api/,'');let target;let product=false;
 if(path==='/product-image'){if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});const response=await productImage(new Request('http://localhost/api/product-image?'+new URLSearchParams(req.query)));res.status(response.status);for(const [key,value] of response.headers)res.set(key,value);return res.end(Buffer.from(await response.arrayBuffer()));}
 if(path==='/collection'){if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});return res.set('Cache-Control','public, max-age=120').json(await getCollection(req.query.group,req.query.kind,req.query.page));}
 if(path==='/bestsellers'){if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});return res.set('Cache-Control','public, max-age=120, s-maxage=300').json(await getBestsellers());}
 if(path==='/catalog'){const category=String(req.query.category||'/product-category/air-jordan/');if(!/^\/product-category\/(?:[a-z0-9-]+\/)+$/.test(category))return res.status(400).json({error:'Categoría inválida'});const page=Math.max(1,Math.min(500,Math.floor(Number(req.query.page)||1)));target=origin+category+(page>1?`page/${page}/`:'');}
 else if(path==='/search'){const q=String(req.query.q||'').trim();if(!q||q.length>100)return res.status(400).json({error:'Búsqueda inválida'});const page=Math.max(1,Math.min(500,Math.floor(Number(req.query.page)||1)));target=origin+'/?'+new URLSearchParams({s:q,post_type:'product',paged:String(page)});}
 else if(path.startsWith('/product/')){const id=path.slice(9);if(!/^[a-z0-9-]+$/.test(id))return res.status(400).json({error:'Producto inválido'});target=origin+'/product/'+id+'/';product=true;}
 else return res.status(404).json({error:'Ruta no encontrada'});
 const upstream=await fetch(target,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'BadreasonCatalog/1.0'},redirect:'error'});if(!upstream.ok)throw new Error('Proveedor no disponible');const html=await upstream.text();const fx=await getExchangeRate();const data=product?parseProduct(html,target,fx):parseCatalog(html,fx);if(path==='/catalog'&&!data.products.length)throw new Error('Catálogo no disponible');res.set('Cache-Control','public, max-age=120, s-maxage=300').json({...data,exchangeRate:fx,source:'live',updatedAt:new Date().toISOString()});
 }catch{res.status(502).json({error:'No se pudo consultar G5. Intenta nuevamente.'});}
}
