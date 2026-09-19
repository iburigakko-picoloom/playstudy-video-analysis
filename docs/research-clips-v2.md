# Research clips v2

## Changed files

- `public/playstudy/app.js`: active player gestures, research screens/dialogs, reference playback, memo entry points.
- `public/playstudy/player-gestures.js`: testable seek gesture state.
- `public/playstudy/data-store.js`: migration, clip validation, export, backup reference remapping.
- `public/playstudy/styles.css`: symmetric center controls, preview indicator, mobile research UI.
- `app/page.tsx`, `public/playstudy/index.html`, `public/launch/index.html`: v40 asset URLs.
- `public/sw.js`, `public/pwa.js`, `public/recover.html`: matching v40 cache/bootstrap URLs.
- `tests/research.test.mjs`, `tests/data-store.test.mjs`, `tests/player-gestures.test.mjs`, `tests/rendered-html.test.mjs`: new and updated regression tests.
- `package.json`: include research tests in the normal test command.
- `docs/research-clips-v2.md`: data compatibility and verification notes.

## Scope

Keep video import, local video storage, tags, and basic memo editing unchanged. Research uses the existing `themes` and `researchCards` collections and the existing atomic `ps2_snapshot_v1` store. No new media files, exports, cloud storage, or video copies are created.

## Stored data

- `themes`: add `summary: string` and `researchVersion: 2`. Existing IDs, tag IDs, and legacy fields remain.
- `researchCards`: new cards use `type: "clip"`, `researchId`, `videoId`, `memoId`, `startTime`, `endTime`, and `clipNote`, plus their existing unique `id`. `themeId` mirrors `researchId` for compatibility with existing helpers.
- Times are seconds. End must be greater than start and cannot exceed a known source duration. New clips require a memo belonging to the selected video. Imported scene/video cards can have `memoId: null`; their editor can link a memo later.
- Backups include references in metadata. Video-ID remapping also updates clip references. A deleted memo does not delete its clips or invalidate an otherwise valid backup.

## Migration

When research is first opened (or a memo is added), migrate in one atomic write. Old note-theme associations are imported before conversion. Note, scene, and video cards with available sources become reference clips, preserving their card IDs and legacy fields. Existing question/hypothesis/conclusion/next-action text is copied into one summary. Other cards remain available under “以前の記録”; their textual content is also included in the initial summary. Legacy images remain in their original records and are not converted to video clips. The migration is idempotent. Failed storage writes leave the original data intact.

## Interaction

- Research top: create a task, then select it from one vertical list.
- Detail: add video → select existing memo → edit range and insight → add. The same range editor is available from a saved memo's “研究に追加” action.
- Clip playback reads the existing source lazily, plays one clip at a time, and stops at its end. Navigation/backgrounding stops playback. Missing media points to the original video's recovery UI.
- Summary saves on field change or “保存”. Failed writes retain the current input for retry. Export includes the current summary draft and opens selectable text with a clipboard-copy button.
- Seek: release a short tap to jump to its absolute position. Drag previews a time and thumb relative to the starting playhead, committing only on release. A stationary hold of at least 350 ms (including jitter under 8 CSS px) does not seek. Cancellation, capture loss, rotation, and backgrounding discard the preview. Existing precision mode retains its 30-second drag span.
- Center controls use symmetric grid columns, anchored at 50% of the full video display stage, independent of the lower controls.

## Verification and limits

`npm test` passed: production build plus 59 tests. Tests exercise migration/idempotence, reference validation and restore remapping, both add flows, editing and failed writes, task navigation, summary/export, clip playback boundaries/replay/cleanup, and seek tap/hold/drag/cancel behavior. Existing PWA, storage, and gesture regressions remain in the suite.

Browser UI automation is unavailable in this environment. Before publishing, verify on Android and iOS: portrait/landscape center alignment, touch holds and release/cancellation, native select menus, dialog/keyboard sizing, actual video decoding and clip boundaries, and PWA cache updates. HTML video timing is bounded using animation frames and timeupdate; it is not a frame-exact native clip engine. This change does not claim to fix the earlier Android home-icon launch problem.

The local application cache version is v40. No public deployment is performed as part of this implementation-only request.
