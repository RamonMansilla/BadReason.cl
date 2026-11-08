import {parseCatalog} from './catalog.mjs';
import {getExchangeRate} from './pricing.mjs';

export const bestsellersUrl='https://www.g5sneaker.ru/shop/?g5sn_catalog=best&orderby=popularity';
let cached;
let pending;
export async function getBestsellers(){
 if(cached&&Date.now()-cached.at<5*60*1000)return cached.data;
 if(pending)return pending;
 pending=(async()=>{
  const response=await fetch(bestsellersUrl,{headers:{'User-Agent':'BadreasonCatalog/1.0'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('No se pudieron consultar los más vendidos de G5.');
  const exchangeRate=await getExchangeRate();
  const catalog=parseCatalog(await response.text(),exchangeRate);
  const products=[...new Map(catalog.products.map(p=>[p.id,p])).values()].slice(0,8);
  if(!products.length)throw Error('La colección de más vendidos de G5 no está disponible.');
  const data={products,exchangeRate,source:'live',sourceUrl:bestsellersUrl,sort:'popularity',updatedAt:new Date().toISOString()};
  cached={at:Date.now(),data};return data;
 })();
 try{return await pending;}finally{pending=null;}
}
