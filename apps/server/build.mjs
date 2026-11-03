// Bundles the server (with the workspace's shared code) into dist/index.js. npm dependencies stay
// external and are installed next to it.

import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.entries(pkg.dependencies)
  .filter(([, version]) => !version.startsWith('workspace:'))
  .flatMap(([name]) => [name, `${name}/*`]);

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  logLevel: 'info',
});
