import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
fs.mkdirSync(distDir, { recursive: true });

const outputPath = path.join(distDir, 'demo.txt');
const content = [
  'Launchdeck hands-on demo build',
  `generatedAt=${new Date().toISOString()}`,
  ''
].join('\n');

fs.writeFileSync(outputPath, content);
console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
