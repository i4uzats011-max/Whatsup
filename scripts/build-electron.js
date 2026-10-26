const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[Electron Build] Step 1: Building Next.js with standalone output...');
execSync('npm run build', { stdio: 'inherit' });

console.log('[Electron Build] Step 2: Preparing standalone_dist bundle structure...');
const rootDir = path.resolve(__dirname, '..');
const standaloneDistDir = path.join(rootDir, 'standalone_dist');
const serverDestDir = path.join(standaloneDistDir, 'server');
const standaloneSrc = path.join(rootDir, '.next', 'standalone');
const staticSrc = path.join(rootDir, '.next', 'static');
const staticDest = path.join(serverDestDir, '.next', 'static');
const publicSrc = path.join(rootDir, 'public');
const publicDest = path.join(serverDestDir, 'public');

if (fs.existsSync(standaloneDistDir)) {
  fs.rmSync(standaloneDistDir, { recursive: true, force: true });
}

fs.mkdirSync(serverDestDir, { recursive: true });
fs.cpSync(standaloneSrc, serverDestDir, { recursive: true });
console.log('[Electron Build] Copied .next/standalone into standalone_dist/server.');

// Clean up any untracked or unwanted heavy folders if copied
const unwantedProfile = path.join(serverDestDir, 'whatsapp_session_profile');
if (fs.existsSync(unwantedProfile)) fs.rmSync(unwantedProfile, { recursive: true, force: true });
const unwantedDist = path.join(serverDestDir, 'dist');
if (fs.existsSync(unwantedDist)) fs.rmSync(unwantedDist, { recursive: true, force: true });

if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log('[Electron Build] Copied .next/static into standalone_dist/server/.next/static.');
}

if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
  console.log('[Electron Build] Copied public/ into standalone_dist/server/public.');
}

// Verification
const serverJs = path.join(serverDestDir, 'server.js');
const nextModules = path.join(serverDestDir, 'node_modules', 'next');
if (!fs.existsSync(serverJs) || !fs.existsSync(nextModules)) {
  throw new Error('[Electron Build] Error: server.js or node_modules/next is missing from standalone bundle!');
}

console.log('[Electron Build] Standalone bundle ready and verified for packaging!');
