import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git','node_modules','docs']);

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.') && entry.name !== '.github') continue;
    if(entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else if(entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

function prefixFor(file){
  const rel=path.relative(ROOT,path.dirname(file));
  if(!rel || rel==='.') return '';
  return '../'.repeat(rel.split(path.sep).length);
}

let changed=0;
for(const file of walk(ROOT)){
  let html=fs.readFileSync(file,'utf8');
  const before=html;
  const prefix=prefixFor(file);

  html=html.replace(/<script\s+src=["']https:\/\/cdn\.tailwindcss\.com\/?["']><\/script>/gi,
    `<link rel="stylesheet" href="${prefix}assets/tailwind.min.css?v=20260813-performance-v1">`);

  html=html.replace(/<script\s+src=["']https:\/\/unpkg\.com\/lucide@0\.453\.0\/dist\/umd\/lucide\.js["']><\/script>/gi,
    `<script src="${prefix}assets/lucide.min.js?v=20260813-performance-v1"></script>`);

  const hasCommon=/src=["'][^"']*common\.js[^"']*["']/i.test(html);
  if(hasCommon){
    html=html.replace(/\s*<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js["']><\/script>/gi,'');

    if(!/performance-cache\.js/i.test(html)){
      html=html.replace(/(<script\s+src=["'][^"']*common\.js[^"']*["']><\/script>)/i,
        `$1\n<script src="${prefix}performance-cache.js?v=20260813-performance-v1"></script>`);
    }
  }

  if(html!==before){
    fs.writeFileSync(file,html,'utf8');
    console.log('optimized',path.relative(ROOT,file));
    changed++;
  }
}
console.log(`Optimized ${changed} HTML files.`);
