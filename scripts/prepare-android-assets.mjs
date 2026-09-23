import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'android', 'app', 'src', 'main', 'assets');
const drawable = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable');
await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
const publicRoot = join(root, 'public');
await cp(publicRoot, assets, {
  recursive: true,
  filter: source => relative(publicRoot, source).split(sep)[0] !== 'downloads'
});
await mkdir(drawable, { recursive: true });
await cp(join(root, 'public', 'playstudy', 'icons', 'icon-192.png'), join(drawable, 'playstudy_icon.png'));
console.log(`Android assets copied from ${join(root, 'public')}`);
