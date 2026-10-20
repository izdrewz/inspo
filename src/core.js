'use strict';
// Pure study-concept scanner. No edits to source text, no AI or network requests.
const CURATED = [
  {id:'listening',title:'Listening and understanding preferences',patterns:['listening','listen','listens','listened','what she wants','what he wants','what they want','wants and likes','wants + likes','their preferences','child’s preferences','childrens preferences']},
  {id:'wellbeing',title:'Wellbeing',patterns:['wellbeing','well-being','well being']},
  {id:'agency',title:'Agency',patterns:['agency','autonomy','self-determination']},
  {id:'inclusion',title:'Inclusion',patterns:['inclusion','included','being included','belonging']},
  {id:'support',title:'Support',patterns:['support','supporting','supported','supports']},
  {id:'rights',title:'Children’s rights',patterns:['rights-bearing','rights bearing','children’s rights','childrens rights','child rights']},
  {id:'communication',title:'Communication',patterns:['communication','communicate','speaking','nonverbal','non-verbal']},
  {id:'family',title:'Family',patterns:['family','families','parents','carers']},
  {id:'relationships',title:'Relationships',patterns:['relationships','relationship','friendships','friendship']},
  {id:'opportunities',title:'Opportunities',patterns:['opportunities','opportunity','access to opportunities']},
  {id:'care',title:'Care',patterns:['caring','care','caregiving','care-giving']},
  {id:'participation',title:'Participation',patterns:['participation','participate','taking part']},
  {id:'neurodiversity',title:'Neurodiversity',patterns:['neurodiversity','neurodivergence','neurodivergent','autism','adhd']},
  {id:'disability',title:'Disability',patterns:['disability','disabilities','disabled']},
  {id:'development',title:'Development',patterns:['development','developing','developmental']}
];
const STOP = new Set(`about above after again against almost along already also although always among another around because become becoming been before being below between both cannot certain change children child course could current daily different each either else enough every example examples feel feeling first from further getting given going good great have having however include included including instead into itself just know learning learn like little longer many might module more most much must notes often only other over own page pages people person possible quite really related same seems should since some someone something still such than that their them then there these they thing things this those through time today under until using very want wants well were what when where which while whole will with within without would your yourself you yours already notes text source sources quote quotes said been done made show shows shown work working years year also make them into then have would could just them rather exact topic topics across there more very thing something ways way look looking itself together actually case cases guide guides sections section`.split(/\s+/));
const PAL=['gold','sky','mint','lavender','peach','rose'];
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const plainId=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
const mask=s=>s.replace(/[^\n]/g,' ');
function textForScan(raw){
  let out=raw; const lines=raw.split('\n'); let inCode=false, inYaml=false, initial=true, result=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i]; const trimmed=line.trim();
    if(initial && trimmed==='---'){inYaml=true;initial=false;result.push(mask(line));continue;}
    initial=false;
    if(inYaml){if(trimmed==='---')inYaml=false;result.push(mask(line));continue;}
    if(/^\s*(```|~~~)/.test(line)){inCode=!inCode;result.push(mask(line));continue;}
    if(inCode){result.push(mask(line));continue;}
    let cleaned=line;
    cleaned=cleaned.replace(/`[^`\n]*`/g,mask);
    cleaned=cleaned.replace(/\]\([^)]*\)/g,mask);
    cleaned=cleaned.replace(/https?:\/\/[^\s)]+/g,mask);
    result.push(cleaned);
  }
  return result.join('\n');
}
function phrasesFor(c){return c.patterns.map(p=>({phrase:p,regex:new RegExp('(?<![\\p{L}\\p{N}])'+escapeRe(p).replace(/\\ /g,'\\s+')+'(?![\\p{L}\\p{N}])','giu')}));}
function buildCandidates(files){
  const wordStats=new Map();
  for(const {path,text} of files){
    const masked=textForScan(text); const words=masked.toLowerCase().match(/[\p{L}]{5,}/gu)||[];
    for(const w of words){if(STOP.has(w))continue;const s=wordStats.get(w)||{count:0,files:new Set()};s.count++;s.files.add(path);wordStats.set(w,s);}
  }
  const extra=[...wordStats.entries()].filter(([w,s])=>s.files.size>=2 && s.count>=3 && !CURATED.some(c=>c.patterns.includes(w))).sort((a,b)=>b[1].files.size-a[1].files.size||b[1].count-a[1].count||a[0].localeCompare(b[0])).slice(0,12);
  return [...CURATED,...extra.map(([w])=>({id:plainId(w),title:w[0].toUpperCase()+w.slice(1),patterns:[w],automatic:true}))];
}
function collectMatches(text,concepts){
  const masked=textForScan(text);const found=[];
  for(const c of concepts){
    for(const {regex,phrase} of phrasesFor(c)){
      regex.lastIndex=0;let m;
      while((m=regex.exec(masked))){
        found.push({id:c.id,title:c.title,start:m.index,end:m.index+m[0].length,text:text.slice(m.index,m.index+m[0].length),kind:phrase.toLocaleLowerCase()===c.id?'term':'alias'});
        if(found.length>10000)break;
      }
    }
  }
  found.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||a.id.localeCompare(b.id));
  // Keep longest match in overlaps. A phrase can be associated with multiple concepts in data
  // later, but overlapping inline marks would obscure each other.
  const result=[];let last=-1;
  for(const item of found){if(item.start<last)continue;result.push(item);last=item.end;}
  return result;
}
function indexFiles(files){
  const concepts=buildCandidates(files);const indexed=new Map();
  for(const c of concepts)indexed.set(c.id,{...c,hits:[]});
  for(const file of files){const matches=collectMatches(file.text,concepts);
    for(const m of matches){const before=file.text.lastIndexOf('\n',m.start-1)+1;const after=file.text.indexOf('\n',m.end);const line=file.text.slice(before,after<0?file.text.length:after).trim();
      indexed.get(m.id).hits.push({...m,path:file.path,line:line.slice(0,250)});
    }
  }
  for(const [key,c] of indexed){if(c.hits.length===0)indexed.delete(key);}
  return indexed;
}
function safeMd(s){return String(s).replace(/([\\[\]*_`])/g,'\\$1').replace(/\r?\n/g,' ');}
function conceptPage(c){
 const lines=['---','study_connections_generated: true',`study_connections_id: ${c.id}`,'---','',`# ${c.title}`,'',
  '## My explanation','', '',
  '<!-- study-connections:generated:start -->','## Linked passages (automatically updated)','',
  `**Found ${c.hits.length} matching passage${c.hits.length===1?'':'s'} in ${new Set(c.hits.map(h=>h.path)).size} note(s).**`,
  '', '*Related wording is suggested, not a verified evidence relationship.*',''];
 const shown=c.hits.slice(0,80);
 for(const h of shown){
   const url=`obsidian://study-connections?file=${encodeURIComponent(h.path)}&offset=${h.start}`;
   lines.push(`- [${safeMd(h.path)} — ${safeMd(h.text)}](${url}) · ${h.kind==='alias'?'Related wording (check)':'Term match'}`);
   if(h.line)lines.push(`  > ${h.line.replace(/^>\s*/,'').replace(/\r/g,'').replace(/\n/g,' ').replace(/<!--|-->/g,'').slice(0,240)}`);
 }
 if(c.hits.length>shown.length)lines.push(`- … and ${c.hits.length-shown.length} more matches.`);
 lines.push('','## Connection map (automatically updated)','','```mermaid','flowchart TD',`  TOP["${c.title.replace(/["<>\\]/g,'').slice(0,55)}"]`);
 const paths=[...new Set(c.hits.map(h=>h.path))].slice(0,10);
 paths.forEach((p,i)=>{lines.push(`  N${i}["${p.replace(/["<>\\]/g,'').slice(0,45)}"] --> TOP`)});
 lines.push('```','','<!-- study-connections:generated:end -->','');return lines.join('\n');
}
function preserveUserEdits(existing,next){
  const start='<!-- study-connections:generated:start -->',end='<!-- study-connections:generated:end -->';
  const i=existing.indexOf(start),j=existing.indexOf(end),ni=next.indexOf(start),nj=next.indexOf(end);
  if(i<0||j<i||ni<0||nj<ni)return null;
  return existing.slice(0,i)+next.slice(ni,nj+end.length)+existing.slice(j+end.length);
}
module.exports={CURATED,PAL,plainId,textForScan,collectMatches,indexFiles,conceptPage,preserveUserEdits};
