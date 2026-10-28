'use strict';

// Desktop shell for PM-SIM (Linux .deb, Windows .exe). It only shows the same web page as the
// website, served from app://pm-sim/ inside the package. No preload, no Node in
// the page, no device access; the page's CSP (connect-src 'none') applies unchanged.

const { app, BrowserWindow, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'web');
const ORIGIN = 'app://pm-sim';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Maps app://pm-sim/<path> to a file inside web/; anything outside it is refused. */
function serveAppFiles() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (url.host !== 'pm-sim' || !file.startsWith(ROOT + path.sep)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    title: 'PM-SIM',
    backgroundColor: '#0b1620',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links (references) open in the system browser; the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // Exports use the normal download flow, so Electron asks where to save each file.
  win.loadURL(ORIGIN + '/index.html');
}

app.whenReady().then(() => {
  serveAppFiles();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
