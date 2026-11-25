// Genera dist/sitemap.xml después de `vite build`. Usa PUBLIC_ORIGIN o https://badreason.cl.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const origin=(process.env.PUBLIC_ORIGIN||'https://badreason.cl').replace(/\/$/,'');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const collections=read('public/data/collections.json');
const categories=read('public/data/categories.json');
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const today=new Date().toISOString().slice(0,10);
export function sitemapUrls(){
 return [
  ['/', 'daily', '1.0'],['/catalogo','daily','0.9'],['/categorias','weekly','0.8'],
  ...collections.flatMap(g=>[[`/coleccion/${g.id}?kind=shoes`,'daily','0.8'],[`/coleccion/${g.id}?kind=clothing`,'daily','0.6']]),
  ...categories.map(c=>[`/catalogo?category=${encodeURIComponent(c.path)}`,'weekly','0.5']),
  ['/informacion','monthly','0.4'],['/ayuda','monthly','0.4'],
  ['/terminos','yearly','0.3'],['/devoluciones','yearly','0.3'],['/envios','yearly','0.3'],['/privacidad','yearly','0.3'],
 ];
}
export function sitemap(){
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  +sitemapUrls().map(([path,freq,priority])=>`  <url><loc>${xml(origin+path)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n')
  +'\n</urlset>\n';
}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=new URL('../dist/sitemap.xml',import.meta.url);
 if(!existsSync(new URL('../dist/',import.meta.url)))throw Error('Ejecuta vite build antes de generar el sitemap.');
 writeFileSync(out,sitemap());
 console.log(`sitemap.xml: ${sitemapUrls().length} URL`);
}
