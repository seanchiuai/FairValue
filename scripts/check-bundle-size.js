const fs = require('node:fs');
const path = require('node:path');

const distAssetsDir = path.resolve(__dirname, '..', 'dist', 'assets');
const maxJsChunkKb = Number(process.env.FAIRVALUE_MAX_JS_CHUNK_KB || 240);
const maxCssChunkKb = Number(process.env.FAIRVALUE_MAX_CSS_CHUNK_KB || 25);
const maxTotalJsKb = Number(process.env.FAIRVALUE_MAX_TOTAL_JS_KB || 825);

function sizeKb(filePath) {
  return fs.statSync(filePath).size / 1024;
}

function formatKb(value) {
  return `${value.toFixed(2)} kB`;
}

if (!fs.existsSync(distAssetsDir)) {
  throw new Error('dist/assets is missing. Run `npm run build` before checking bundle budgets.');
}

const assets = fs.readdirSync(distAssetsDir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => {
    const filePath = path.join(distAssetsDir, file);
    return {
      file,
      ext: path.extname(file),
      kb: sizeKb(filePath),
    };
  })
  .sort((left, right) => right.kb - left.kb);

const jsAssets = assets.filter((asset) => asset.ext === '.js');
const cssAssets = assets.filter((asset) => asset.ext === '.css');
const totalJsKb = jsAssets.reduce((total, asset) => total + asset.kb, 0);
const failures = [];

for (const asset of jsAssets) {
  if (asset.kb > maxJsChunkKb) {
    failures.push(`${asset.file} is ${formatKb(asset.kb)}, above JS chunk budget ${formatKb(maxJsChunkKb)}`);
  }
}

for (const asset of cssAssets) {
  if (asset.kb > maxCssChunkKb) {
    failures.push(`${asset.file} is ${formatKb(asset.kb)}, above CSS chunk budget ${formatKb(maxCssChunkKb)}`);
  }
}

if (totalJsKb > maxTotalJsKb) {
  failures.push(`total JS is ${formatKb(totalJsKb)}, above budget ${formatKb(maxTotalJsKb)}`);
}

if (failures.length > 0) {
  console.error('Bundle budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const largestJs = jsAssets[0];
const largestCss = cssAssets[0];
console.log(
  [
    'Bundle budget check passed.',
    `Largest JS: ${largestJs.file} (${formatKb(largestJs.kb)} / ${formatKb(maxJsChunkKb)})`,
    `Total JS: ${formatKb(totalJsKb)} / ${formatKb(maxTotalJsKb)}`,
    largestCss ? `Largest CSS: ${largestCss.file} (${formatKb(largestCss.kb)} / ${formatKb(maxCssChunkKb)})` : null,
  ].filter(Boolean).join('\n')
);
