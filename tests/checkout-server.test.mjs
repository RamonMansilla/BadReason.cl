import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openLocalStore} from '../functions/local-payments-store.mjs';
import {saveQuote,updateOrder,getOrder,markPaid,claimNotification} from '../functions/orders.mjs';
import {payments,sign} from '../functions/payments.mjs';
import {validateCustomer,normalizePhone,regions} from '../functions/customer.mjs';
import {orderEmail,notifyOrder} from '../functions/notify.mjs';
import {rateLimit,resetRateLimits} from '../functions/ratelimit.mjs';
import worker,{securityHeaders} from '../functions/worker.mjs';
import {sitemapUrls,sitemap} from '../scripts/generate-sitemap.mjs';

const secret='a'.repeat(64);
// Valores ficticios para pruebas; no son credenciales.
const fakeMp='fake-mp-value';
const mailEnv={RESEND_API_KEY:'fake-mail-value',MAIL_FROM:'Badreason <pedidos@badreason.cl>',MERCHANT_EMAIL:'comercio@badreason.cl'};
const customer={name:'Ana Pérez',email:'Ana@Example.cl',phone:'+56 9 1234 5678',region:'Metropolitana de Santiago',commune:'Ñuñoa',address:'Irarrázaval 1234, depto 5',notes:'Conserjería'};
const post=(path,body,headers={})=>new Request('http://localhost/api/payments/'+path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const productHtml='<div class="product-main"><h1 class="product-title">Modelo</h1><p class="price"><span class="amount">$40</span></p></div><select name="attribute_size"><option value="">Elegir</option><option value="40">EU40</option></select>';
const rate=()=>Response.json({serie:[{valor:950,fecha:new Date().toISOString()}]});
function fakeNetwork(log=[]){return async(url,options)=>{url=String(url);log.push({url,options});
 if(url.includes('mindicador'))return rate();
 if(url.includes('g5sneaker.ru/product/'))return new Response(productHtml,{status:200});
 if(url.includes('api.resend.com'))return Response.json({id:'mail'});
 return new Response('{}',{status:404});};}

test('valida y normaliza los datos de entrega',()=>{
 const c=validateCustomer(customer);
 assert.equal(c.email,'ana@example.cl');assert.equal(c.phone,'+56912345678');assert.equal(c.commune,'Ñuñoa');
 assert.equal(normalizePhone('912345678'),'+56912345678');assert.equal(normalizePhone('22 123 4567'),'+56221234567');assert.equal(normalizePhone('12345'),null);
 assert.equal(validateCustomer({...customer,address:'Camino rural s/n'}).address,'Camino rural s/n');
 assert.equal(validateCustomer({...customer,name:'Ana\u0000  Pérez'}).name,'Ana Pérez');
 for(const bad of [{name:'A'},{email:'sin-arroba'},{phone:'123'},{region:'Mendoza'},{commune:''},{address:'Calle sin datos'},{notes:'x'.repeat(301)}])
  assert.throws(()=>validateCustomer({...customer,...bad}),e=>e.status===400,JSON.stringify(bad));
 assert.throws(()=>validateCustomer(null));assert.equal(regions.length,16);
});

test('cotización exige términos y datos de entrega, y guarda el cliente con el pedido',async()=>{
 resetRateLimits();const db=openLocalStore(':memory:');const env={PAYMENTS_DB:db,PAYMENT_SECRET:secret,SHIPPING_CLP:'6000'};const original=globalThis.fetch;const log=[];
 try{
  globalThis.fetch=fakeNetwork(log);
  const items=[{id:'modelo',qty:1,options:['40']}];
  let r=await payments(post('quote',{items,customer}),env);assert.equal(r.status,400);assert.match((await r.json()).error,/términos/);
  r=await payments(post('quote',{items,customer:{...customer,phone:'1'},acceptTerms:true}),env);assert.equal(r.status,400);
  assert.equal(log.filter(c=>c.url.includes('g5sneaker')).length,0,'no consulta G5 con datos inválidos');
  r=await payments(post('quote',{items,customer,acceptTerms:true}),env);assert.equal(r.status,200);
  const {quote}=await r.json();assert.equal(quote.shipping,6000);assert.equal(quote.total,quote.subtotal+6000);assert.equal(quote.terms,'2026-11-25');
  const saved=await getOrder(db,quote.id);const stored=JSON.parse(saved.customer);assert.equal(stored.phone,'+56912345678');assert.equal(stored.address,'Irarrázaval 1234, depto 5');
  assert.ok(!JSON.stringify(quote).includes('Irarrázaval'),'los datos personales no viajan en el token');
 }finally{globalThis.fetch=original;db.close();}
});

test('límite de solicitudes en la cotización responde 429 con Retry-After',async()=>{
 resetRateLimits();const env={};
 const make=()=>post('quote',{},{'CF-Connecting-IP':'203.0.113.9'});
 const statuses=[];for(let i=0;i<10;i++)statuses.push((await payments(make(),env)).status);
 assert.ok(statuses.every(s=>s!==429));const last=await payments(make(),env);assert.equal(last.status,429);assert.equal(last.headers.get('Retry-After'),'60');
 assert.notEqual((await payments(post('quote',{},{'CF-Connecting-IP':'203.0.113.10'}),env)).status,429,'otra IP no se ve afectada');
 let calls=0;const binding={limit:async({key})=>{calls++;assert.match(key,/^quote:/);return {success:false};}};
 assert.equal((await rateLimit(make(),{QUOTE_LIMITER:binding},'quote')).status,429);assert.equal(calls,1);
 resetRateLimits();
});

test('pago aprobado notifica una sola vez al comprador y al comercio',async()=>{
 const db=openLocalStore(':memory:');const env={PAYMENTS_DB:db,PAYMENT_SECRET:secret,MP_ACCESS_TOKEN:fakeMp,SHIPPING_CLP:'0',...mailEnv};
 await saveQuote(db,{id:'quote-1',total:40000,shipping:0,items:[{name:'Par <b>',options:['40'],qty:1,price:40000}]},validateCustomer(customer));
 await updateOrder(db,'quote-1',{provider:'mercadopago',provider_id:'pref-1'});
 const token=await sign({id:'quote-1',provider:'mercadopago',providerId:'pref-1',total:40000,expires:Date.now()+10000},secret);
 const original=globalThis.fetch;const mails=[];const waits=[];const ctx={waitUntil:p=>waits.push(p)};
 try{
  globalThis.fetch=async(url,options)=>{if(String(url).includes('resend')){mails.push(JSON.parse(options.body));return Response.json({id:'m'});}return Response.json({id:123,status:'approved',external_reference:'quote-1',currency_id:'CLP',transaction_amount:40000,live_mode:false});};
  for(let i=0;i<2;i++){const r=await payments(post('confirm',{token,paymentId:'123'}),env,ctx);const body=await r.json();assert.equal(body.status,'paid');assert.equal(body.email,true);await Promise.all(waits);}
  assert.equal(mails.length,2);assert.deepEqual(mails.map(m=>m.to[0]).sort(),['ana@example.cl','comercio@badreason.cl']);
  const merchant=mails.find(m=>m.to[0]==='comercio@badreason.cl');assert.match(merchant.html,/Irarrázaval 1234/);assert.match(merchant.html,/\+56912345678/);assert.ok(merchant.html.includes('Par &lt;b&gt;'),'escapa HTML del pedido');assert.equal(merchant.reply_to,'ana@example.cl');
  const order=await getOrder(db,'quote-1');assert.equal(order.status,'paid');assert.equal(JSON.parse(order.last_event).status,'approved');
 }finally{globalThis.fetch=original;db.close();}
});

test('sin configuración de correo el pago sigue y un envío fallido libera el aviso',async()=>{
 const db=openLocalStore(':memory:');await saveQuote(db,{id:'o1',total:1},validateCustomer(customer));
 assert.equal(await notifyOrder({PAYMENTS_DB:db},'o1','paid'),false);
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('{}',{status:500});
  assert.equal(await notifyOrder({PAYMENTS_DB:db,...mailEnv},'o1','paid'),false);
  assert.equal(await claimNotification(db,'o1','paid'),true,'el aviso quedó libre para reintentar');
 }finally{globalThis.fetch=original;db.close();}
 const email=orderEmail('transfer',{id:'abc',quote:JSON.stringify({total:1000,items:[]}),customer:JSON.stringify({email:'x@y.cl'})},{TRANSFER_DETAILS:'Banco <x>',MERCHANT_EMAIL:'m@b.cl'},'buyer');
 assert.equal(email.to,'x@y.cl');assert.match(email.html,/Banco &lt;x&gt;/);
});

