// Datos de entrega del comprador. Se validan en el servidor y se guardan con el pedido.
export const regions=['Arica y Parinacota','Tarapacá','Antofagasta','Atacama','Coquimbo','Valparaíso','Metropolitana de Santiago',"Libertador General Bernardo O'Higgins",'Maule','Ñuble','Biobío','La Araucanía','Los Ríos','Los Lagos','Aysén del General Carlos Ibáñez del Campo','Magallanes y de la Antártica Chilena'];
export const TERMS_VERSION='2026-11-25';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
// Quita caracteres de control y espacios repetidos; conserva tildes y ñ.
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max+1);

/** Normaliza un teléfono chileno a +56XXXXXXXXX. Acepta 9 dígitos con o sin +56. */
export function normalizePhone(value){
 const digits=String(value??'').replace(/[\s().-]/g,'');
 const match=/^(?:\+?56)?([2-9]\d{8})$/.exec(digits);
 return match?'+56'+match[1]:null;
}

export function validateCustomer(input){
 if(!input||typeof input!=='object'||Array.isArray(input))invalid('Completa tus datos de entrega.');
 const name=clean(input.name,80),email=clean(input.email,120).toLowerCase(),commune=clean(input.commune,60),address=clean(input.address,160),notes=clean(input.notes,300);
 if(name.length<3||name.length>80||!/\p{L}/u.test(name))invalid('Ingresa tu nombre y apellido.');
 if(email.length>120||!/^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(email))invalid('Ingresa un correo válido.');
 const phone=normalizePhone(input.phone);if(!phone)invalid('Ingresa un teléfono chileno de 9 dígitos, por ejemplo 9 1234 5678.');
 const region=regions.find(r=>r===input.region);if(!region)invalid('Selecciona tu región.');
 if(commune.length<2||commune.length>60)invalid('Ingresa tu comuna.');
 if(address.length<5||address.length>160||!/\d|\bs\/n\b|sin n[uú]mero/i.test(address))invalid('Ingresa calle y número de la dirección (o «s/n»).');
 if(notes.length>300)invalid('Las indicaciones no pueden superar 300 caracteres.');
 return {name,email,phone,region,commune,address,notes};
}
