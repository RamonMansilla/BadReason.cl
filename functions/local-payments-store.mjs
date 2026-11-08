import {DatabaseSync} from 'node:sqlite';
import {orderSchema} from './orders.mjs';
export function openLocalStore(path){const db=new DatabaseSync(path);db.exec(orderSchema);return {prepare(sql){return {bind(...values){const statement=db.prepare(sql);return {async first(){return statement.get(...values)||null;},async run(){return statement.run(...values);}};}};},close(){db.close();}};}
