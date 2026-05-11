#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '..', 'src');
const forbidden = [
  {
    label: 'previously exposed Cognee key',
    value: ['eb6226f5d948d3a48e1c5867043fc5fba', '7573ec9db11a56f'].join(''),
  },
  {
    label: 'browser Cognee credential header',
    value: ['X-Api', 'Key'].join('-'),
  },
];

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

const violations = [];
for (const file of collectFiles(srcRoot)) {
  if (file.endsWith(path.join('__tests__', 'cogneeService.test.ts'))) continue;
  const contents = fs.readFileSync(file, 'utf8');
  for (const item of forbidden) {
    if (contents.includes(item.value)) {
      violations.push(`${path.relative(process.cwd(), file)} contains ${item.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Client secret scan failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Client secret scan passed.');
