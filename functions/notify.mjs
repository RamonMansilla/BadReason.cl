// Avisos por correo del pedido, al comprador y al comercio, mediante la API de Resend.
// Si faltan RESEND_API_KEY o MAIL_FROM no se envía nada y el pago sigue su curso normal.
import {claimNotification,releaseNotification} from './orders.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clp=value=>'$'+Math.round(Number(value)||0).toLocaleString('es-CL')+' CLP';
const parse=value=>{try{return value?JSON.parse(value):null;}catch{return null;}};

export function mailConfigured(env){return !!(env.RESEND_API_KEY&&env.MAIL_FROM);}

export function orderEmail(kind,order,env,audience){
 const q=parse(order.quote)||{},c=parse(order.customer)||{};
 const reference=String(order.id).slice(0,8).toUpperCase();
 const lines=(q.items||[]).map(i=>`<tr><td style="padding:6px 0">${esc(i.name)}<br><small>${esc((i.options||[]).join(' / '))} · ${Number(i.qty)} u.</small></td><td style="padding:6px 0;text-align:right">${clp(i.price*i.qty)}</td></tr>`).join('');
 const totals=`<tr><td style="padding:6px 0">Despacho</td><td style="text-align:right">${q.shipping?clp(q.shipping):'Gratis'}</td></tr><tr><td style="padding:6px 0"><b>Total</b></td><td style="text-align:right"><b>${clp(q.total)}</b></td></tr>`;
 const delivery=`<p><b>Entrega</b><br>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.address)}, ${esc(c.commune)}, ${esc(c.region)}${c.notes?`<br>Indicaciones: ${esc(c.notes)}`:''}</p>`;
 const merchant=audience==='merchant';
 const paid=kind==='paid';
 const subject=merchant
  ?`${paid?'Nuevo pedido pagado':'Transferencia por revisar'} ${reference} · ${clp(q.total)}`
  :paid?`Recibimos tu pago · pedido ${reference}`:`Tu pedido ${reference} espera la transferencia`;
 const intro=merchant
  ?(paid?`Pago confirmado por ${esc(order.provider)} (comprobante ${esc(order.receipt)}). Coordina la compra con el proveedor y el despacho.`:'El comprador eligió transferencia. Verifica el abono en el banco antes de marcar el pedido como pagado.')
  :(paid?'Tu pago fue verificado directamente con el proveedor. Te contactaremos para coordinar la entrega.':`Para completar tu compra transfiere el total indicando la referencia <b>${reference}</b>. El pedido se confirma cuando verifiquemos el abono.${env.TRANSFER_DETAILS?`<br><br>${esc(env.TRANSFER_DETAILS)}`:''}`);
 const origin=env.PUBLIC_ORIGIN||'https://badreason.cl';
 const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111"><h1 style="font-size:22px;letter-spacing:1px">BADREASON</h1><p>${intro}</p><p><b>Pedido ${reference}</b><br><small>ID completo: ${esc(order.id)}</small></p><table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd">${lines}${totals}</table>${delivery}<p style="font-size:12px;color:#555">Condiciones de compra, cambios y devoluciones: <a href="${esc(origin)}/terminos">${esc(origin)}/terminos</a></p></div>`;
 return {subject,html,to:merchant?env.MERCHANT_EMAIL:c.email,replyTo:merchant?c.email:env.MERCHANT_EMAIL};
}

async function send(env,message){
 if(!message.to)return false;
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[message.to],subject:message.subject,html:message.html,...(message.replyTo?{reply_to:message.replyTo}:{})})});
 return response.ok;
}

/** Envía una vez por tipo de aviso. Nunca lanza errores: un correo fallido no debe romper el pago. */
export async function notifyOrder(env,id,kind){
 try{
  if(!mailConfigured(env)||!env.PAYMENTS_DB)return false;
  if(!await claimNotification(env.PAYMENTS_DB,id,kind))return false;
  const order=await env.PAYMENTS_DB.prepare('SELECT * FROM payment_orders WHERE id=?').bind(id).first();
  const results=await Promise.allSettled(['buyer','merchant'].map(a=>send(env,orderEmail(kind,order,env,a))));
  const sent=results.some(r=>r.status==='fulfilled'&&r.value);
  if(!sent)await releaseNotification(env.PAYMENTS_DB,id,kind);
  return sent;
 }catch{return false;}
}
