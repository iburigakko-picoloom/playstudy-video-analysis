import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const client = new URL("../dist/client/", import.meta.url);
const execFileAsync = promisify(execFile);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("opens PlayStudy directly at the site root", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /id="app"/);
  assert.match(html, /href="\/playstudy\/styles\.css\?v=38"/);
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(html, /src="\/pwa\.js\?v=38"/);
  assert.match(html, /src="\/playstudy\/player-gestures\.js\?v=38"/);
  assert.match(html, /src="\/playstudy\/app\.js\?v=38"/);
  assert.doesNotMatch(html, /\/playstudy\/index\.html[^"']*redirect/i);
});

test("ships an early root-scoped landscape PWA bootstrap", async () => {
  const [manifestText, rootWorker, legacyWorker, pwaBootstrap, gestures, appScript, styles, pageSource] = await Promise.all([
    readFile(new URL("manifest.webmanifest", client), "utf8"),
    readFile(new URL("sw.js", client), "utf8"),
    readFile(new URL("playstudy/sw.js", client), "utf8"),
    readFile(new URL("pwa.js", client), "utf8"),
    readFile(new URL("playstudy/player-gestures.js", client), "utf8"),
    readFile(new URL("playstudy/app.js", client), "utf8"),
    readFile(new URL("playstudy/styles.css", client), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);

  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);

  assert.deepEqual(manifest.display_override, ["standalone", "minimal-ui"]);
  assert.equal(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), true);

  assert.match(pwaBootstrap, /beforeinstallprompt/);
  assert.match(pwaBootstrap, /navigator\.serviceWorker\.register/);
  assert.match(pwaBootstrap, /updateViaCache: "none"/);
  assert.match(pwaBootstrap, /playstudy-pwa-change/);
  assert.match(pwaBootstrap, /playstudy_pwa_installed_v3/);
  assert.match(pwaBootstrap, /installed: installedKnown\(\)/);
  assert.match(pwaBootstrap, /rememberInstalled\(\)/);
  assert.match(pwaBootstrap, /window\.isSecureContext/);
  assert.doesNotMatch(appScript, /navigator\.serviceWorker\.register/);
  assert.match(appScript, /id="install-app"/);
  assert.match(appScript, /id="install-guide"/);
  assert.match(appScript, /id="install-copy"/);
  assert.match(appScript, /\$\('#install-guide'\)\?\.showModal\(\)/);
  assert.doesNotMatch(appScript, /\(state\.canInstall\|\|iosInstallCandidate\(\)\)\?[^:]+:''/);
  assert.match(rootWorker, /playstudy-shell-/);
  assert.match(rootWorker, /v38/);
  assert.match(rootWorker, /const SCOPE_URL = new URL\(self\.registration\.scope\)/);
  assert.match(rootWorker, /cache\.addAll\(APP_SHELL/);
  assert.match(rootWorker, /navigationPreload\?\.disable/);
  assert.match(rootWorker, /name\.startsWith\(CACHE_PREFIX\)/);
  assert.match(rootWorker, /new Response\(/);
  assert.doesNotMatch(rootWorker, /share-target/);
  assert.match(legacyWorker, /registration\.unregister\(\)/);
  assert.match(rootWorker, /if \(!response\.ok\) throw new Error/);
  assert.match(rootWorker, /appNavigation\(\)/);
  assert.match(rootWorker, /player-gestures\.js\?v=38/);
  assert.match(rootWorker, /const SHELL_URL = scopedUrl\("playstudy\/index.html"\)/);
  assert.doesNotMatch(legacyWorker, /client\.navigate|caches\.delete/);
  assert.match(pageSource, /<script defer src="\/pwa\.js\?v=38"/);
  assert.match(pageSource, /<script defer src="\/playstudy\/player-gestures\.js\?v=38"/);
  assert.match(pageSource, /<script defer src="\/playstudy\/app\.js\?v=38"/);
  assert.match(pageSource, /href="\/playstudy\/styles\.css\?v=38"/);
  assert.match(pageSource, /className="boot-screen"/);
  assert.match(gestures, /createTapSequence/);
  assert.match(appScript, /id='video-import-progress'/);
  assert.match(appScript, /端末に動画を保存しています/);
  assert.match(appScript, /最初の場面からサムネイルを作っています/);
  assert.match(styles, /\.video-import-progress/);
  assert.doesNotMatch(appScript, /navigator\.share/);
  assert.match(appScript, /ホーム画面に追加/);
  assert.match(appScript, /requestVideoFrameCallback/);
  assert.match(appScript, /function waitForVideoReady\(source,events,timeout=7000\)/);
  assert.match(appScript, /candidates=\[Math\.min\(\.12/);
  assert.match(appScript, /const posterJobs=new Map\(\)/);
  assert.match(appScript, /async function ensureFirstFramePoster\(item\)/);
  assert.match(appScript, /if\(state\.screen==='library'\).*backfillFirstFramePosters\(\)/s);
  assert.match(appScript, /document\.body\.classList\.toggle\('player-active'/);
  assert.match(styles, /html\.player-active,body\.player-active/);
  assert.match(styles, /grid-template-rows:minmax\(0,1fr\) 50px 48px/);
  assert.doesNotMatch(pageSource, /redirect\(/);
  assert.doesNotMatch(pageSource, /useEffect|document\.createElement\("script"\)/);
});

test("builds a complete root GitHub Pages PWA", async () => {
  await execFileAsync(process.execPath, ["scripts/build-github-pages.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "manatocookietwitter-lang/manatocookietwitter-lang.github.io",
    },
  });

  const pages = new URL("../github-pages-dist/", import.meta.url);
  const [html, legacyHtml, launchHtml, manifestText, pwaBootstrap, worker, legacyWorker, gestures] = await Promise.all([
    readFile(new URL("index.html", pages), "utf8"),
    readFile(new URL("playstudy/index.html", pages), "utf8"),
    readFile(new URL("launch/index.html", pages), "utf8"),
    readFile(new URL("manifest.webmanifest", pages), "utf8"),
    readFile(new URL("pwa.js", pages), "utf8"),
    readFile(new URL("sw.js", pages), "utf8"),
    readFile(new URL("playstudy/sw.js", pages), "utf8"),
    readFile(new URL("playstudy/player-gestures.js", pages), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(legacyHtml, html);
  assert.equal(launchHtml, html);
  assert.match(html, /name="playstudy-root" content="\/"/);
  assert.match(html, /src="\/pwa\.js\?v=38"/);
  assert.match(html, /src="\/playstudy\/player-gestures\.js\?v=38"/);
  assert.match(html, /src="\/playstudy\/app\.js\?v=38"/);
  assert.match(pwaBootstrap, /serviceWorker\.register/);
  assert.match(worker, /playstudy-shell-/);
  assert.doesNotMatch(legacyWorker, /client\.navigate|caches\.delete/);
  assert.match(gestures, /createTapSequence/);

  await execFileAsync(process.execPath, ["scripts/build-github-pages.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "manatocookietwitter-lang/playstudy-video-analysis",
    },
  });
  const projectManifest = JSON.parse(await readFile(new URL("manifest.webmanifest", pages), "utf8"));
  const projectLegacyHtml = await readFile(new URL("playstudy/index.html", pages), "utf8");
  assert.equal(projectManifest.id, "/playstudy-video-analysis/");
  assert.equal(projectManifest.start_url, "/playstudy-video-analysis/");
  assert.equal(projectManifest.scope, "/playstudy-video-analysis/");
  assert.match(projectLegacyHtml, /name="playstudy-root" content="\/playstudy-video-analysis\/"/);
  assert.match(projectLegacyHtml, /src="\/playstudy-video-analysis\/playstudy\/app\.js\?v=38"/);
});

test("ships one unified player-first workflow", async () => {
  const [appScript, styles] = await Promise.all([
    readFile(new URL("public/playstudy/app.js", root), "utf8"),
    readFile(new URL("public/playstudy/styles.css", root), "utf8"),
  ]);
  const unified = appScript.slice(appScript.indexOf("/* ===== unified watch + memo experience ===== */"));

  assert.match(unified, /state\.settings\.doubleTapSkip/);
  assert.match(unified, /now-lastTap<320/);
  assert.match(unified, /id="corner-frame-back"/);
  assert.match(unified, /id="corner-speed-down"/);
  assert.match(unified, /id="corner-speed-value"/);
  assert.match(unified, /changeSpeed\(-1\)/);
  assert.match(unified, /setSpeed\(1\)/);
  assert.match(unified, /id="quick-note-title"/);
  assert.match(unified, /id="quick-note-body"/);
  assert.match(unified, /id="quick-tag-add"/);
  assert.match(unified, /screenName==='record'/);
  assert.match(unified, /nav=function\(\)\{return ''\}/);
  assert.match(unified, /installed=installedMode\(\)/);
  assert.match(appScript, /STORED_VIDEO_MODES\.has\(v\.storageMode\)\)v\.src=''/);
  assert.match(appScript, /function videosForStorage\(dropPosters=false\)/);
  assert.match(appScript, /delete copy\.thumbnails/);
  assert.match(appScript, /let videoDbPromise=null/);
  assert.match(appScript, /const videoHydrationJobs=new Map\(\)/);
  assert.match(appScript, /STORED_VIDEO_MODES=new Set\(\['indexeddb','handle','opfs'\]\)/);
  assert.match(appScript, /navigator\.storage\.getDirectory\(\)/);
  assert.match(appScript, /handle\.createWritable\(\)/);
  assert.match(appScript, /async function storeVideoFile\(id,file\)/);
  assert.match(appScript, /async function migrateIndexedVideo\(v,blob\)/);
  assert.match(appScript, /storageMode=storage\.mode/);
  assert.match(appScript, /次回から選び直しは不要です/);
  assert.match(appScript, /hydrateVideo\(current,true\)/);
  assert.match(appScript, /if\(state\.simpleMode&&!force\)return/);
  assert.match(unified, /保存した動画を読み込んでいます/);
  assert.match(styles, /\.video-restore-status/);
  assert.match(unified, /installAction=installed\?'':/);
  assert.match(unified, /\$\{installAction\}<\/section>/);
  assert.doesNotMatch(unified, /installed\?'アプリで使用中'/);
  assert.match(unified, /setTimeout\(hideChrome,1000\)/);
  assert.match(unified, /toggleChrome\(\);tapTimer=setTimeout/);
  assert.match(unified, /if\(!vid\)\{chrome\?\.classList\.add\('is-visible'\)/);
  assert.doesNotMatch(unified, /詳しくメモ/);
  assert.doesNotMatch(unified, /simple-advanced|simple-mode-toggle/);
  assert.doesNotMatch(unified, /id="note-kind"|id="note-range"|<label>種別<\/label>/);
  assert.match(styles, /\.unified-player>\.topbar/);
  assert.match(styles, /\.unified-player \.timeline-card/);
  assert.match(styles, /\.unified-player \.controls/);
  assert.match(styles, /\.unified-player \.tools/);
  assert.match(styles, /\.corner-player-controls/);
  assert.match(styles, /\.player-floating-chrome\.is-visible/);
});

test("ships a minimal native-like library and full-screen mobile player", async () => {
  const [appScript, styles] = await Promise.all([
    readFile(new URL("public/playstudy/app.js", root), "utf8"),
    readFile(new URL("public/playstudy/styles.css", root), "utf8"),
  ]);
  const focus = appScript.slice(appScript.indexOf("/* ===== mobile focus experience"));
  const minimalStyles = styles.slice(styles.indexOf("/* ===== native minimal mobile experience"));

  assert.match(focus, /class="focus-library-toolbar"/);
  assert.match(focus, />動画を追加<\/button>/);
  assert.match(focus, /class="app-shell focus-player"/);
  assert.match(focus, /id="focus-stage"/);
  assert.match(focus, /id="focus-hud"/);
  assert.match(focus, /id="focus-comment-open"/);
  assert.match(focus, /id="focus-comment-sheet"/);
  assert.match(focus, /id="focus-comment-anchor"/);
  assert.match(focus, /保存位置/);
  assert.match(focus, /この時刻に保存/);
  assert.match(focus, /動画の時間順/);
  assert.match(focus, /id="focus-comment-count"/);
  assert.match(focus, /id="focus-comment-tags"[^>]*role="group"/);
  assert.match(focus, /data-focus-comment-tag=/);
  assert.match(focus, /tagIds=\$\$\('\[data-focus-comment-tag\]:checked',sheet\)/);
  assert.match(focus, /focusMemoTags\(note\)/);
  assert.match(focus, /data-focus-comment-tab="compose"[^>]*>メモ/);
  assert.match(focus, /data-focus-comment-tab="saved"[^>]*>登録済み/);
  assert.match(focus, /id="focus-comment-history"[^>]*hidden/);
  assert.match(focus, /focusSortedNotes\(notes\).*sort\(\(a,b\)=>\(a\.time\|\|0\)-\(b\.time\|\|0\)\)/s);
  assert.match(focus, /id="focus-memo-markers"/);
  assert.doesNotMatch(focus, /data-focus-memo-marker/);
  assert.match(focus, /id="focus-seek-hit" aria-hidden="true"/);
  assert.match(focus, /seekStartTime=vid\.currentTime/);
  assert.match(focus, /calculateSeekTime\(\{mode:'drag',startTime:seekStartTime/);
  assert.match(focus, /calculateSeekTime\(\{mode:'tap',currentX:event\.clientX/);
  assert.match(focus, /Math\.abs\(distance\)<6/);
  assert.match(focus, /if\(event\.target\.closest\('\.focus-seek-hit'\)\)\{frameExitClickUntil=0;return\}/);
  assert.match(focus, /setCommentTab\('saved',true\)/);
  assert.match(focus, /メモを開く、\$\{notes\.length\}件/);
  assert.match(focus, /focusMemoParts\(text\)/);
  assert.match(focus, /メモを入力してください/);
  assert.doesNotMatch(focus, /id="focus-comment-cancel"/);
  assert.doesNotMatch(focus, /コメントを保存しました/);
  assert.match(focus, /state\.focusCommentAnchor=readFocusDraft\(current.id\)\?\.time\?\?vid\.currentTime/);
  assert.match(focus, /state\.focusResumeAfterComment=!vid\.paused/);
  assert.doesNotMatch(focus, /event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing/);
  assert.match(focus, /createTapSequence\(\{windowMs:TAP_WINDOW_MS\}\)/);
  assert.match(focus, /effect\.cumulative/);
  assert.match(focus, /data-focus-frame="-1"[^>]*>−コマ送り/);
  assert.match(focus, /data-focus-frame="1"[^>]*>＋コマ送り/);
  assert.match(focus, /class="focus-frame-controls" role="group" aria-label="コマ送り"/);
  assert.doesNotMatch(focus, /class="focus-frame-group"/);
  assert.match(focus, /setPointerCapture/);
  assert.match(focus, /releasePointerCapture/);
  assert.match(focus, /state\.settings\.frameHoldMs\|\|160/);
  assert.match(focus, /holdDelay=setTimeout\(\(\)=>\{repeating=true/);
  assert.match(focus, /on\(window,'pointerup',event=>stop\(true,event\),\{capture:true\}\)/);
  assert.match(focus, /on\(window,'pointercancel',event=>stop\(false,event\),\{capture:true\}\)/);
  assert.match(focus, /on\(button,'lostpointercapture'/);
  assert.match(focus, /suppressFrameClickUntil=performance\.now\(\)\+420/);
  assert.match(focus, /stage\.classList\.toggle\('is-frame-mode',frameMode\)/);
  assert.match(focus, /if\(!frameMode\|\|event\.target\.closest\('\[data-focus-frame\]'\)\)return/);
  assert.match(focus, /frameExitClickUntil=performance\.now\(\)\+520/);
  assert.match(focus, /on\(window,'pointerup',releaseHold,\{capture:true\}\)/);
  assert.match(focus, /on\(window,'blur',stopTransientInput\)/);
  assert.match(focus, /fmt\(vid\.currentTime,performance\.now\(\)<frameTimePreciseUntil\)/);
  assert.match(focus, /holdBoost=window\.PlayStudyGestures\.createHoldBoost/);
  assert.match(focus, /current\.lastSpeed=holdBoost\?\.savedRate\?\?vid\.playbackRate/);
  assert.match(focus, /if\(state\.screen==='player'\)\{bindFocusPlayer\(\);bindFocusVideoGestures\(\);return\}/);
  assert.match(focus, /function bindFocusVideoGestures\(\)/);
  assert.match(focus, /contentX:\(mid\.x-rect\.left-rect\.width\/2-current\.panX\)\/zoom/);
  assert.match(focus, /zoom=clamp\(pinch\.zoom\*distance\/pinch\.distance,1,8\);current\.zoom=zoom/);
  assert.doesNotMatch(focus, /advancedPlayer\(\)/);
  assert.doesNotMatch(focus, /この端末で完結|見る、止める、気づきを残す|現在の場面|例：踏み込む/);
  assert.doesNotMatch(focus, /if\(tab==='compose'\)setTimeout\(\(\)=>\$\('#focus-comment-input'\)\?\.focus\(\),120\)/);

  assert.match(minimalStyles, /body\.player-active \.focus-player\{\s*position:fixed!important;\s*inset:0!important/);
  assert.match(minimalStyles, /height:100dvh!important/);
  assert.match(minimalStyles, /\.focus-comment-sheet\.analysis-panel\{\s*position:fixed!important/);
  assert.match(minimalStyles, /box-shadow:none!important/);
  assert.match(minimalStyles, /\.focus-stage\.is-frame-mode \.focus-play\{visibility:hidden;opacity:0;pointer-events:none/);
  assert.match(minimalStyles, /\.focus-stage\.is-frame-mode \.focus-center-controls\{visibility:hidden;opacity:0;pointer-events:none/);
  assert.match(minimalStyles, /\.focus-frame-controls\{position:absolute;right:max\(clamp\(44px,9vw,78px\)/);
  assert.match(minimalStyles, /\.focus-frame-controls \.focus-frame-button\{min-width:92px/);
  assert.match(minimalStyles, /justify-content:space-between;pointer-events:none/);
  assert.match(minimalStyles, /@media\(orientation:portrait\)/);
  assert.match(minimalStyles, /@media\(orientation:portrait\)\{\s*\.focus-bottom-controls\{padding-bottom:max\(22px,calc\(env\(safe-area-inset-bottom\) \+ 8px\)\)\}/);
  assert.match(minimalStyles, /@media\(orientation:landscape\) and \(max-height:520px\)/);
  assert.match(minimalStyles, /@media\(orientation:landscape\) and \(max-height:520px\)[\s\S]*?\.focus-progress-row input\{height:32px\}/);
  assert.match(minimalStyles, /min-width:44px/);
  assert.match(minimalStyles, /font-size:16px/);
  assert.match(minimalStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(minimalStyles, /\.focus-comment-anchor-row/);
  assert.match(minimalStyles, /\.focus-comment-history-head/);
  assert.match(minimalStyles, /\.focus-memo-text/);
  assert.match(minimalStyles, /\.focus-memo-marker\{[^}]*background:#2f6df6/);
  assert.match(minimalStyles, /\.focus-memo-marker\{[^}]*pointer-events:none/);
  assert.match(minimalStyles, /\.focus-memo-markers\{[^}]*top:50%/);
  assert.match(minimalStyles, /transform:translate\(-50%,-50%\)/);
  assert.match(minimalStyles, /\.focus-seek-hit\{[^}]*touch-action:none/);
  assert.match(minimalStyles, /\.focus-seek-hit\{[^}]*pointer-events:auto/);
  assert.match(minimalStyles, /\.focus-seek-track input\{[^}]*pointer-events:none/);
  assert.match(minimalStyles, /\.focus-comment-tabs\{/);
  assert.match(minimalStyles, /\.focus-comment-tags\{[^}]*overflow-x:auto/);
  assert.match(minimalStyles, /\.focus-stage\{touch-action:none!important\}/);
  assert.doesNotMatch(minimalStyles, /radial-gradient|backdrop-filter:blur|\.focus-open-card/);
});

test("ships compact editable research links", async () => {
  const [appScript, styles] = await Promise.all([
    readFile(new URL("public/playstudy/app.js", root), "utf8"),
    readFile(new URL("public/playstudy/styles.css", root), "utf8"),
  ]);

  assert.match(appScript, /\['video','動画'\]/);
  assert.match(appScript, /\['note','メモ'\]/);
  assert.match(appScript, /data-edit-research-card=/);
  assert.match(appScript, /id="ra-delete"/);
  assert.match(appScript, /function removeResearchCard\(id\)/);
  assert.match(appScript, /data-theme-tag=/);
  assert.match(appScript, /class="research-insights"/);
  assert.match(styles, /\/\* Compact research workspace \*\//);
  assert.match(styles, /\.research-page \.lane\{min-height:136px/);
});

test("uses one plain memo field for create and edit", async () => {
  const appScript = await readFile(new URL("public/playstudy/app.js", root), "utf8");
  const memoOverride = appScript.slice(appScript.indexOf("function focusMemoText"));

  assert.match(memoOverride, /id="note-text"/);
  assert.match(memoOverride, /function focusMemoText\(note\)/);
  assert.match(memoOverride, /function focusMemoParts\(value\)/);
  assert.doesNotMatch(memoOverride, /id="note-title"/);
  assert.doesNotMatch(memoOverride, /id="note-body"/);
});
