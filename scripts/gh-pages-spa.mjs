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

const domain = process.env.VITE_SITE_DOMAIN?.trim();
if (domain) {
  writeFileSync(join(dist, 'CNAME'), `${domain}\n`);
  console.log(`gh-pages-spa: wrote CNAME → ${domain}`);
}

console.log('gh-pages-spa: wrote 404.html and .nojekyll for GitHub Pages SPA routing');