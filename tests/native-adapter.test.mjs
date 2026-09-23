import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/playstudy/native-adapter.js', import.meta.url), 'utf8');

function boot() {
  const picks = [];
  const state = {
    videos: [], folders: [{ id: 'folder', projectId: 'project' }],
    activeProject: 'project', activeFolder: 'all', simpleMode: false
  };
  let writes = 0;
  const native = {
    pickVideos: id => picks.push(id),
    hasMedia: () => true,
    mediaUrl: id => `https://appassets.androidplatform.net/native-media/${id}`
  };
  const document = { addEventListener(_type, callback) { this.click = callback; } };
  const context = {
    window: { PlayStudyNative: native }, document, STORED_VIDEO_MODES: new Set(['opfs']),
    state, hydrateVideo: async video => video, relinkFile: async () => {},
    activeV: () => state.videos[0], video: id => state.videos.find(v => v.id === id),
    probeVideo: async () => ({ duration: 12.5 }), captureFirstFrame: async () => 'data:image/jpeg;base64,AA',
    fmt: n => String(n), project: () => ({ sportName: '' }),
    persist: () => { writes++; return true; }, render: () => {}, route: () => {}, toast: () => {},
    Date
  };
  runInNewContext(source, context);
  return { context, state, picks, document, writes: () => writes };
}

test('APK imports a reference without copying the video into browser storage', async () => {
  const app = boot();
  await app.context.window.playStudyNativeFilesSelected([{ id: 'v1', name: 'clip.mp4', type: 'video/mp4' }], '');
  assert.equal(app.state.videos[0].storageMode, 'native-uri');
  assert.equal(app.state.videos[0].src, 'https://appassets.androidplatform.net/native-media/v1');
  assert.equal(app.state.videos[0].poster, 'data:image/jpeg;base64,AA');
  assert.equal(app.writes(), 1);
  assert.equal(app.context.STORED_VIDEO_MODES.has('native-uri'), true);
});

test('APK relink keeps the same video ID, preserving memos and research links', async () => {
  const app = boot();
  app.state.videos.push({ id: 'old', missingSource: true });
  await app.context.window.playStudyNativeFilesSelected([{ id: 'old', name: 'moved.mp4', type: 'video/mp4' }], 'old');
  assert.equal(app.state.videos.length, 1);
  assert.equal(app.state.videos[0].id, 'old');
  assert.equal(app.state.videos[0].missingSource, false);
  const event = {
    target: { closest: selector => selector ? { id: 'relink-file-global' } : null },
    preventDefault() {}, stopImmediatePropagation() {}
  };
  app.document.click(event);
  assert.deepEqual(app.picks, ['old']);
});
