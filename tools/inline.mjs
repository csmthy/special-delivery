// Post-build: produce one self-contained HTML file that runs from file:// (double-click), no server.
import fs from 'node:fs';
import path from 'node:path';
const dist = process.argv[2] || 'dist';
const out = process.argv[3] || 'dist/Special-Delivery.html';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(dist, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, f) => {
  let js = fs.readFileSync(path.join(dist, f), 'utf8');
  // the dev-tools chunk is only loaded with ?dev; drop the dynamic import so nothing external is referenced
  js = js.replace(/import\(\s*[`"']\.\/dev-[^`"']+\.js[`"']\s*\)/g, 'Promise.reject(new Error("dev tools are not bundled in the single-file build"))');
  js = js.replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
if (/assets\//.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) console.warn('WARNING: external asset reference remains');
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