test('pago rechazado queda registrado como fallido y no sobrescribe un pago acreditado',async()=>{
 const db=openLocalStore(':memory:');const env={PAYMENTS_DB:db,PAYMENT_SECRET:secret,MP_ACCESS_TOKEN:fakeMp,SHIPPING_CLP:'0'};
 await saveQuote(db,{id:'q',total:1000});await updateOrder(db,'q',{provider:'mercadopago',provider_id:'pref'});
 const token=await sign({id:'q',provider:'mercadopago',providerId:'pref',total:1000,expires:Date.now()+10000},secret);
 const original=globalThis.fetch;let status='rejected';
 try{globalThis.fetch=async()=>Response.json({id:5,status,status_detail:'cc_rejected_insufficient_amount',external_reference:'q',currency_id:'CLP',transaction_amount:1000,live_mode:false});
  assert.equal((await (await payments(post('confirm',{token,paymentId:'5'}),env)).json()).status,'failed');
  const order=await getOrder(db,'q');assert.equal(order.status,'payment_failed');assert.equal(JSON.parse(order.last_event).detail,'cc_rejected_insufficient_amount');
  status='approved';assert.equal((await (await payments(post('confirm',{token,paymentId:'5'}),env)).json()).status,'paid');
  status='rejected';await payments(post('confirm',{token,paymentId:'5'}),env);assert.equal((await getOrder(db,'q')).status,'paid');
  // Los reembolsos llegan por webhook firmado.
  status='refunded';const ts=String(Math.floor(Date.now()/1000));const manifest=`id:5;request-id:r1;ts:${ts};`;
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(manifest))).toString('hex');
  const hook=await payments(new Request('http://localhost/api/payments/webhooks/mercadopago?data.id=5',{method:'POST',headers:{'Content-Type':'application/json','x-signature':`ts=${ts},v1=${sig}`,'x-request-id':'r1'},body:JSON.stringify({type:'payment',data:{id:'5'}})}),{...env,MP_WEBHOOK_SECRET:secret});
  assert.equal((await hook.json()).status,'refunded');assert.equal((await getOrder(db,'q')).status,'refunded');
 }finally{globalThis.fetch=original;db.close();}
});

