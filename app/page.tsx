import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="/playstudy/styles.css?v=23"
        precedence="default"
      />
      <div id="app">
        <main className="boot-screen" role="status" aria-live="polite">
          <span className="boot-mark" aria-hidden="true">P</span>
          <b>PlayStudy</b>
          <span data-boot-message>起動中…</span>
          <Link className="boot-retry" href="/">再読み込み</Link>
        </main>
      </div>
      <input id="video-file" type="file" accept="video/*" multiple hidden />
      <input id="relink-file-global" type="file" accept="video/*" hidden />
      <script defer src="/pwa.js?v=23" data-playstudy="pwa" />
      <script defer src="/playstudy/player-gestures.js?v=23" data-playstudy="gestures" />
      <script defer src="/playstudy/app.js?v=23" data-playstudy="app" />
    </>
  );
}
