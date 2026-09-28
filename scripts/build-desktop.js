process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
const { execSync } = require('child_process');

console.log('[Build Desktop] Setting CSC_IDENTITY_AUTO_DISCOVERY=false to bypass Windows Code Signing hang...');

try {
  // Execute electron-builder with inherited stdio
  execSync('npx electron-builder', { stdio: 'inherit' });
  console.log('[Build Desktop] Packaging completed successfully!');
} catch (e) {
  console.error('[Build Desktop] electron-builder execution failed:', e.message);
  process.exit(1);
}
