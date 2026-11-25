export const orderSchema=`CREATE TABLE IF NOT EXISTS payment_orders (
 id TEXT PRIMARY KEY, quote TEXT NOT NULL, provider TEXT, provider_id TEXT,
 redirect TEXT, status TEXT NOT NULL DEFAULT 'quoted', receipt TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 customer TEXT, last_event TEXT, notified TEXT
); CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_id ON payment_orders(provider,provider_id);`;
// Columnas agregadas después de la primera migración. El almacén local las agrega a archivos antiguos.
export const lateColumns=['customer','last_event','notified'];
const now=()=>new Date().toISOString();
const changed=result=>Number(result?.meta?.changes??result?.changes)>0;

export async function saveQuote(db,q,customer=null){const t=now();await db.prepare('INSERT INTO payment_orders (id,quote,customer,created_at,updated_at) VALUES (?,?,?,?,?)').bind(q.id,JSON.stringify(q),customer?JSON.stringify(customer):null,t,t).run();}
export async function getOrder(db,id){return db.prepare('SELECT * FROM payment_orders WHERE id=?').bind(id).first();}
export async function claimProvider(db,id,provider){return changed(await db.prepare("UPDATE payment_orders SET provider=?,updated_at=? WHERE id=? AND status!='paid' AND (provider IS NULL OR provider=?)").bind(provider,now(),id,provider).run());}
export async function updateOrder(db,id,fields){const allowed=['provider','provider_id','redirect','status','receipt'];const pairs=Object.entries(fields).filter(([key])=>allowed.includes(key));await db.prepare('UPDATE payment_orders SET '+pairs.map(([key])=>key+'=?').join(',')+',updated_at=? WHERE id=?').bind(...pairs.map(([,value])=>value),now(),id).run();}
/** Marca el pedido como pagado. Devuelve true solo la primera vez, para no repetir avisos. */
export async function markPaid(db,id,providerId,receipt){return changed(await db.prepare("UPDATE payment_orders SET status='paid',receipt=?,updated_at=? WHERE id=? AND provider_id=? AND status!='paid'").bind(String(receipt),now(),id,String(providerId)).run());}
/** Guarda el último estado informado por el proveedor (rechazos, reembolsos, contracargos) para auditoría. */
export async function recordEvent(db,id,event){await db.prepare('UPDATE payment_orders SET last_event=?,updated_at=? WHERE id=?').bind(JSON.stringify({...event,at:now()}),now(),id).run();}
/** Cambia el estado salvo que el pedido ya esté pagado. */
export async function setStatusUnlessPaid(db,id,status){return changed(await db.prepare("UPDATE payment_orders SET status=?,updated_at=? WHERE id=? AND status!='paid'").bind(status,now(),id).run());}
/** Reserva un aviso por correo para que dos webhooks simultáneos no lo envíen dos veces. */
export async function claimNotification(db,id,kind){return changed(await db.prepare("UPDATE payment_orders SET notified=COALESCE(notified,'')||?||',' WHERE id=? AND instr(COALESCE(notified,''),?||',')=0").bind(kind,id,kind).run());}
export async function releaseNotification(db,id,kind){await db.prepare("UPDATE payment_orders SET notified=replace(COALESCE(notified,''),?||',','') WHERE id=?").bind(kind,id).run();}
