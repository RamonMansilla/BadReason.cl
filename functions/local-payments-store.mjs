import {DatabaseSync} from 'node:sqlite';
import {orderSchema,lateColumns} from './orders.mjs';
export function openLocalStore(path){
 const db=new DatabaseSync(path);db.exec(orderSchema);
 const existing=new Set(db.prepare('PRAGMA table_info(payment_orders)').all().map(c=>c.name));
 for(const column of lateColumns)if(!existing.has(column))db.exec(`ALTER TABLE payment_orders ADD COLUMN ${column} TEXT`);
 return {prepare(sql){return {bind(...values){const statement=db.prepare(sql);return {async first(){return statement.get(...values)||null;},async run(){return statement.run(...values);}};}};},close(){db.close();}};
}