test('markPaid solo informa la primera transición',async()=>{const db=openLocalStore(':memory:');await saveQuote(db,{id:'x',total:1});await updateOrder(db,'x',{provider_id:'p'});assert.equal(await markPaid(db,'x','p','r1'),true);assert.equal(await markPaid(db,'x','p','r2'),false);assert.equal((await getOrder(db,'x')).receipt,'r1');db.close();});

test('almacén local agrega columnas nuevas a archivos antiguos y la migración D1 coincide',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const folder=mkdtempSync(join(tmpdir(),'badreason-migrate-'));const path=join(folder,'old.sqlite');
 try{const old=new DatabaseSync(path);old.exec(fs.readFileSync('migrations/0001_payments.sql','utf8'));old.close();
  const store=openLocalStore(path);await saveQuote(store,{id:'n',total:1},{name:'A'});assert.equal(JSON.parse((await getOrder(store,'n')).customer).name,'A');store.close();
  const migrated=new DatabaseSync(':memory:');migrated.exec(fs.readFileSync('migrations/0001_payments.sql','utf8'));migrated.exec(fs.readFileSync('migrations/0002_customer_events.sql','utf8'));
  assert.deepEqual(migrated.prepare('PRAGMA table_info(payment_orders)').all().map(c=>c.name).slice(-3),['customer','last_event','notified']);migrated.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('una base D1 solo con la migración 0001 recibe las columnas nuevas al primer uso',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const raw=new DatabaseSync(':memory:');raw.exec(fs.readFileSync('migrations/0001_payments.sql','utf8'));
 // Envoltorio con la misma forma que D1, sin la migración automática del almacén local.
 const d1={prepare(sql){return {bind(...v){const st=raw.prepare(sql);return {first:async()=>st.get(...v)||null,run:async()=>st.run(...v),all:async()=>({results:st.all(...v)})};},all:async()=>({results:raw.prepare(sql).all()}),run:async()=>raw.prepare(sql).run()};}};
 resetRateLimits();const original=globalThis.fetch;
 try{globalThis.fetch=fakeNetwork();
  const r=await payments(post('quote',{items:[{id:'modelo',qty:1,options:['40']}],customer,acceptTerms:true}),{PAYMENTS_DB:d1,PAYMENT_SECRET:secret,SHIPPING_CLP:'6000'});
  assert.equal(r.status,200);const {quote}=await r.json();
  assert.equal(JSON.parse(raw.prepare('SELECT customer FROM payment_orders WHERE id=?').get(quote.id).customer).commune,'Ñuñoa');
 }finally{globalThis.fetch=original;raw.close();resetRateLimits();}
});

test('Worker agrega cabeceras de seguridad y limita la API',async()=>{
 resetRateLimits();const env={ASSETS:{fetch:async()=>new Response('ok')}};
 const r=await worker.fetch(new Request('http://localhost/api/nada'),env,{});assert.equal(r.status,404);
 for(const [name,value] of Object.entries(securityHeaders))assert.equal(r.headers.get(name),value,name);
 const config=await worker.fetch(new Request('http://localhost/api/payments/config'),env,{});assert.equal(config.headers.get('X-Frame-Options'),'DENY');
 let last;for(let i=0;i<241;i++)last=await worker.fetch(new Request('http://localhost/api/nada',{headers:{'CF-Connecting-IP':'198.51.100.1'}}),env,{});assert.equal(last.status,429);
 resetRateLimits();
});

test('Worker entrega la última copia guardada cuando G5 falla',async()=>{
 resetRateLimits();const store=new Map();globalThis.caches={default:{put:async(k,v)=>store.set(k.url,await v.text()),match:async k=>store.has(k.url)?new Response(store.get(k.url)):undefined}};
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('mindicador')?rate():new Response(productHtml);
  const ok=await (await worker.fetch(new Request('http://localhost/api/product/modelo'),{},{})).json();assert.equal(ok.name,'Modelo');assert.equal(ok.stale,undefined);
  globalThis.fetch=async()=>new Response('caído',{status:503});
  const r=await worker.fetch(new Request('http://localhost/api/product/modelo'),{},{});assert.equal(r.status,200);const stale=await r.json();assert.equal(stale.stale,true);assert.equal(stale.name,'Modelo');
  assert.equal((await worker.fetch(new Request('http://localhost/api/product/otro'),{},{})).status,502,'sin copia previa sigue informando el error');
 }finally{globalThis.fetch=original;delete globalThis.caches;resetRateLimits();}
});

