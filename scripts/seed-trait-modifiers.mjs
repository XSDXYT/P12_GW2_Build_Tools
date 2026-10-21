import fs from 'node:fs';
const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
const snapshot=JSON.parse(fs.readFileSync(file('src/data/wiki/mesmer.json'),'utf8'));
const rules=[];
const target=(id,guards=[])=>({kind:'skills',id,revision:snapshot.entries.skills[id].revision,guards});
function rule(id,trait,evidence,ids,changes,guardLabels=[],priority=0){
 rules.push({id,trait,revision:snapshot.entries.traits[trait].revision,evidence,priority,
 targets:ids.map(id=>target(id,guardLabels.map(label=>{const row=snapshot.entries.skills[id].rows.find(r=>r.label===label);return{label,detail:row.detail}}))),changes});
}
const append=row=>({type:'append',row});
rule('blurred-inscriptions-distortion',752,'activating one grants you distortion.',[21750,10236,10232,10234,10247,29519],[append({label:'失真',detail:'1 秒',trigger:'激活纹章时'})]);
rule('blurred-inscriptions-heal',752,'Healing: 6,600 (0.85)',[21750],[{type:'replace',label:'治疗',row:{label:'治疗',detail:'6600 + 0.85 × 治疗效果',healing:{base:6600,coefficient:0.85}}}],['治疗']);
rule('blurred-inscriptions-targets',752,'Number of Targets: 5',[10236],[append({label:'主动效果 · 目标数',detail:'5',trigger:'激活纹章时'})]);
rule('blurred-inscriptions-cleanse',752,'Conditions Removed: 5',[10234],[append({label:'症状移除',detail:'5',trigger:'激活纹章时'})]);
rule('blurred-inscriptions-vulnerability',752,'10 Vulnerability (6s)',[29519],[append({label:'易伤',detail:'6 秒 · 10 层',stacks:10,trigger:'激活纹章时'})]);
rule('prismatic-stealth-duration',674,'Duration Increase: 50%',[10201,10187,10234,10245],[{type:'duration',label:'潜行',factor:1.5}],['潜行'],20);
rule('cry-of-pain-confusion',734,'Increases Confusion duration from 3s to 4s; increases stacks inflicted per strike from 1 to 2.',[10190,56928,62616],[{type:'replace',label:'困惑',row:{label:'困惑',detail:'4 秒 · 2 层',stacks:2}}],['困惑']);
rule('cry-of-pain-flute',734,'Additional Stacks: 2 Duration Increase: 50%',[76746],[{type:'replace',label:'困惑',row:{label:'困惑',detail:'6 秒 · 5 层',stacks:5}}],['困惑']);
rule('fragmentation-critical',2035,'Increased critical-hit chance by 25%.',[10191,56930,62617,76552],[append({label:'暴击率提高',detail:'25%',trigger:'此技能命中时'})]);
rule('fragmentation-cripple',2035,'Inflicts Crippled for 3s per hit.',[10190,56928,62616],[append({label:'致残',detail:'3 秒',trigger:'每次命中时'})]);
rule('fragmentation-targets',2035,'Strikes up to five targets within range.',[10287,56873,62602],[{type:'replace',label:'目标数',row:{label:'目标数',detail:'5'}}],['目标数']);
rule('fragmentation-reflect',2035,'Applies Reflection to any source of Distortion.',[10192,68273],[append({label:'反射投射物',detail:'',trigger:'失真期间'})]);
rule('fragmentation-continuum',2035,'Base duration increased by 1 second.',[29830],[append({label:'基础持续时间增加',detail:'1 秒'})]);
fs.writeFileSync(file('data/wiki-trait-modifiers.json'),JSON.stringify({schema:1,professions:['Mesmer'],rules},null,2)+'\n','utf8');
