export const orderSchema=`CREATE TABLE IF NOT EXISTS payment_orders (
 id TEXT PRIMARY KEY, quote TEXT NOT NULL, provider TEXT, provider_id TEXT,
 redirect TEXT, status TEXT NOT NULL DEFAULT 'quoted', receipt TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_id ON payment_orders(provider,provider_id);`;
export async function saveQuote(db,q){const now=new Date().toISOString();await db.prepare('INSERT INTO payment_orders (id,quote,created_at,updated_at) VALUES (?,?,?,?)').bind(q.id,JSON.stringify(q),now,now).run();}
export async function getOrder(db,id){return db.prepare('SELECT * FROM payment_orders WHERE id=?').bind(id).first();}
export async function claimProvider(db,id,provider){const result=await db.prepare("UPDATE payment_orders SET provider=?,updated_at=? WHERE id=? AND status!='paid' AND (provider IS NULL OR provider=?)").bind(provider,new Date().toISOString(),id,provider).run();return Number(result.meta?.changes??result.changes)>0;}
export async function updateOrder(db,id,fields){const allowed=['provider','provider_id','redirect','status','receipt'];const pairs=Object.entries(fields).filter(([key])=>allowed.includes(key));await db.prepare('UPDATE payment_orders SET '+pairs.map(([key])=>key+'=?').join(',')+',updated_at=? WHERE id=?').bind(...pairs.map(([,value])=>value),new Date().toISOString(),id).run();}
export async function markPaid(db,id,providerId,receipt){await db.prepare("UPDATE payment_orders SET status='paid',receipt=?,updated_at=? WHERE id=? AND provider_id=?").bind(String(receipt),new Date().toISOString(),id,String(providerId)).run();}