test('archivos estáticos de seguridad, imágenes y SEO',()=>{
 const headers=fs.readFileSync('public/_headers','utf8');
 for(const h of ['Content-Security-Policy','Strict-Transport-Security','X-Frame-Options: DENY','X-Content-Type-Options: nosniff','Referrer-Policy'])assert.ok(headers.includes(h),h);
 assert.match(headers,/frame-ancestors 'none'/);assert.match(headers,/img-src[^;]*https:\/\/www\.g5sneaker\.ru/);assert.doesNotMatch(headers,/script-src[^;]*unsafe/);
 const robots=fs.readFileSync('public/robots.txt','utf8');assert.match(robots,/Disallow: \/api\//);assert.match(robots,/Sitemap: https:\/\/badreason\.cl\/sitemap\.xml/);
 const xml=sitemap();assert.ok(xml.startsWith('<?xml'));assert.ok(sitemapUrls().length>300);assert.match(xml,/\/terminos<\/loc>/);assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml),'XML escapado');
 const slides=JSON.parse(fs.readFileSync('public/data/hero-slides.json'));for(const s of slides){assert.match(s.image,/\.webp$/);assert.ok(fs.statSync('public'+s.image).size<200000,s.image);}
 const legal=JSON.parse(fs.readFileSync('public/data/legal.json'));for(const slug of ['terminos','devoluciones','envios','privacidad'])assert.ok(legal.pages[slug].sections.length>=4,slug);
});
