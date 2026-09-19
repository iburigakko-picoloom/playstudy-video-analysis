(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PlayStudyData=api})(globalThis,function(){
  'use strict';
  const SNAPSHOT_KEY='ps2_snapshot_v1';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function createStore(storage,defaults){
    const keys=Object.keys(defaults);
    function read(){
      const raw=storage.getItem(SNAPSHOT_KEY);
      if(raw){
        const saved=JSON.parse(raw);
        if(saved.version!==1||!object(saved.data))throw new Error('保存データの形式を読み込めません');
        return saved.data;
      }
      return Object.fromEntries(keys.map(key=>{
        const raw=storage.getItem('ps2_'+key);
        return [key,raw?JSON.parse(raw):clone(defaults[key])];
      }));
    }
    return {
      read,
      commit(changes){
        // A single localStorage record commits all related metadata atomically.
        // Read again for every write so another window's unrelated edits survive.
        const data={...read(),...changes};
        storage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,data}));
        return data;
      }
    };
  }
  function validateBackup(payload,defaults){
    if(!object(payload)||![1,2,3,4].includes(payload.version)||!object(payload.data))throw new Error('対応していないバックアップ形式です');
    const data={};
    for(const [key,fallback] of Object.entries(defaults)){
      const value=payload.data[key]??fallback;
      if(Array.isArray(fallback)){
        if(!Array.isArray(value))throw new Error(key+' の形式が正しくありません');
        const ids=new Set();
        for(const item of value){
          if(!object(item)||typeof item.id!=='string'||! /^[a-zA-Z0-9_-]+$/.test(item.id)||ids.has(item.id))throw new Error(key+' のIDが正しくありません');
          ids.add(item.id);
        }
      }else if(!object(value))throw new Error(key+' の形式が正しくありません');
      data[key]=clone(value);
    }
    const videoIds=new Set(data.videos.map(item=>item.id));
    for(const card of data.researchCards){
      if(card.type==='link'&&card.url&&!/^https?:\/\/[^\s"<>]+$/i.test(card.url))throw new Error('リンクの形式が正しくありません');
      if(card.imageData&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]*$/.test(card.imageData))throw new Error('画像の形式が正しくありません');
    }
    for(const video of data.videos){
      if(video.poster&&!/^(data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]*|https?:\/\/[^\s"<>]+|blob:[^\s"<>]+)$/.test(video.poster))throw new Error('サムネイルの形式が正しくありません');
    }
    for(const key of ['notes','scenes','tagEvents','drawings']){
      for(const item of data[key]){
        if(!videoIds.has(item.videoId))throw new Error('元動画がない記録が含まれています');
        for(const field of ['time','start','end'])if(item[field]!=null&&(!Number.isFinite(item[field])||item[field]<0))throw new Error('記録の時刻が正しくありません');
        if(item.start!=null&&item.end!=null&&item.end<item.start)throw new Error('区間の終了時刻が正しくありません');
      }
    }
    for(const card of data.researchCards)if(card.type==='clip')validateResearchClip(card,data,{allowMissing:true});
    const files=payload.videoFiles??{};
    if(!object(files))throw new Error('動画ファイルの形式が正しくありません');
    for(const [id,file] of Object.entries(files)){
      if(!videoIds.has(id)||!object(file)||typeof file.data!=='string'||!/^data:[^,]*;base64,[A-Za-z0-9+/=\r\n]*$/.test(file.data))throw new Error('動画データが正しくありません');
    }
    return {data,files};
  }
  function remapVideo(data,oldId,newId){
    data.videos.forEach(item=>{if(item.id===oldId)item.id=newId});
    for(const key of ['notes','scenes','tagEvents','drawings'])data[key].forEach(item=>{if(item.videoId===oldId)item.videoId=newId});
    data.comparisons.forEach(item=>{for(const key of ['leftId','rightId','leftVideoId','rightVideoId'])if(item[key]===oldId)item[key]=newId});
    data.researchCards.forEach(item=>{if(item.type==='video'&&item.refId===oldId)item.refId=newId;if(item.videoId===oldId)item.videoId=newId});
  }
  function linkedThemeIds(cards,noteId){
    return [...new Set(cards.filter(card=>(card.type==='note'&&card.refId===noteId)||(card.type==='clip'&&card.memoId===noteId)).map(card=>card.researchId||card.themeId))];
  }
  function updateNote(note,{text,time,end,tagIds}){
    if(!text.trim())throw new Error('メモを入力してください');
    if(!Number.isFinite(time)||time<0)throw new Error('保存位置を確認してください');
    if(note.type==='range'&&(!Number.isFinite(end)||end<time))throw new Error('終了位置は開始位置以降にしてください');
    const lines=text.trim().replace(/\r/g,'').split('\n'),first=lines.shift();
    const result={...note,title:first.slice(0,120),body:[first.slice(120),...lines].filter(Boolean).join('\n'),time,tagIds:[...tagIds]};
    if(note.type==='range'){result.start=time;result.end=end}
    return result;
  }
  async function buildBackup({data,includeVideos,readVideo,encode,signal,onProgress=()=>{},limit=240*1024*1024}){
    const parts=[],encoder=new TextEncoder();let bytes=0,completed=0;
    const check=()=>{if(signal?.aborted)throw new Error('バックアップを中止しました')};
    const append=text=>{check();bytes+=encoder.encode(text).byteLength;if(bytes>limit)throw new Error('動画込みでは容量上限を超えます。メモをバックアップし、元動画は別に保管してください');parts.push(text)};
    append(JSON.stringify({version:3,exportedAt:new Date().toISOString(),includeVideos,data}).slice(0,-1)+',"videoFiles":{');
    const videos=includeVideos?data.videos:[];
    for(const video of videos){
      check();onProgress({completed,total:videos.length,bytes,name:video.title});
      let blob;try{blob=await readVideo(video)}catch{throw new Error('動画を読み込めません：'+(video.title||video.id)+'。バックアップは作成していません')}
      if(!blob)throw new Error('動画が見つかりません：'+(video.title||video.id)+'。再選択するか、メモのみをバックアップしてください');
      if(bytes+Math.ceil(blob.size/3)*4+1024>limit)throw new Error('動画込みでは容量上限を超えます。メモをバックアップし、元動画は別に保管してください');
      const type=video.mimeType||blob.type||'video/mp4';
      append((completed?',':'')+JSON.stringify(video.id)+':'+JSON.stringify({name:video.fileName||video.title||video.id,type}).slice(0,-1)+',"data":"data:'+type.replace(/[^a-zA-Z0-9/+.\-]/g,'')+';base64,');
      // Every non-final chunk is divisible by three, so base64 can be concatenated.
      for(let offset=0;offset<blob.size;offset+=192*1024){check();append(await encode(blob.slice(offset,offset+192*1024)));onProgress({completed,total:videos.length,bytes,name:video.title});await new Promise(resolve=>setTimeout(resolve,0))}
      append('"}');completed++;onProgress({completed,total:videos.length,bytes,name:video.title});
    }
    append('}}');check();return {blob:new Blob(parts,{type:'application/json'}),completed,bytes};
  }
  function defaultClipRange(note,video){
    const duration=Number.isFinite(video?.durationSeconds)&&video.durationSeconds>0?video.durationSeconds:Infinity;
    const anchor=Math.max(0,note?.time??note?.start??0);
    const startTime=Math.min(Math.max(0,anchor-3),Math.max(0,duration-1));
    const endTime=Math.min(duration,note?.type==='range'?Math.max(startTime+0.1,note.end):anchor+5);
    return {startTime,endTime:Math.max(startTime+0.01,endTime)};
  }
  function validateResearchClip(clip,data,{allowMissing=false}={}){
    if(!data.themes.some(t=>t.id===clip.researchId))throw new Error('研究課題を選択してください');
    const video=data.videos.find(v=>v.id===clip.videoId),memo=data.notes.find(n=>n.id===clip.memoId);
    if(!allowMissing&&(!video||!memo||memo.videoId!==video.id))throw new Error('動画と、その動画のメモを選択してください');
    if(memo&&memo.videoId!==clip.videoId)throw new Error('元メモと動画が一致しません');
    if(!Number.isFinite(clip.startTime)||!Number.isFinite(clip.endTime)||clip.startTime<0||clip.endTime<=clip.startTime)throw new Error('終了位置は開始位置より後にしてください');
    if(video?.durationSeconds>0&&clip.endTime>video.durationSeconds+0.01)throw new Error('動画の長さ以内で範囲を指定してください');
    if(typeof clip.clipNote!=='string')throw new Error('クリップのメモが正しくありません');
    return clip;
  }
  function migrateResearch(data){
    const themes=clone(data.themes),cards=clone(data.researchCards);
    for(const theme of themes){
      if(theme.researchVersion===2)continue;
      const parts=[theme.summary||''];
      for(const [key,label] of [['question','調べたいこと'],['hypothesis','以前の仮説'],['conclusion','以前の結論'],['nextAction','次に試すこと']])if(theme[key])parts.push(label+'\n'+theme[key]);
      for(const card of cards.filter(c=>c.themeId===theme.id)){
        if(card.type==='clip')continue;
        const note=card.type==='note'?data.notes.find(n=>n.id===card.refId):null;
        const scene=card.type==='scene'?data.scenes.find(s=>s.id===card.refId):null;
        const video=data.videos.find(v=>v.id===(note?.videoId||scene?.videoId||(card.type==='video'?card.refId:'')));
        if(video){
          const range=scene?{startTime:scene.start,endTime:scene.end}:defaultClipRange(note,video);
          const duration=video.durationSeconds>0?video.durationSeconds:Infinity;
          range.startTime=Math.min(Math.max(0,Number.isFinite(range.startTime)?range.startTime:0),Math.max(0,duration-0.01));
          range.endTime=Math.min(duration,Number.isFinite(range.endTime)&&range.endTime>range.startTime?range.endTime:range.startTime+5);
          Object.assign(card,{legacyType:card.type,type:'clip',researchId:theme.id,videoId:video.id,memoId:note?.id||null,...range,clipNote:card.text||''});
        }else{
          const comparison=card.type==='comparison'?data.comparisons.find(c=>c.id===card.refId):null;
          parts.push(['以前の記録',card.text,card.url,comparison?.title,card.type==='image'?'画像（旧データに保持）':'',card.refId?('参照: '+card.refId):''].filter(Boolean).join('\n'));
        }
      }
      theme.summary=parts.filter(Boolean).join('\n\n');theme.researchVersion=2;
    }
    return {themes,researchCards:cards};
  }
  function researchText(theme,cards,data,formatTime){
    const memoText=n=>n?[n.title,n.body].filter(Boolean).join('\n'):'元メモなし';
    return [theme.title,...cards.filter(c=>c.type==='clip'&&(c.researchId||c.themeId)===theme.id).map((c,i)=>{
      const v=data.videos.find(v=>v.id===c.videoId),n=data.notes.find(n=>n.id===c.memoId);
      return `${i+1}. 元動画: ${v?.title||'元動画なし'}\n時間範囲: ${formatTime(c.startTime)} – ${formatTime(c.endTime)}\n元メモ: ${memoText(n)}\nこの動画で分かること: ${c.clipNote||'未入力'}`;
    }),'研究まとめ\n'+(theme.summary||'未入力')].join('\n\n');
  }
  return {createStore,validateBackup,remapVideo,linkedThemeIds,updateNote,buildBackup,defaultClipRange,validateResearchClip,migrateResearch,researchText};
});
