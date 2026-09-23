/* Android APK bridge. The browser/PWA path remains unchanged. */
(() => {
  const native = window.PlayStudyNative;
  if (!native) return;

  const webRoute = route;
  route = function (screenName, id) {
    native.setPlayerOrientation(screenName === 'player');
    return webRoute(screenName, id);
  };
  native.setPlayerOrientation(state.screen === 'player');

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

  const webBindFocusPlayer = bindFocusPlayer;
  bindFocusPlayer = function () {
    webBindFocusPlayer();
    const current = activeV();
    const media = document.querySelector('#main-video');
    if (current?.storageMode !== 'native-uri' || !media) return;
    const loading = document.createElement('div');
    loading.className = 'focus-player-status';
    loading.setAttribute('role', 'status');
    loading.innerHTML = '<span aria-hidden="true"></span><b>動画を読み込み中</b>';
    if (media.readyState < 1) media.after(loading);
    let fallback = false;
    let timer;
    const showFailure = () => {
      if (!media.isConnected) return;
      loading.remove();
      current.src = '';
      current.missingSource = true;
      persist('videos');
      render();
      toast('動画を再生できません。元動画を再選択してください');
    };
    const tryFallback = () => {
      if (!media.isConnected) return;
      clearTimeout(timer);
      if (fallback) return showFailure();
      fallback = true;
      const label = loading.querySelector('b');
      if (label) label.textContent = '別の方法で動画を開いています';
      const uri = native.contentUrl(current.id);
      if (!uri) return showFailure();
      media.src = uri;
      media.load();
      timer = setTimeout(() => { if (media.readyState < 1) showFailure(); }, 10000);
    };
    media.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      loading.remove();
      current.durationSeconds = media.duration;
      current.missingSource = false;
      persist('videos');
    });
    media.addEventListener('error', tryFallback);
    timer = setTimeout(() => { if (media.readyState < 1) tryFallback(); }, 8000);
    focusPlayerController?.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  };

  window.playStudyNativeFilesSelected = (items, relinkId) => {
    if (!Array.isArray(items) || !items.length) return;
    const added = [];
    for (const item of items) {
      const id = relinkId || item.id;
      const src = native.mediaUrl(id);
      if (relinkId) {
        const current = video(id);
        if (!current) continue;
        current.src = src;
        current.storageMode = 'native-uri';
        current.fileName = item.name;
        current.mimeType = item.type;
        current.missingSource = false;
        added.push(id);
        break;
      }
      const folders = state.folders.filter(folder => folder.projectId === state.activeProject);
      state.videos.unshift({
        id, title: item.name.replace(/\.[^.]+$/, ''), fileName: item.name,
        mimeType: item.type, date: new Date().toISOString().slice(0, 10),
        durationLabel: '--:--', durationSeconds: 0,
        src, poster: '', projectId: state.activeProject,
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

  window.playStudyNativeMetadata = item => {
    const current = video(item?.id);
    if (!current) return;
    if (Number.isFinite(item.durationSeconds) && item.durationSeconds > 0) {
      current.durationSeconds = item.durationSeconds;
      current.durationLabel = fmt(item.durationSeconds);
    }
    if (typeof item.poster === 'string' && item.poster.startsWith('data:image/jpeg;base64,')) {
      current.poster = item.poster;
    }
    persist('videos');
    if (state.screen === 'library') render();
    else if (activeV()?.id === current.id && current.poster) {
      const media = document.querySelector('#main-video');
      if (media) media.poster = current.poster;
    }
  };

  for (const item of state.videos) {
    if (item.storageMode === 'native-uri') {
      item.src = native.hasMedia(item.id) ? native.mediaUrl(item.id) : '';
      item.missingSource = !item.src;
    }
  }
  render();
})();
