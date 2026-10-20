'use strict';
const {Plugin,Notice,TFile,MarkdownView,PluginSettingTab,Setting} = require('obsidian');
const Core=require('./core');
const GENERATED='Study Connections/Concepts';
const SOURCE_ID='study-connections';
const MARKED_CLASS='sc-match';
const classFor=id=>'sc-colour-'+Core.PAL[Math.abs([...id].reduce((n,x)=>n*31+x.charCodeAt(0),0))%Core.PAL.length];
class StudyConnections extends Plugin {
  async onload(){
    this.concepts=new Map();this.matchCache=new Map();this.timer=null;this.running=false;this.rescanRequested=false;
    this.addSettingTab(new SCSettings(this.app,this));
    this.addCommand({id:'scan-vault',name:'Scan vault and update concept pages',callback:()=>this.scan(true)});
    this.addRibbonIcon('network','Scan and open concept library',async()=>{await this.scan(true);const path=GENERATED;const item=this.app.vault.getAbstractFileByPath(path);if(!item)new Notice('Study Connections: no concept pages yet.'); else new Notice('Study Connections: open the Study Connections/Concepts folder from the file explorer.');});
    this.registerEvent(this.app.vault.on('modify',file=>this.queue(file)));
    this.registerEvent(this.app.vault.on('create',file=>this.queue(file)));
    this.registerEvent(this.app.vault.on('delete',file=>this.queue(file)));
    this.registerEvent(this.app.vault.on('rename',file=>this.queue(file)));
    this.registerObsidianProtocolHandler('study-connections',async(params)=>this.openMatch(params));
    // Reading view: turn visible terms into clickable concept links without editing source text.
    this.registerMarkdownPostProcessor((element,context)=>this.decorateReading(element,context));
    this.enableLivePreview();
    this.register(()=>{if(this.timer)clearTimeout(this.timer)});
    this.timer=setTimeout(()=>this.scan(false),1200);
  }
  queue(file){if(!file||typeof file.path!=='string'||file.path.startsWith('Study Connections/'))return;
    if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>this.scan(false),900);
  }
  async scan(showNotice){
    if(this.running){this.rescanRequested=true;return;}
    this.running=true;try{
      const files=this.app.vault.getMarkdownFiles().filter(f=>!f.path.startsWith('Study Connections/')&&!f.path.includes('/.obsidian/'));
      const inputs=[];for(const file of files)inputs.push({path:file.path,text:await this.app.vault.cachedRead(file)});
      this.concepts=Core.indexFiles(inputs);
      const def=[...this.concepts.values()];this.matchCache=new Map(inputs.map(f=>[f.path,Core.collectMatches(f.text,def)]));
      if(def.length){await this.ensureFolder('Study Connections');await this.ensureFolder(GENERATED);}
      for(const concept of def){await this.writeConcept(concept);}
      await this.markAbsentConcepts(def);
      this.refreshEditorMarks();
      if(showNotice)new Notice(`Study Connections: ${def.length} concept page(s) found; source notes unchanged.`);
    }catch(err){console.error('Study Connections scan failed',err);new Notice(`Study Connections: scan failed (${err.message||err}).`);}
    finally{this.running=false;if(this.rescanRequested){this.rescanRequested=false;this.queue({path:'force.md'});}}
  }
  async ensureFolder(path){if(!this.app.vault.getAbstractFileByPath(path))await this.app.vault.createFolder(path);}
  async writeConcept(concept){
    const path=`${GENERATED}/${concept.id}.md`;const next=Core.conceptPage(concept);
    const f=this.app.vault.getAbstractFileByPath(path);
    if(!f){await this.app.vault.create(path,next);return;}
    if(!(f instanceof TFile))return;
    const old=await this.app.vault.cachedRead(f);
    if(!/study_connections_generated:\s*true/.test(old)){console.warn('Study Connections: refusing to overwrite unowned page',path);return;}
    const update=Core.preserveUserEdits(old,next);
    if(update&&update!==old)await this.app.vault.modify(f,update);
  }
  async markAbsentConcepts(active){
    const activeIds=new Set(active.map(c=>c.id));
    const folder=this.app.vault.getAbstractFileByPath(GENERATED);
    if(!folder||!Array.isArray(folder.children))return;
    for(const file of folder.children){
      if(!(file instanceof TFile)||!file.path.endsWith('.md'))continue;
      const existing=await this.app.vault.cachedRead(file);
      const id=(existing.match(/^study_connections_id:\s*([^\r\n]+)/m)||[])[1];
      if(!id||activeIds.has(id)||!/study_connections_generated:\s*true/.test(existing))continue;
      const placeholder=Core.conceptPage({id,title:id,hits:[]});
      const updated=Core.preserveUserEdits(existing,placeholder);
      if(updated&&updated!==existing)await this.app.vault.modify(file,updated);
    }
  }
  async openMatch(params){
    const path=String(params.file||'');const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||path.startsWith('Study Connections/'))return;
    const leaf=this.app.workspace.getLeaf(false);await leaf.openFile(file);
    const view=leaf.view;if(!(view instanceof MarkdownView))return;
    const raw=await this.app.vault.cachedRead(file);let offset=Number(params.offset);
    if(!Number.isFinite(offset)||offset<0||offset>raw.length)offset=0;
    // The source location is a best-effort offset and refreshes with each scan.
    const pos=view.editor.offsetToPos(offset);view.editor.setCursor(pos);view.editor.scrollIntoView({from:pos,to:pos},true);
  }
  async openConcept(id){
    const file=this.app.vault.getAbstractFileByPath(`${GENERATED}/${id}.md`);
    if(!(file instanceof TFile))return;
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  decorateReading(root,ctx){
    const path=ctx.sourcePath;const hitlist=this.matchCache.get(path)||[];
    if(!hitlist.length)return;
    // Scan each separate text node. Never rewrite original markdown or interfere with links/code.
    const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(tw.nextNode()){const n=tw.currentNode;
      if(!n.nodeValue||!n.nodeValue.trim())continue;
      if(n.parentElement&&n.parentElement.closest('a,button,code,pre,script,style,.sc-match,.cm-editor'))continue;
      nodes.push(n);
    }
    for(const node of nodes){
      const value=node.nodeValue;const spans=Core.collectMatches(value,[...this.concepts.values()]);
      if(!spans.length)continue;
      const frag=document.createDocumentFragment();let cursor=0;
      for(const s of spans){frag.appendChild(document.createTextNode(value.slice(cursor,s.start)));
        const el=document.createElement('span');el.className=`${MARKED_CLASS} ${classFor(s.id)}`;el.textContent=value.slice(s.start,s.end);el.title=`Open concept: ${s.title}`;el.tabIndex=0;el.setAttribute('role','link');
        el.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();void this.openConcept(s.id);});
        el.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();void this.openConcept(s.id);}});
        frag.appendChild(el);cursor=s.end;
      }
      frag.appendChild(document.createTextNode(value.slice(cursor)));node.replaceWith(frag);
    }
  }
  enableLivePreview(){
    try{
      const {ViewPlugin,Decoration}=require('@codemirror/view');
      const {StateEffect}=require('@codemirror/state');
      const refreshEffect=StateEffect.define();this.cmRefreshEffect=refreshEffect;
      const extension=ViewPlugin.fromClass(class{
        constructor(view){this.decorations=this.build(view)}
        update(update){if(update.docChanged||update.viewportChanged||update.focusChanged||update.transactions.some(tr=>tr.effects.some(e=>e.is(refreshEffect))))this.decorations=this.build(update.view)}
        build(view){
          const text=view.state.doc.toString();const matches=Core.collectMatches(text,[...plugin.concepts.values()]);
          const marks=matches.map(m=>Decoration.mark({class:`${MARKED_CLASS} ${classFor(m.id)}`,attributes:{'data-sc-id':m.id,title:`Ctrl+click to open concept: ${m.title}`}}).range(m.start,m.end));
          return Decoration.set(marks,true);
        }
      },{decorations:v=>v.decorations});
      const plugin=this;
      this.registerEditorExtension(extension);
      this.registerDomEvent(document,'click',e=>{
        if(!(e.ctrlKey||e.metaKey))return;
        const target=e.target;if(!(target instanceof Element))return;
        const item=target.closest('.cm-editor .sc-match[data-sc-id]');if(!item)return;
        e.preventDefault();e.stopPropagation();void plugin.openConcept(item.getAttribute('data-sc-id'));
      },true);
      this.cmActive=true;
    }catch(e){this.cmActive=false;console.warn('Study Connections: Live Preview marks unavailable; Reading view still supported',e);}
  }
  refreshEditorMarks(){
    if(!this.cmRefreshEffect)return;
    this.app.workspace.iterateAllLeaves(leaf=>{
      try{const editor=leaf.view?.editor?.cm;if(editor?.dispatch)editor.dispatch({effects:this.cmRefreshEffect.of(null)});}
      catch(err){console.warn('Study Connections: editor refresh deferred',err);}
    });
  }
}
class SCSettings extends PluginSettingTab{
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){const {containerEl}=this;containerEl.empty();
    containerEl.createEl('h2',{text:'Study Connections'});
    containerEl.createEl('p',{text:'Scans notes locally, marks matched wording, and writes concept pages to Study Connections/Concepts. It never rewrites your source notes. Related wording is a suggestion, not a verified evidence link.'});
    new Setting(containerEl).setName('Scan now').setDesc('Rebuild the concept library and update maps.').addButton(b=>b.setButtonText('Scan vault').onClick(()=>void this.plugin.scan(true)));
    containerEl.createEl('p',{text:`Live Preview marks: ${this.plugin.cmActive?'enabled':'unavailable (Reading view still supported)'}`});
  }
}
module.exports=StudyConnections;
module.exports.core=Core;
