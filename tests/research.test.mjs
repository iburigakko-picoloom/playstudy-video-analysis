import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/playstudy/app.js',import.meta.url),'utf8');
const dataCode=fs.readFileSync(new URL('../public/playstudy/data-store.js',import.meta.url),'utf8');
const researchCode=source.slice(source.indexOf('/* Research v2:'),source.indexOf('const focusBaseBind=bind;'));
function fixture(){
 const state={screen:'research',activeTheme:'t',themes:[{id:'t',title:'Contact point',summary:'Try this',researchVersion:2,relatedTagIds:['tag']}],researchCards:[],videos:[{id:'v',title:'Practice',durationSeconds:20,src:'blob:test'}],notes:[{id:'n',videoId:'v',time:6,title:'Elbow',body:'Higher',tagIds:['tag']}],scenes:[],comparisons:[],tagDefs:[{id:'tag',name:'成功'}]};
 const routes=[],noop=()=>{},nodes=new Map();
 const ctx=vm.createContext({state,AbortController,requestAnimationFrame:()=>1,cancelAnimationFrame:noop,setTimeout,clearTimeout,console,confirm:()=>true,document:{addEventListener:noop},navigator:{},window:{},uid:p=>p+'1',deep:v=>JSON.parse(JSON.stringify(v)),esc:v=>String(v??'').replaceAll('<','&lt;'),fmt:t=>String(t),secsFromInput:v=>v.includes(':')?v.split(':').map(Number).reduce((a,b)=>a*60+b):+v,clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),theme:id=>state.themes.find(t=>t.id===id),video:id=>state.videos.find(v=>v.id===id),scene:id=>state.scenes.find(s=>s.id===id),topbar:title=>'<header>'+title+'</header>',nav:()=>'',focusMemoText:n=>n?[n.title,n.body].filter(Boolean).join('\n'):'',focusMemoTags:()=>'<tags>成功</tags>',focusSortedNotes:notes=>[...notes].sort((a,b)=>a.time-b.time),saveChanges:(_keys,fn)=>{fn();return true},syncResearchLinks:noop,toast:noop,render:noop,offerUndo:noop,route:(...args)=>routes.push(args),$:selector=>nodes.get(selector)||null,$$:()=>[]});
 vm.runInContext(dataCode,ctx);ctx.window.PlayStudyData=ctx.PlayStudyData;vm.runInContext(researchCode,ctx);
 return {ctx,state,routes,nodes};
}
test('research top is a vertical task list and detail contains only clips and a summary',()=>{
 const f=fixture();let html=f.ctx.research();assert.match(html,/＋ 課題を作成/);assert.match(html,/data-research-task="t"/);assert.doesNotMatch(html,/research-summary/);
 f.state.screen='researchDetail';f.state.researchCards=[{id:'c',type:'clip',researchId:'t',themeId:'t',videoId:'v',memoId:'n',startTime:3,endTime:11,clipNote:'Contact earlier'}];
 html=f.ctx.research();for(const x of ['＋ 動画を追加','Contact earlier','元動画へ','元メモへ','研究まとめ','まとめを書き出す','成功'])assert.ok(html.includes(x));
 assert.equal((html.match(/id="research-summary"/g)||[]).length,1);assert.doesNotMatch(html,/>資料<|>仮説<|>結論<|>集計</);
 f.state.notes=[];assert.match(f.ctx.research(),/元メモなし/);f.state.videos=[];assert.match(f.ctx.research(),/元動画がありません/);
 f.state.screen='research';f.state.themes=[];assert.match(f.ctx.research(),/課題を作って/);
});
test('task selection binds the actual detail route and summary save preserves tags',()=>{
 const f=fixture(),button={dataset:{researchTask:'t'}};f.ctx.$$=s=>s==='[data-research-task]'?[button]:[];
 f.ctx.bindResearch();button.onclick();assert.deepEqual(f.routes.pop(),['researchDetail','t']);
 const field={value:'New insight'},save={},exportButton={};f.nodes.set('#research-summary',field);f.nodes.set('#research-summary-status',{});f.nodes.set('#research-summary-save',save);f.nodes.set('#research-export',exportButton);
 f.ctx.bindResearch();field.oninput();assert.equal(f.state.researchSummaryDrafts.t,'New insight');save.onclick();assert.equal(f.state.themes[0].summary,'New insight');assert.deepEqual(f.state.themes[0].relatedTagIds,['tag']);
 f.ctx.saveChanges=()=>false;field.value='Do not lose';field.oninput();save.onclick();assert.equal(f.state.researchSummaryDrafts.t,'Do not lose');assert.equal(f.state.themes[0].summary,'New insight');
});
class Node extends EventTarget{
 constructor(){super();this.value='';this.dataset={};this.textContent='';this.hidden=false;this.disabled=false;this.attrs={};this.isConnected=true}
 getAttribute(k){return this.attrs[k]||null}setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}
 set innerHTML(value){this.html=value;if(value.includes('<option')){const opts=[...value.matchAll(/<option value="([^"]*)"([^>]*)>/g)];this.value=(opts.find(o=>o[2].includes('selected'))||opts[0])?.[1]||''}}
 get innerHTML(){return this.html||''}
 insertAdjacentHTML(_pos,value){this.innerHTML=value+this.innerHTML}
 close(){this.closed=true}
}
function clipForm(f){
 const nodes=new Map();for(const id of ['task','new-task','video','memo','memo-text','start','end','note'])nodes.set('#rc-'+id,new Node());nodes.set('form',new Node());nodes.set('.research-error',new Node());
 const dialog=new Node();f.ctx.researchModal=html=>{dialog.innerHTML=html;for(const [s,node] of nodes){const id=s.slice(1);const m=html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'));if(m)node.innerHTML=m[1]}return dialog};
 f.ctx.$=s=>nodes.get(s)||null;
 return {nodes,dialog,get:id=>nodes.get('#rc-'+id),submit:()=>nodes.get('form').onsubmit({preventDefault(){}})};
}
test('memo and research entry points create reference-only clips with validated ranges',()=>{
 for(const fromMemo of [true,false]){
  const f=fixture(),form=clipForm(f);f.ctx.openResearchClip(fromMemo?{memoId:'n'}:{});
  assert.equal(form.get('video').value,'v');assert.equal(form.get('memo').value,'n');assert.equal(form.get('start').value,'3');assert.equal(form.get('end').value,'11');
  form.get('note').value='Visible insight';form.submit();const c=f.state.researchCards[0];
  assert.equal(c.videoId,'v');assert.equal(c.memoId,'n');assert.equal(c.researchId,'t');assert.equal(c.startTime,3);assert.equal(c.endTime,11);assert.equal(c.clipNote,'Visible insight');assert.equal(c.src,undefined);assert.equal(f.state.videos.length,1);assert.ok(form.dialog.closed);
 }
});
test('clip editing, invalid inputs, new task, and failed writes keep the input intact',()=>{
 const f=fixture(),form=clipForm(f);f.ctx.openResearchClip({memoId:'n'});form.get('start').value='12';form.get('end').value='5';form.submit();assert.equal(f.state.researchCards.length,0);assert.match(form.nodes.get('.research-error').textContent,/終了位置/);
 form.get('start').value='oops';form.submit();assert.equal(f.state.researchCards.length,0);
 form.get('start').value='2';form.get('end').value='8';form.get('task').value='__new__';form.get('new-task').value='Footwork';form.get('note').value='Keep input';
 f.ctx.saveChanges=()=>false;form.submit();assert.equal(f.state.themes.length,1);assert.equal(form.get('note').value,'Keep input');assert.ok(!form.dialog.closed);
 f.ctx.saveChanges=(_keys,fn)=>{fn();return true};form.submit();assert.equal(f.state.themes.length,2);assert.equal(f.state.researchCards[0].researchId,'rt1');
 const edit=clipForm(f);f.ctx.openResearchClip({clipId:'rc1'});edit.get('note').value='Updated';edit.get('start').value='3';edit.get('end').value='9';edit.submit();assert.equal(f.state.researchCards.length,1);assert.equal(f.state.researchCards[0].clipNote,'Updated');
});
function mediaFixture(){
 const f=fixture(),card={id:'c',type:'clip',researchId:'t',videoId:'v',memoId:'n',startTime:3,endTime:8,clipNote:''},article=new Node(),media=new Node(),play=new Node(),toggle=new Node(),slider=new Node(),status=new Node();
 media.readyState=1;media.duration=20;media.currentTime=0;media.paused=true;media.load=()=>{};Object.defineProperty(media,'src',{set:v=>media.attrs.src=v});
 media.play=async()=>{media.paused=false;media.dispatchEvent(new Event('play'))};media.pause=()=>{if(!media.paused){media.paused=true;media.dispatchEvent(new Event('pause'))}};
 const map=new Map([['video',media],['[data-clip-play]',play],['[data-clip-toggle]',toggle],['input',slider],['output',status]]);
 f.ctx.$=(s)=>s.startsWith('[data-clip-card')?article:map.get(s);f.ctx.$$=()=>[media];f.ctx.hydrateVideo=async v=>v;
 const controller=new AbortController();f.ctx.bindResearchClip(card,controller.signal);
 return {...f,card,article,media,play,toggle,slider,status,controller,flush:()=>new Promise(r=>setTimeout(r,0))};
}
test('clip playback is bounded, replayable, and stops on navigation without copying media',async()=>{
 const f=mediaFixture();f.play.dispatchEvent(new Event('click'));await f.flush();assert.equal(f.media.currentTime,3);assert.equal(f.media.paused,false);assert.equal(f.media.getAttribute('src'),'blob:test');
 f.media.currentTime=8.1;f.media.dispatchEvent(new Event('timeupdate'));assert.equal(f.media.currentTime,8);assert.equal(f.media.paused,true);
 f.play.dispatchEvent(new Event('click'));await f.flush();assert.equal(f.media.currentTime,3);assert.equal(f.media.paused,false);
 f.media.currentTime=0;f.media.dispatchEvent(new Event('seeking'));assert.equal(f.media.currentTime,3);
 f.controller.abort();assert.equal(f.media.paused,true);assert.equal(f.media.getAttribute('src'),null);
});
test('clip loading cannot start playback after navigating away and missing videos show a recovery path',async()=>{
 let f=mediaFixture(),resolve;f.ctx.hydrateVideo=()=>new Promise(r=>resolve=r);f.play.dispatchEvent(new Event('click'));f.controller.abort();resolve();await f.flush();assert.equal(f.media.paused,true);assert.equal(f.media.getAttribute('src'),null);
 f=mediaFixture();f.state.videos[0].src='';f.play.dispatchEvent(new Event('click'));await f.flush();assert.match(f.status.textContent,/元動画へ/);assert.equal(f.media.paused,true);
});
