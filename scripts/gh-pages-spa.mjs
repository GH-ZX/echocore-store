import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('gh-pages-spa: dist/index.html not found — run vite build first');
  process.exit(1);
}

copyFileSync(index, join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '\n');
console.log('gh-pages-spa: wrote 404.html and .nojekyll for GitHub Pages SPA routing');