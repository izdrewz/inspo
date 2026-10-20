'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
class TFile{constructor(path){this.path=path;}}
class Plugin{
 constructor(){this.cleanups=[];}
 addSettingTab(){} addCommand(){} addRibbonIcon(){} registerMarkdownPostProcessor(){}
 registerEvent(){}registerObsidianProtocolHandler(){}registerEditorExtension(){}
 registerDomEvent(){} register(cb){this.cleanups.push(cb)}
}
class PluginSettingTab{constructor(app,plugin){this.app=app;this.plugin=plugin}}
class Notice{constructor(message){this.message=message;}}
const fakeObsidian={Plugin,Notice,TFile,MarkdownView:class{},PluginSettingTab,Setting:class{}};
const prior=Module._load;
Module._load=function(name,parent,main){if(name==='obsidian')return fakeObsidian;if(name==='@codemirror/view'||name==='@codemirror/state')throw Error('mock missing optional UI');return prior.apply(this,arguments)};
const PluginClass=require('../main.js');Module._load=prior;
test('full scan creates concept folder and page, without modifying source notes',async()=>{
 const documents=new Map(),folders=new Map();const source=new TFile('practise.md');documents.set(source.path,'the key is listening to them.');
 const mockVault={
 getMarkdownFiles:()=>[...documents.keys()].map(x=>new TFile(x)),
 getAbstractFileByPath:path=>documents.has(path)?new TFile(path):folders.get(path)||null,
 cachedRead:async f=>documents.get(f.path),
 createFolder:async path=>{folders.set(path,{path,children:[]});},
 create:async(path,contents)=>{documents.set(path,contents);const dir=path.substring(0,path.lastIndexOf('/'));folders.get(dir)?.children.push(new TFile(path));return new TFile(path);},
 modify:async(f,contents)=>{documents.set(f.path,contents)},
 on:()=>({})
 };
 const app={vault:mockVault,workspace:{iterateAllLeaves:()=>{},getLeaf:()=>({openFile:async()=>{}})}};
 const plugin=new PluginClass();plugin.app=app;await plugin.onload();clearTimeout(plugin.timer);await plugin.scan(false);
 const page=documents.get('Study Connections/Concepts/listening.md');
 assert.ok(page,'concept page created');
 assert.match(page,/\[practise.md — listening\]\(obsidian:\/\/study-connections/);
 assert.equal(documents.get('practise.md'),'the key is listening to them.');
 documents.set('practise.md','completely different text');await plugin.scan(false);
 assert.equal(documents.get('practise.md'),'completely different text');
 assert.match(documents.get('Study Connections/Concepts/listening.md'),/Found 0 matching passages/);
});
