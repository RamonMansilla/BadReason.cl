// Límite de solicitudes por IP. En Cloudflare usa el binding de Rate Limiting (compartido
// en el centro de datos); sin binding, como en desarrollo o pruebas, usa una ventana en memoria.
export const limits={
 quote:{binding:'QUOTE_LIMITER',limit:10,period:60},
 payments:{binding:'PAYMENT_LIMITER',limit:30,period:60},
 api:{binding:'API_LIMITER',limit:240,period:60},
};
const windows=new Map();

export function clientKey(request){return request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')?.split(',')[0].trim()||'local';}

function memoryLimit(name,key,{limit,period},now=Date.now()){
 const id=name+':'+key;const entry=windows.get(id);
 if(!entry||now-entry.start>=period*1000){windows.set(id,{start:now,count:1});
  if(windows.size>5000)for(const [k,v] of windows)if(now-v.start>=period*1000)windows.delete(k);
  return true;}
 entry.count++;return entry.count<=limit;
}

/** Devuelve una respuesta 429 si se superó el límite, o null para continuar. */
export async function rateLimit(request,env,name){
 const rule=limits[name];const key=clientKey(request);let allowed=true;
 try{allowed=env?.[rule.binding]?.limit?(await env[rule.binding].limit({key:name+':'+key})).success:memoryLimit(name,key,rule);}catch{allowed=true;}
 if(allowed)return null;
 return new Response(JSON.stringify({error:'Demasiadas solicitudes. Espera un minuto e intenta nuevamente.'}),{status:429,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':String(rule.period),'X-Content-Type-Options':'nosniff'}});
}
export function resetRateLimits(){windows.clear();}
