import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(process.cwd(), 'public/index.html'),
  path.resolve(__dirname, '../public/index.html'),
  path.resolve(__dirname, 'public/index.html'),
  path.resolve(process.cwd(), '../frontend/dist/index.html'),
  path.resolve(process.cwd(), 'frontend/dist/index.html'),
  path.resolve(__dirname, '../../frontend/dist/index.html'),
  path.resolve(__dirname, '../frontend/dist/index.html'),
  '/opt/render/project/src/backend/public/index.html',
  '/opt/render/project/src/frontend/dist/index.html',
];

const found = candidatePaths.some((p) => fs.existsSync(p));

if (!found) {
  console.log('⚡ [TravelAI Deploy] Static frontend not found! Triggering automated frontend build...');

  const frontendDirCandidates = [
    path.resolve(process.cwd(), '../frontend'),
    path.resolve(process.cwd(), 'frontend'),
    path.resolve(__dirname, '../../frontend'),
    '/opt/render/project/src/frontend',
  ];
  const frontendDir = frontendDirCandidates.find((d) => fs.existsSync(path.join(d, 'package.json')));

  if (frontendDir) {
    console.log(`📦 Found frontend directory at: ${frontendDir}. Building now...`);
    try {
      execSync('npm install --include=dev', { cwd: frontendDir, stdio: 'inherit' });
      execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
      console.log('✅ [TravelAI Deploy] Frontend built successfully!');

      // Copy built bundle to backend/public if dist exists
      const distPath = path.join(frontendDir, 'dist');
      const publicPath = path.resolve(__dirname, 'public');
      if (fs.existsSync(distPath)) {
        fs.cpSync(distPath, publicPath, { recursive: true });
        console.log(`✅ [TravelAI Deploy] Synced ${distPath} -> ${publicPath}`);
      }
    } catch (err) {
      console.error('❌ [TravelAI Deploy] Failed to build frontend:', err);
    }
  } else {
    console.error('❌ [TravelAI Deploy] Could not locate frontend directory to build!');
  }
} else {
  console.log('✅ [TravelAI Deploy] Static frontend bundle is already present and ready.');
}
