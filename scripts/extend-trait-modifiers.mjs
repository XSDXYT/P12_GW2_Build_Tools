import fs from 'node:fs';
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),profession=process.argv[2];
const c=JSON.parse(fs.readFileSync(file('data/wiki-trait-modifiers.json'),'utf8'));
if(!c.professions.includes(profession))c.professions.push(profession);
if(profession==='Guardian'){
 const s=JSON.parse(fs.readFileSync(file('src/data/wiki/guardian.json'),'utf8'));
 for(const [id,label,detail,evidence] of [
  [9093,'纹章被动','216 威力','Bonus Power increased to 216'],
  [9151,'纹章被动','216 症状伤害','Bonus Condition Damage increased to 216'],
  [9163,'纹章被动','144 增益效果','Bonus Concentration increased to 144'],
  [9158,'间隔','4 秒','Interval of cleansing conditions reduced to 4 seconds.'],
  [9150,'纹章被动','-12% 受到的伤害, -12% 受到的症状伤害','Damage Reduction increased to -12%'],
 ]){
  const key=`perfect-inscriptions-${id}`;if(c.rules.some(r=>r.id===key))continue;
  c.rules.push({id:key,trait:579,revision:s.entries.traits[579].revision,evidence,targets:[{kind:'skills',id,revision:s.entries.skills[id].revision,guards:[{label,detail:s.entries.skills[id].rows.find(r=>r.label===label).detail}]}],changes:[{type:'replace',label,row:{label,detail}}]});
 }
}
fs.writeFileSync(file('data/wiki-trait-modifiers.json'),JSON.stringify(c,null,2)+'\n','utf8');
