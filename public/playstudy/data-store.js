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
          if(!object(item)||typeof item.id!=='string'||!item.id||ids.has(item.id))throw new Error(key+' のIDが正しくありません');
          ids.add(item.id);
        }
      }else if(!object(value))throw new Error(key+' の形式が正しくありません');
      data[key]=clone(value);
    }
    const videoIds=new Set(data.videos.map(item=>item.id));
    for(const key of ['notes','scenes','tagEvents','drawings']){
      for(const item of data[key]){
        if(!videoIds.has(item.videoId))throw new Error('元動画がない記録が含まれています');
        for(const field of ['time','start','end'])if(item[field]!=null&&(!Number.isFinite(item[field])||item[field]<0))throw new Error('記録の時刻が正しくありません');
        if(item.start!=null&&item.end!=null&&item.end<item.start)throw new Error('区間の終了時刻が正しくありません');
      }
    }
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
    data.researchCards.forEach(item=>{if(item.type==='video'&&item.refId===oldId)item.refId=newId});
  }
  function linkedThemeIds(cards,noteId){
    return [...new Set(cards.filter(card=>card.type==='note'&&card.refId===noteId).map(card=>card.themeId))];
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
  return {createStore,validateBackup,remapVideo,linkedThemeIds,updateNote};
});
