import {load} from 'cheerio';

const plain=s=>s.replace(/\s+/g,' ').trim();
/** Only explicit current Wiki before/after tables; no API ordering or guessed percentages. */
export function rechargeTableRows(html){
 const $=load(html),content=$('.mw-parser-output').first().clone();
 const history=content.children('h2').filter((_,e)=>$(e).find('#Version_history,#History').length).first();
 if(history.length)history.nextAll().add(history).remove();
 content.find('.nav,.navbox,.toc,script,style,[style*="display:none"],[style*="display: none"]').remove();
 const rows=[];
 content.find('table').each((_,table)=>{
  const headers=$(table).find('tr').first().children('th').map((_,h)=>plain($(h).text())).get().filter(Boolean).join(' ');
  if(!/^Skill\s+Traited recharge$/i.test(headers))return;
  $(table).find('tr').slice(1).each((_,tr)=>{
   const cells=$(tr).children('td');if(cells.length<2)return;
   if($(tr).add($(tr).parents()).filter('.gamemode').toArray().some(e=>!$(e).hasClass('pve')))return;
   const text=plain($(tr).text());
   if(/PvP|WvW/.test(text)&&!/PvE/.test(text))return;
   // Conditional qualifiers other than explicit mode lists need a separate review.
   if(/\([^)]*\)/.test(text.replace(/\((?:PvE|PvP|WvW)(?:[, ]+(?:PvE|PvP|WvW))*\)/g,'')))return;
   const match=text.match(/([\d.]+)\s*→\s*([\d.]+)$/);if(!match)return;
   const titles=[...new Set(cells.first().find('a[href^="/wiki/"]').toArray().map(a=>decodeURIComponent($(a).attr('href').slice(6))))];
   if(titles.length!==1||titles[0].includes('#'))return;
   rows.push({title:titles[0],text,before:Number(match[1]),after:Number(match[2])});
  });
 });
 return rows;
}

export async function attachTraitModifiers({snapshot,config,readHtml,catalog}){
 const audit={rules:[],skipped:[],professions:config.professions};
 const targets=[];
 for(const [kind,entries] of Object.entries(snapshot.entries))for(const [id,entry] of Object.entries(entries)){
  if(entry.identityVerified)targets.push({kind,id:+id,entry,owner:entry});
  for(const branch of entry.branches||[])targets.push({kind:'skills',id:branch.id,entry:branch,owner:entry});
 }
 const sources=new Map();
 async function source(kind,id,revision){
  const key=`${kind}/${id}`;
  if(!sources.has(key))sources.set(key,await readHtml(kind,id));
  const html=sources.get(key),actual=Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
  if(actual!==revision)throw Error(`Review trait modifier source revision: ${key}`);
  return html;
 }
 const add=(target,rule)=>{
  const trait=catalog.traits.find(t=>t.id===rule.trait);
  const profession=catalog.specs.find(s=>s.id===trait?.specialization)?.profession;
  if(!trait||profession!==target.owner.profession)throw Error(`Trait modifier profession mismatch: ${rule.trait}/${target.id}`);
  (target.entry.modifiers??=[]).push({...rule,traitName:trait.name});
  audit.rules.push({target:target.id,title:target.entry.title,trait:rule.trait,rule:rule.id,source:rule.source});
 };
 // Explicit tables are reviewed per profession, then guarded against the
 // independent target page's current PvE cooldown before emitting a rule.
 for(const [traitId,traitPage] of Object.entries(snapshot.entries.traits)){
  if(!config.professions.includes(traitPage.profession))continue;
  const html=await source('traits',traitId,traitPage.revision);
  for(const row of rechargeTableRows(html)){
   if(!Number.isFinite(row.before)||!Number.isFinite(row.after)||row.after<0||row.after>=row.before)continue;
   const matches=targets.filter(t=>t.kind==='skills'&&t.entry.title===row.title&&t.owner.profession===traitPage.profession);
   for(const target of matches){
    const cooldown=target.entry.rows.filter(r=>r.label==='冷却时间');
    if(cooldown.length!==1||cooldown[0].detail!==`${row.before} 秒`||target.entry.rows.some(r=>/充能|弹药/.test(r.label))){
     audit.skipped.push({trait:+traitId,target:target.id,reason:'Independent PvE cooldown or ammunition contract differs',table:row});continue;
    }
    add(target,{id:`recharge-${traitId}-${target.id}`,trait:+traitId,priority:0,source:{kind:'traits',id:+traitId,title:traitPage.title,revision:traitPage.revision},changes:[{type:'replace',label:'冷却时间',row:{...cooldown[0],detail:`${row.after} 秒`}}]});
   }
  }
 }
 for(const definition of config.rules){
  const traitPage=snapshot.entries.traits[definition.trait];
  if(!config.professions.includes(traitPage?.profession))continue;
  const html=await source('traits',definition.trait,definition.revision);
  const $=load(html),q=$('.infobox.trait').first().nextAll('blockquote').first();
  const current=q.add(q.nextUntil('h2:has(#Version_history),h2:has(#History)')).clone();
  current.find('script,style,[style*="display:none"],[style*="display: none"],.gamemode:not(.pve)').remove();
  const evidence=plain(current.text());
  if(!evidence.includes(definition.evidence))throw Error(`Trait modifier evidence changed: ${definition.id}`);
  for(const contract of definition.targets){
   const matches=targets.filter(t=>t.kind===contract.kind&&t.id===contract.id);
   if(!matches.length)throw Error(`Missing verified modifier target: ${definition.id}/${contract.id}`);
   for(const target of matches){
    if(target.entry.revision!==contract.revision)throw Error(`Review trait modifier target revision: ${definition.id}/${contract.id}`);
    for(const guard of contract.guards||[]){
     if(!target.entry.rows.some(r=>r.label===guard.label&&r.detail===guard.detail))throw Error(`Trait modifier base changed: ${definition.id}/${contract.id}/${guard.label}`);
    }
    const changes=contract.changes||definition.changes;
    for(const change of changes){
     if(!['append','replace','duration'].includes(change.type))throw Error(`Unknown trait modifier: ${definition.id}`);
     if(change.type==='duration'&&(!Number.isFinite(change.factor)||change.factor<=0))throw Error(`Invalid duration factor: ${definition.id}`);
     if(change.type!=='append'&&target.entry.rows.filter(r=>r.label===change.label).length!==1)throw Error(`Ambiguous trait modifier row: ${definition.id}/${contract.id}/${change.label}`);
     if(change.type==='duration'&&!/^\d+(?:\.\d+)? 秒(?:$| ·)/.test(target.entry.rows.find(r=>r.label===change.label)?.detail||''))throw Error('Unsupported duration modifier');
    }
    add(target,{id:definition.id,trait:definition.trait,priority:definition.priority||0,source:{kind:'traits',id:definition.trait,title:traitPage.title,revision:definition.revision},changes});
   }
  }
 }
 snapshot.modifierCoverage={professions:config.professions,rules:audit.rules.length,targets:new Set(audit.rules.map(r=>`${r.target}/${r.title}`)).size,traits:new Set(audit.rules.map(r=>r.trait)).size,guardedSkips:audit.skipped.length};
 return audit;
}
