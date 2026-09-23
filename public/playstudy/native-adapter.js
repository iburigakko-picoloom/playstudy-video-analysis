/* Android APK bridge. The browser/PWA path remains unchanged. */
(() => {
  const native = window.PlayStudyNative;
  if (!native) return;

  STORED_VIDEO_MODES.add('native-uri');
  const webHydrateVideo = hydrateVideo;
  hydrateVideo = async function (item, force = false) {
    if (item?.storageMode !== 'native-uri') return webHydrateVideo(item, force);
    const available = native.hasMedia(item.id);
    item.src = available ? native.mediaUrl(item.id) : '';
    item.missingSource = !available;
    return item;
  };

  const originalRelink = relinkFile;
  relinkFile = async function (file, id) {
    if (native) return native.pickVideos(id);
    return originalRelink(file, id);
  };

  document.addEventListener('click', (event) => {
    const input = event.target?.closest?.('#video-file, #relink-file-global');
    if (!input) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const relinkId = input.id === 'relink-file-global' ? (state.relinkVideoId || activeV()?.id || '') : '';
    native.pickVideos(relinkId);
  }, true);

  window.playStudyNativeFilesSelected = async (items, relinkId) => {
    if (!Array.isArray(items) || !items.length) return;
    const added = [];
    for (const item of items) {
      const id = relinkId || item.id;
      const src = native.mediaUrl(id);
      const meta = await probeVideo(src);
      const poster = await captureFirstFrame(src);
      if (relinkId) {
        const current = video(id);
        if (!current) continue;
        current.src = src;
        current.storageMode = 'native-uri';
        current.fileName = item.name;
        current.mimeType = item.type;
        current.durationSeconds = meta.duration;
        current.durationLabel = fmt(meta.duration);
        current.poster = poster || current.poster;
        current.missingSource = false;
        added.push(id);
        break;
      }
      const folders = state.folders.filter(folder => folder.projectId === state.activeProject);
      state.videos.unshift({
        id, title: item.name.replace(/\.[^.]+$/, ''), fileName: item.name,
        mimeType: item.type, date: new Date().toISOString().slice(0, 10),
        durationLabel: fmt(meta.duration), durationSeconds: meta.duration,
        src, poster, projectId: state.activeProject,
        folderId: state.activeFolder !== 'all' ? state.activeFolder : (folders[0]?.id || ''),
        favorite: false, last: 0, lastSpeed: 1, fps: 30,
        sportName: project(state.activeProject)?.sportName || '', athlete: '',
        opponent: '', eventName: '', tagIds: [], freeMemo: '',
        storageMode: 'native-uri', missingSource: false
      });
      added.push(id);
    }
    if (!persist('videos')) return toast('動画情報を保存できませんでした');
    if (state.simpleMode && added.length === 1 && !relinkId) route('player', added[0]);
    else render();
    toast(relinkId ? '元動画を再関連付けしました' : `${added.length}本追加しました`);
  };

  for (const item of state.videos) {
    if (item.storageMode === 'native-uri') {
      item.src = native.hasMedia(item.id) ? native.mediaUrl(item.id) : '';
      item.missingSource = !item.src;
    }
  }
  render();
})();
