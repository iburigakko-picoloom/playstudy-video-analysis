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
    let timer;
    const showFailure = () => {
      if (!media.isConnected) return;
      clearTimeout(timer);
      loading.innerHTML = '<b>動画を開けません。通信や動画形式を確認してください</b><button type="button">再試行</button>';
      loading.querySelector('button').onclick = () => {
        loading.innerHTML = '<span aria-hidden="true"></span><b>動画を読み込み中</b>';
        media.load();
        timer = setTimeout(() => { if (media.readyState < 1) showFailure(); }, 30000);
      };
    };
    media.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      loading.remove();
      current.durationSeconds = media.duration;
      current.missingSource = false;
      persist('videos');
    });
    media.addEventListener('error', showFailure);
    timer = setTimeout(() => { if (media.readyState < 1) showFailure(); }, 30000);
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
    toast(items.some(item => item.persistent === false)
      ? '動画を追加しました。再起動後は再選択が必要な場合があります'
      : relinkId ? '元動画を再関連付けしました' : `${added.length}本追加しました`);
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
