import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(projectRoot, "github-pages-dist");
const publicRoot = join(projectRoot, "public");
const [ownerName = "", repositoryName = ""] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
const defaultBasePath = repositoryName && repositoryName.toLowerCase() !== `${ownerName}.github.io`.toLowerCase()
  ? `/${repositoryName}/`
  : "/";
const basePath = `/${(process.env.PAGES_BASE_PATH || defaultBasePath || "/playstudy-video-analysis/").replace(/^\/+|\/+$/g, "")}/`
  .replace(/^\/\/$/, "/");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "playstudy"), { recursive: true });
await mkdir(join(outputRoot, "launch"), { recursive: true });

let html = await readFile(join(publicRoot, "playstudy", "index.html"), "utf8");
html = html
  .replace('<meta name="playstudy-root" content="/" />', `<meta name="playstudy-root" content="${basePath}" />`)
  .replaceAll('href="/manifest.webmanifest"', `href="${basePath}manifest.webmanifest"`)
  .replaceAll('href="/playstudy/', `href="${basePath}playstudy/`)
  .replaceAll('src="/playstudy/', `src="${basePath}playstudy/`)
  .replaceAll('src="/pwa.js', `src="${basePath}pwa.js`);
await writeFile(join(outputRoot, "index.html"), html);
await writeFile(join(outputRoot, "playstudy", "index.html"), html);
await writeFile(join(outputRoot, "launch", "index.html"), html);

const manifest = JSON.parse(await readFile(join(publicRoot, "manifest.webmanifest"), "utf8"));
manifest.id = basePath;
manifest.start_url = basePath;
manifest.scope = basePath;
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: `${basePath}${icon.src.replace(/^\//, "")}`,
}));
await writeFile(join(outputRoot, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);

await cp(join(publicRoot, "sw.js"), join(outputRoot, "sw.js"));
await cp(join(publicRoot, "pwa.js"), join(outputRoot, "pwa.js"));
await cp(join(publicRoot, "playstudy", "sw.js"), join(outputRoot, "playstudy", "sw.js"));
await cp(join(publicRoot, "playstudy", "player-gestures.js"), join(outputRoot, "playstudy", "player-gestures.js"));
await cp(join(publicRoot, "playstudy", "app.js"), join(outputRoot, "playstudy", "app.js"));
await cp(join(publicRoot, "playstudy", "styles.css"), join(outputRoot, "playstudy", "styles.css"));
await cp(join(publicRoot, "playstudy", "icons"), join(outputRoot, "playstudy", "icons"), { recursive: true });
await writeFile(join(outputRoot, ".nojekyll"), "");

console.log(`GitHub Pages bundle ready: ${outputRoot}`);
