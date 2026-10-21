import fs from 'node:fs';import {load} from 'cheerio';
const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
const m=JSON.parse(fs.readFileSync(file('data/wiki-pages.json'),'utf8'));
const c=JSON.parse(fs.readFileSync(file('public/catalog.json'),'utf8'));
for(const key of process.argv.slice(2)){
 const [kind,id]=key.includes(':')?key.split(':'):['traits',key];const en=m.entries[kind][id];
 const html=fs.readFileSync(file(`data/wiki-cache/${kind}-${id}.html`),'utf8');const $=load(html);const box=$('.infobox').first(),q=box.nextAll('blockquote').first();
 console.log(JSON.stringify({kind,id,title:en.title,revision:html.match(/"wgRevisionId":(\d+)/)?.[1],quote:q.text().replace(/\s+/g,' ').trim()}));
 for(const h of q.nextAll('h2').filter((_,e)=>$(e).find('#Notes,#Mechanics,#Related_skills').length).toArray())console.log($(h).text().trim(),$(h).nextUntil('h2').text().replace(/\s+/g,' ').trim().slice(0,5500));
}
