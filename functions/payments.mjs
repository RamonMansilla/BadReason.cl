import {parseProduct} from './catalog.mjs';
import {getExchangeRate} from './pricing.mjs';
import {saveQuote,getOrder,updateOrder,markPaid,claimProvider} from './orders.mjs';

const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const encode=value=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),x=>String.fromCharCode(x)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));
async function key(secret){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function sign(value,secret){const payload=encode(value);const sig=await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(payload));return payload+'.'+Array.from(new Uint8Array(sig),x=>x.toString(16).padStart(2,'0')).join('');}
export async function verify(token,secret){try{const [payload,sig,...extra]=String(token).split('.');if(extra.length||!/^([a-f0-9]{64})$/.test(sig))throw Error();const valid=await crypto.subtle.verify('HMAC',await key(secret),Uint8Array.from(sig.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(payload));if(!valid)throw Error();const value=decode(payload);if(value.expires<Date.now())throw Error();return value;}catch{fail('Sesión de pago inválida o vencida. Vuelve a cotizar.',401);}}
export function paymentConfig(env){const base=!!(env.PAYMENTS_DB&&env.PAYMENT_SECRET?.length>=32&&typeof env.SHIPPING_CLP==='string'&&env.SHIPPING_CLP.trim()!==''&&Number.isInteger(Number(env.SHIPPING_CLP))&&Number(env.SHIPPING_CLP)>=0);return {mode:env.PAYMENT_MODE==='live'?'live':'sandbox',mercadopago:base&&!!env.MP_ACCESS_TOKEN,paypal:base&&!!(env.PAYPAL_CLIENT_ID&&env.PAYPAL_CLIENT_SECRET),transfer:base&&!!env.TRANSFER_DETAILS,googlepay:false,applepay:false,shippingConfigured:typeof env.SHIPPING_CLP==='string'&&env.SHIPPING_CLP.trim()!==''};}
async function remote(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)fail('El proveedor no pudo completar la operación. Intenta otra vez.',502);return body;}
async function paypal(env,path,body,id){const base=env.PAYMENT_MODE==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';const auth=await remote(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+btoa(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});return remote(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json',...(id?{'PayPal-Request-Id':id}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
function paypalCapture(data,q){const capture=data.purchase_units?.[0]?.payments?.captures?.find(c=>c.status==='COMPLETED');if(data.id!==q.providerId||!capture||capture.amount?.currency_code!=='USD'||capture.amount?.value!==q.usd)fail('El pago todavía no está confirmado.',409);return capture;}
async function mercadoPayment(env,id){if(!/^\d{1,30}$/.test(String(id)))fail('Falta la referencia de Mercado Pago.');return remote('https://api.mercadopago.com/v1/payments/'+id,{headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN}});}
async function applyMercadoPayment(env,p){const order=await getOrder(env.PAYMENTS_DB,p.external_reference);if(!order||order.provider!=='mercadopago')fail('Pedido desconocido.',404);const q=JSON.parse(order.quote);if(p.currency_id!=='CLP'||Number(p.transaction_amount)!==q.total||p.live_mode!==(env.PAYMENT_MODE==='live'))fail('El pago no corresponde a esta compra.',409);if(p.status==='approved')await markPaid(env.PAYMENTS_DB,q.id,order.provider_id,p.id);return {status:p.status==='approved'?'paid':'pending',reference:q.id,receipt:String(p.id)};}
async function webhook(request,env){
 if(request.method!=='POST'||!env.PAYMENTS_DB)return reply({error:'Webhook no disponible'},503);
 const url=new URL(request.url),raw=await request.text();if(raw.length>100000)return reply({error:'Evento demasiado grande'},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'JSON inválido'},400);}
 if(url.pathname.endsWith('/mercadopago')){
  if(!env.MP_WEBHOOK_SECRET)return reply({error:'Firma no configurada'},503);
  const parts=Object.fromEntries((request.headers.get('x-signature')||'').split(',').map(v=>v.trim().split('=')));
  const id=url.searchParams.get('data.id'),requestId=request.headers.get('x-request-id');
  const ts=Number(parts.ts);const stamp=ts<1e12?ts*1000:ts;
  if(!id||!requestId||!/^\d+$/.test(parts.ts||'')||Math.abs(Date.now()-stamp)>5*60*1000||!/^([a-f0-9]{64})$/.test(parts.v1||''))return reply({error:'Firma inválida'},401);
  const manifest=`id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const valid=await crypto.subtle.verify('HMAC',await key(env.MP_WEBHOOK_SECRET),Uint8Array.from(parts.v1.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(manifest));
  if(!valid)return reply({error:'Firma inválida'},401);
  if(body.type!=='payment')return reply({received:true});
  const result=await applyMercadoPayment(env,await mercadoPayment(env,id));return reply({received:true,status:result.status});
 }
 if(url.pathname.endsWith('/paypal')){
  if(!env.PAYPAL_WEBHOOK_ID)return reply({error:'Webhook no configurado'},503);
  const cert=request.headers.get('paypal-cert-url')||'';let certUrl;try{certUrl=new URL(cert);}catch{return reply({error:'Certificado inválido'},401);}
  const expected=env.PAYMENT_MODE==='live'?'api.paypal.com':'api.sandbox.paypal.com';if(certUrl.protocol!=='https:'||certUrl.hostname!==expected)return reply({error:'Certificado inválido'},401);
  const result=await paypal(env,'/v1/notifications/verify-webhook-signature',{auth_algo:request.headers.get('paypal-auth-algo'),cert_url:cert,transmission_id:request.headers.get('paypal-transmission-id'),transmission_sig:request.headers.get('paypal-transmission-sig'),transmission_time:request.headers.get('paypal-transmission-time'),webhook_id:env.PAYPAL_WEBHOOK_ID,webhook_event:body});
  if(result.verification_status!=='SUCCESS')return reply({error:'Firma inválida'},401);
  if(body.event_type==='CHECKOUT.ORDER.APPROVED'||body.event_type==='PAYMENT.CAPTURE.COMPLETED'){
   const providerId=body.event_type==='CHECKOUT.ORDER.APPROVED'?body.resource?.id:body.resource?.supplementary_data?.related_ids?.order_id;
   const order=await env.PAYMENTS_DB.prepare('SELECT * FROM payment_orders WHERE provider=? AND provider_id=?').bind('paypal',providerId||'').first();
   if(!order)return reply({error:'Pedido desconocido'},404);
   if(order.status!=='paid'){const q={...JSON.parse(order.quote),providerId};let data=await paypal(env,'/v2/checkout/orders/'+encodeURIComponent(providerId));if(data.status==='APPROVED')data=await paypal(env,'/v2/checkout/orders/'+encodeURIComponent(providerId)+'/capture',{},q.id+'-capture');const capture=paypalCapture(data,q);await markPaid(env.PAYMENTS_DB,q.id,providerId,capture.id);}
  }
  return reply({received:true});
 }
 return reply({error:'Ruta no encontrada'},404);
}
export async function quoteItems(items,load){if(!Array.isArray(items)||!items.length||items.length>10)fail('Selecciona entre 1 y 10 productos.');const seen=new Set();return Promise.all(items.map(async item=>{if(!/^[a-z0-9-]{1,180}$/.test(item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>10||!Array.isArray(item.options))fail('Producto o cantidad inválidos.');const identity=item.id+JSON.stringify(item.options);if(seen.has(identity))fail('Producto duplicado.');seen.add(identity);const p=await load(item.id);if(!p.inStock||!Number.isSafeInteger(p.price)||p.price<=0)fail('Precio o disponibilidad sin confirmar.',409);if(item.options.length!==p.options.length||p.options.some((o,i)=>!o.values.some(v=>v.value===item.options[i])))fail('Selecciona una talla válida.',409);return {id:p.id,name:p.name,qty:item.qty,options:item.options,price:p.price,priceUsd:p.priceUsd};}));}
export async function payments(request,env){try{
 const url=new URL(request.url),path=url.pathname;const config=paymentConfig(env);
 if(path.startsWith('/api/payments/webhooks/'))return await webhook(request,env);
 if(path==='/api/payments/config'&&request.method==='GET')return reply(config);
 if(request.method!=='POST')return reply({error:'Método no permitido'},405);
 if(request.headers.get('Origin')!==url.origin)return reply({error:'Origen no permitido'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Se requiere JSON'},415);
 const raw=await request.text();if(raw.length>16000)return reply({error:'Solicitud demasiado grande'},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'JSON inválido'},400);}
 if(!env.PAYMENT_SECRET||env.PAYMENT_SECRET.length<32)fail('Falta configurar la clave privada de pagos.',503);
 if(!env.PAYMENTS_DB)fail('Falta configurar el almacenamiento de pedidos.',503);
 const origin=env.PUBLIC_ORIGIN||url.origin;if(new URL(origin).origin!==url.origin)fail('Origen de tienda incorrecto.',503);
 if(path==='/api/payments/quote'){
  if(!config.shippingConfigured||!Number.isInteger(Number(env.SHIPPING_CLP))||Number(env.SHIPPING_CLP)<0)fail('El comercio debe configurar el despacho antes de cobrar.',503);
  const fx=await getExchangeRate();if(fx.fallback)fail('No se pudo confirmar el tipo de cambio actual.',503);
  const items=await quoteItems(body.items,async id=>{const r=await fetch('https://www.g5sneaker.ru/product/'+id+'/',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)fail('Proveedor no disponible',502);return parseProduct(await r.text(),r.url,fx);});
  const shipping=Number(env.SHIPPING_CLP),total=items.reduce((s,i)=>s+i.price*i.qty,shipping);if(!Number.isSafeInteger(total)||total>10000000)fail('Total fuera de rango.');
  const quote={id:crypto.randomUUID(),items,total,shipping,usd:(total/fx.rate).toFixed(2),expires:Date.now()+30*60*1000};
  await saveQuote(env.PAYMENTS_DB,quote);
  return reply({quote,token:await sign(quote,env.PAYMENT_SECRET)});
 }
 const q=await verify(body.token,env.PAYMENT_SECRET);
 const order=await getOrder(env.PAYMENTS_DB,q.id);if(!order)fail('Pedido no encontrado.',404);
 if(path==='/api/payments/create'){
  if(!['mercadopago','paypal','transfer'].includes(body.provider)||!config[body.provider])fail('Este método aún no está habilitado.',503);
  if(order.status==='paid')fail('Este pedido ya está pagado.',409);
  if(order.provider&&order.provider!==body.provider)fail('Ya iniciaste este pedido con otro método. Vuelve a cotizar para cambiarlo.',409);
  if(!await claimProvider(env.PAYMENTS_DB,q.id,body.provider))fail('Este pedido ya se inició con otro método o ya está pagado.',409);
  if(body.provider==='transfer'){await updateOrder(env.PAYMENTS_DB,q.id,{provider:'transfer',status:'pending_manual_review'});return reply({status:'pending_manual_review',reference:q.id,details:env.TRANSFER_DETAILS,total:q.total});}
  if(order.redirect&&order.provider_id)return reply({redirect:order.redirect,token:await sign({...q,provider:order.provider,providerId:order.provider_id},env.PAYMENT_SECRET)});
  await updateOrder(env.PAYMENTS_DB,q.id,{provider:body.provider,status:'creating'});
  let result,redirect,providerId;
  if(body.provider==='mercadopago'){
   result=await remote('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN,'Content-Type':'application/json','X-Idempotency-Key':q.id},body:JSON.stringify({items:q.items.map(i=>({id:i.id,title:i.name+' / '+i.options.join(' / '),quantity:i.qty,currency_id:'CLP',unit_price:i.price})).concat(q.shipping?[{title:'Despacho',quantity:1,currency_id:'CLP',unit_price:q.shipping}]:[]),external_reference:q.id,back_urls:{success:origin+'/pago?return=mercadopago',pending:origin+'/pago?return=mercadopago',failure:origin+'/pago?return=mercadopago'},...(origin.startsWith('https:')?{auto_return:'approved',notification_url:origin+'/api/payments/webhooks/mercadopago'}:{})})});
   redirect=env.PAYMENT_MODE==='live'?result.init_point:result.sandbox_init_point;providerId=result.id;
  }else{
   result=await paypal(env,'/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{reference_id:q.id,custom_id:q.id,amount:{currency_code:'USD',value:q.usd}}],payment_source:{paypal:{experience_context:{user_action:'PAY_NOW',return_url:origin+'/pago?return=paypal',cancel_url:origin+'/pago?cancel=1'}}}},q.id);providerId=result.id;redirect=result.links?.find(l=>['payer-action','approve'].includes(l.rel))?.href;
  }
  if(!redirect||!/^https:\/\//.test(redirect))fail('El proveedor no devolvió una dirección de pago.',502);
  await updateOrder(env.PAYMENTS_DB,q.id,{provider:body.provider,provider_id:String(providerId),redirect,status:'pending'});
  return reply({redirect,token:await sign({...q,provider:body.provider,providerId},env.PAYMENT_SECRET)});
 }
 if(path==='/api/payments/confirm'){
  if(order.provider!==q.provider||order.provider_id!==String(q.providerId))fail('Sesión de proveedor incorrecta.',409);
  if(order.status==='paid')return reply({status:'paid',reference:q.id,receipt:order.receipt});
  if(q.provider==='paypal'){
   let data=await paypal(env,'/v2/checkout/orders/'+encodeURIComponent(q.providerId));if(data.status==='APPROVED')data=await paypal(env,'/v2/checkout/orders/'+encodeURIComponent(q.providerId)+'/capture',{},q.id+'-capture');const capture=paypalCapture(data,q);
   await markPaid(env.PAYMENTS_DB,q.id,q.providerId,capture.id);
   return reply({status:'paid',reference:q.id,receipt:capture.id});
  }
  if(q.provider==='mercadopago'){
   const p=await mercadoPayment(env,body.paymentId);if(p.external_reference!==q.id)fail('El pago no corresponde a esta compra.',409);return reply(await applyMercadoPayment(env,p));
  }
  fail('Método de confirmación inválido.');
 }
 return reply({error:'Ruta no encontrada'},404);
 }catch(error){return reply({error:error.status?error.message:'No fue posible conectar con el servicio de pagos.'},error.status||502);}}
