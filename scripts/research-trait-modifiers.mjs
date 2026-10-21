import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
const manifest=JSON.parse(await readFile(file('data/wiki-pages.json'),'utf8'));
const catalog=JSON.parse(await readFile(file('public/catalog.json'),'utf8'));
const pages={};
for(const [id,info] of Object.entries(manifest.entries.traits)){
 const html=await readFile(file(`data/wiki-cache/traits-${id}.html`),'utf8'),$=load(html);
 const content=$('.mw-parser-output').first().clone();
 const history=content.children('h2').filter((_,e)=>$(e).find('#Version_history,#History').length).first();
 if(history.length)history.nextAll().add(history).remove();
 content.find('.navbox,.nav,.infobox,.toc,script,style,[style*="display:none"],[style*="display: none"]').remove();
 const rows=[];
 content.find('table').each((_,table)=>{
  const heads=$(table).find('tr').first().text().replace(/\s+/g,' ').trim();
  if(!/Skill\s+Traited recharge/i.test(heads))return;
  $(table).find('tr').slice(1).each((_,tr)=>{
   const cells=$(tr).children('td');if(cells.length<2)return;
   const text=$(tr).text().replace(/\s+/g,' ').trim();
   const arrow=text.match(/([\d.]+)\s*→\s*([\d.]+)/);if(!arrow)return;
   const links=cells.first().find('a[href^="/wiki/"]').toArray();
   const targets=[...new Set(links.map(a=>decodeURIComponent($(a).attr('href').slice(6))))];
   if(targets.length!==1)return;
   rows.push({title:targets[0],text,before:Number(arrow[1]),after:Number(arrow[2]),pve:!/(?:PvP|WvW)/.test(text)||/PvE/.test(text)});
  });
 });
 if(rows.length){
  const trait=catalog.traits.find(t=>t.id===+id),profession=catalog.specs.find(s=>s.id===trait.specialization).profession;
  pages[id]={title:info.title,revision:Number(html.match(/"wgRevisionId":(\d+)/)?.[1]),profession,rows};
 }
}
await writeFile(file('data/wiki-trait-recharge-research.json'),JSON.stringify({schema:1,pages},null,2)+'\n','utf8');
console.log(JSON.stringify(Object.entries(pages).map(([id,p])=>({id,title:p.title,profession:p.profession,pveRows:p.rows.filter(r=>r.pve).length})),null,2));
