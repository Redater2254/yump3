const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Register 'app' scheme as standard and secure to support routing and standard origin rules
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, bypassCSP: true } }
]);

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    // decode path to handle spaces
    let pathname = decodeURIComponent(url.pathname);
    
    // Resolve filePath
    let filePath = path.join(__dirname, 'dist', pathname);
    const distPath = path.join(__dirname, 'dist');
    
    // Prevent traversal attacks
    if (!filePath.startsWith(distPath)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch (e) {
      // File/folder does not exist, fallback to index.html for Expo Router SPA routing
      filePath = path.join(__dirname, 'dist', 'index.html');
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        headers: { 'content-type': contentType }
      });
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 800,
    minWidth: 360,
    minHeight: 640,
    maxWidth: 480,
    title: 'yump3',
    autoHideMenuBar: true, // Hide browser menu bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load custom app:// scheme instead of localhost http server (prevents firewall issues & offline binding failures)
  win.loadURL('app://localhost/index.html');
}

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
