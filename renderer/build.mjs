// Bundles the renderer (src/, with three.js) into one minified script, written into the skill's
// assets, where the build script embeds it in every card page (or to $OUT, to try it first).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const three = JSON.parse(readFileSync(new URL('./node_modules/three/package.json', import.meta.url))).version;

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  banner: {
    js: `/* greeting-card renderer, bundled with three.js ${three} (MIT, https://threejs.org; see licenses/three.js-LICENSE.txt) */`,
  },
  outfile: process.env.OUT ?? '../interactive-greeting-card/assets/greeting-card.js',
  logLevel: 'info',
});
