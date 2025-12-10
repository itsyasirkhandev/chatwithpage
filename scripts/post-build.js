// Post-build script to create content script loader
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');

// Find the bundled content script
const assetsDir = path.join(distPath, 'assets');
const files = fs.readdirSync(assetsDir);
const contentScript = files.find(f => f.startsWith('content.js-'));

if (!contentScript) {
  console.error('Could not find bundled content script!');
  process.exit(1);
}

// Create loader directory
const loaderDir = path.join(distPath, 'src', 'content');
fs.mkdirSync(loaderDir, { recursive: true });

// Create loader file
const loaderContent = `// Content script loader - loads the bundled content script
import '../../assets/${contentScript}';
`;

const loaderPath = path.join(loaderDir, 'content.js-loader.js');
fs.writeFileSync(loaderPath, loaderContent);

console.log(`✓ Created content script loader: ${loaderPath}`);
console.log(`  → Loads: assets/${contentScript}`);
