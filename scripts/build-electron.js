const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[Electron Build] Step 1: Building Next.js with standalone output...');
execSync('npm run build', { stdio: 'inherit' });

console.log('[Electron Build] Step 2: Preparing standalone directory structure...');
const rootDir = path.resolve(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const staticSrc = path.join(rootDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
const publicSrc = path.join(rootDir, 'public');
const publicDest = path.join(standaloneDir, 'public');

if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log('[Electron Build] Copied .next/static into standalone bundle.');
}

if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
  console.log('[Electron Build] Copied public/ into standalone bundle.');
}

console.log('[Electron Build] Standalone assets ready for packaging!');
