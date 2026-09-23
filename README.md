# PlayStudy

動画を開き、横画面で再生しながら気づきをメモできる、端末内完結型のスポーツ動画学習PWAです。

## 主な機能

- 動画の先頭フレームからサムネイルを自動生成
- 再生・一時停止・コマ送り・速度変更
- 再生位置に紐づくメモとシーン管理
- 横画面の再生中はページスクロールなし
- PWAとしてホーム画面に追加可能
- 動画とメモはブラウザ内に保存

## 開発

```bash
npm ci
npm test
npm run dev
```

## GitHub Pages

`main` ブランチへのpushで `.github/workflows/pages.yml` が静的PWAを作成し、GitHub Pagesへ公開します。リポジトリ名を含むURLでもService WorkerとManifestのスコープが自動調整されます。

## Android APK

最新のインストール・更新用APK: [PlayStudy v1.0.2](https://iburigakko-picoloom.github.io/playstudy-video-analysis/downloads/PlayStudy-v1.0.2.apk)。同じ署名のAPKで上書き更新してください。

`android/` は現在のWeb画面を同梱してオフライン起動するAndroidアプリです。動画はAndroidのファイル選択画面から参照権限を保持し、元ファイルを複製せずに再生します。端末側で元動画を移動・削除した場合は再関連付けが必要です。

GitHub Actions の `Build PlayStudy APK` は署名済みAPKを成果物として保存します。更新時は `versionCode` を増やし、同じ `applicationId` と署名鍵でビルドしたAPKを上書きインストールします。`PLAYSTUDY_KEYSTORE_BASE64` と `PLAYSTUDY_STORE_PASSWORD` をGitHub Secretsに保存し、署名鍵のバックアップも安全な場所に保管してください。PWAとAPKは別アプリのため、ブラウザ内データは自動移行されません。
