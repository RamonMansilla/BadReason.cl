import test from 'node:test';
import assert from 'node:assert/strict';
import {openLocalStore} from '../functions/local-payments-store.mjs';
import {saveQuote,updateOrder,getOrder} from '../functions/orders.mjs';
import {payments,sign} from '../functions/payments.mjs';

const secret='a'.repeat(64);
// Valor ficticio para pruebas; no es una credencial.
const fake='fake-value';
const post=(path,body)=>new Request('http://localhost/api/payments/'+path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body)});

test('en modo real Mercado Pago exige HTTPS y un fallo del proveedor no deja el pedido en creating',async()=>{
 const db=openLocalStore(':memory:');
 const env={PAYMENTS_DB:db,PAYMENT_SECRET:secret,MP_ACCESS_TOKEN:fake,SHIPPING_CLP:'0'};
 await saveQuote(db,{id:'c',items:[],total:1000,shipping:0});
 const token=await sign({id:'c',items:[],total:1000,shipping:0,expires:Date.now()+10000},secret);
 const original=globalThis.fetch;
 try{
  const live=await payments(post('create',{token,provider:'mercadopago'}),{...env,PAYMENT_MODE:'live'});
  assert.equal(live.status,503);
  assert.equal((await getOrder(db,'c')).status,'quoted');
  globalThis.fetch=async()=>new Response('{}',{status:500});
  const failed=await payments(post('create',{token,provider:'mercadopago'}),env);
  assert.equal(failed.status,502);
  assert.equal((await getOrder(db,'c')).status,'quoted');
 }finally{globalThis.fetch=original;db.close();}
});

test('un pago aprobado se registra aunque el pedido haya quedado sin provider_id',async()=>{
 const db=openLocalStore(':memory:');
 const env={PAYMENTS_DB:db,PAYMENT_SECRET:secret,MP_ACCESS_TOKEN:fake,MP_WEBHOOK_SECRET:secret,SHIPPING_CLP:'0'};
 await saveQuote(db,{id:'r',total:1000});
 await updateOrder(db,'r',{provider:'mercadopago',status:'creating'});
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({id:7,status:'approved',external_reference:'r',currency_id:'CLP',transaction_amount:1000,live_mode:false});
  const ts=String(Math.floor(Date.now()/1000));
  const manifest=`id:7;request-id:r2;ts:${ts};`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(manifest))).toString('hex');
  const hook=await payments(new Request('http://localhost/api/payments/webhooks/mercadopago?data.id=7',{method:'POST',headers:{'Content-Type':'application/json','x-signature':`ts=${ts},v1=${sig}`,'x-request-id':'r2'},body:JSON.stringify({type:'payment',data:{id:'7'}})}),env);
  assert.equal((await hook.json()).status,'paid');
  const order=await getOrder(db,'r');
  assert.equal(order.status,'paid');
  assert.equal(order.receipt,'7');
 }finally{globalThis.fetch=original;db.close();}
});
