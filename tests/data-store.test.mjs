import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/playstudy/data-store.js',import.meta.url),'utf8'),context);
const api=context.PlayStudyData;
const plain=x=>JSON.parse(JSON.stringify(x));
const defaults={videos:[],notes:[],scenes:[],tagEvents:[],drawings:[],comparisons:[],researchCards:[],themes:[],tagDefs:[],settings:{}};
function storage(){const values=new Map();return {values,fail:false,getItem(k){return values.get(k)??null},setItem(k,v){if(this.fail)throw Error('quota');values.set(k,v)}}}
test('related records commit together and a failed write leaves durable data intact',()=>{
 const disk=storage();disk.setItem('ps2_videos',JSON.stringify([{id:'v1'}]));
 const store=api.createStore(disk,defaults);
 store.commit({notes:[{id:'n1'}],themes:[{id:'t1'}]});
 const before=disk.getItem('ps2_snapshot_v1');disk.fail=true;
 assert.throws(()=>store.commit({notes:[],themes:[]}));
 assert.equal(disk.getItem('ps2_snapshot_v1'),before);
 assert.equal(disk.getItem('ps2_videos'),'[{"id":"v1"}]');
 assert.deepEqual(plain(store.read().themes),[{id:'t1'}]);
});
test('writes preserve unrelated changes made by another store',()=>{
 const disk=storage(),a=api.createStore(disk,defaults),b=api.createStore(disk,defaults);
 a.commit({themes:[{id:'t1'}]});b.commit({notes:[{id:'n1'}]});
 assert.deepEqual(plain(a.read().themes),[{id:'t1'}]);
});
test('backup rejects duplicate IDs, orphan records and backwards ranges',()=>{
 const payload=()=>({version:3,data:{...defaults,videos:[{id:'v1'}]}});
 let p=payload();p.data.videos.push({id:'v1'});assert.throws(()=>api.validateBackup(p,defaults));
 p=payload();p.data.notes=[{id:'n1',videoId:'missing'}];assert.throws(()=>api.validateBackup(p,defaults));
 p=payload();p.data.notes=[{id:'n1',videoId:'v1',start:5,end:2}];assert.throws(()=>api.validateBackup(p,defaults));
 assert.equal(api.validateBackup(payload(),defaults).data.videos[0].id,'v1');
});
test('staging restored media remaps records without altering the source backup',()=>{
 const p={version:3,data:{...defaults,videos:[{id:'v1'}],notes:[{id:'n1',videoId:'v1'}],comparisons:[{id:'c1',leftId:'v1'}],researchCards:[{id:'r1',type:'video',refId:'v1'}]}};
 const {data}=api.validateBackup(p,defaults);api.remapVideo(data,'v1','v2');
 assert.equal(data.notes[0].videoId,'v2');assert.equal(data.comparisons[0].leftId,'v2');assert.equal(data.researchCards[0].refId,'v2');assert.equal(p.data.videos[0].id,'v1');
});
test('memo editing preserves range and metadata while changing time and tags',()=>{
 const note={id:'n1',type:'range',start:2,end:4,kind:'observation',custom:'keep'};
 const next=api.updateNote(note,{text:'first\nsecond',time:3,end:7,tagIds:['tag1']});
 assert.equal(next.start,3);assert.equal(next.end,7);assert.equal(next.kind,'observation');assert.equal(next.custom,'keep');assert.equal(next.body,'second');assert.equal(note.start,2);
 assert.throws(()=>api.updateNote(note,{text:'x',time:5,end:1,tagIds:[]}));
});
test('a memo can belong to multiple themes without duplicate links',()=>{
 const cards=[{type:'note',refId:'n',themeId:'a'},{type:'note',refId:'n',themeId:'a'},{type:'note',refId:'n',themeId:'b'}];
 assert.deepEqual(plain(api.linkedThemeIds(cards,'n')),['a','b']);
 assert.deepEqual(plain(api.linkedThemeIds(cards.filter(c=>c.themeId!=='a'),'n')),['b']);
});
test('all entry points load storage before the app and offline shell includes storage',()=>{
 for(const file of ['public/playstudy/index.html','public/launch/index.html','app/page.tsx']){
  const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(text.indexOf('data-store.js')<text.indexOf('app.js'));
 }
 assert.match(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),/playstudy\/data-store.js\?v=35/);
 new vm.Script(fs.readFileSync(new URL('../public/playstudy/app.js',import.meta.url),'utf8'));
});
test('draft keeps its original timestamp after closing the memo sheet',()=>{
 const source=fs.readFileSync(new URL('../public/playstudy/app.js',import.meta.url),'utf8');
 const localStorage=storage(),input={value:'draft'},state={focusCommentAnchor:12};
 const sandbox=vm.createContext({localStorage,state,$:()=>input,$$:()=>[{dataset:{focusCommentTag:'tag1'}}],toast:message=>{throw Error(message)}});
 vm.runInContext(source.slice(source.indexOf('function readFocusDraft('),source.indexOf('function focusCommentTagChoices(')),sandbox);
 sandbox.stashFocusDraft('v1');state.focusCommentAnchor=null;sandbox.stashFocusDraft('v1');
 assert.equal(sandbox.readFocusDraft('v1').time,12);
 assert.deepEqual(plain(sandbox.readFocusDraft('v1').tagIds),['tag1']);
});
