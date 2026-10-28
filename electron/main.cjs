'use strict';

// Desktop shell for PM-SIM. The page is served from app://pm-sim/ instead of
// file:// so that it is a secure context (needed for Web Bluetooth); the page's
// CSP ('self', connect-src 'none') applies unchanged. Hospital routes that a web
// page cannot open itself are added here: an HL7 MLLP listener (electron/mllpServer.cjs,
// exposed through electron/preload.cjs) and a chooser for Web Serial ports.

const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { MllpServer } = require('./mllpServer.cjs');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://pm-sim';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Maps app://pm-sim/<path> to a file inside the app folder; anything outside it is refused. */
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

/**
 * Electron has no built-in Bluetooth chooser. Devices reported during the first
 * few seconds of a scan are offered in a dialog; Cancel ends the request.
 */
function bluetoothChooser(win) {
  let pending = null;
  let latest = [];
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    latest = devices;
    if (pending) return;
    pending = callback;
    setTimeout(async () => {
      const done = pending;
      const list = latest;
      pending = null;
      if (list.length === 0) {
        done('');
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Bluetooth',
          message: 'No Bluetooth device with a supported health profile was found.',
          detail: 'Switch the device on, put it in pairing or broadcast mode, and try again.',
        });
        return;
      }
      const names = list.map((d) => d.deviceName || d.deviceId);
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Choose a Bluetooth device',
        message: 'Devices offering a supported health profile:',
        buttons: [...names, 'Cancel'],
        cancelId: names.length,
      });
      done(response < list.length ? list[response].deviceId : '');
    }, 6000);
  });
}

/** Electron has no built-in serial-port chooser either; this one lists the ports in a dialog. */
function serialChooser(win) {
  const ses = win.webContents.session;
  ses.on('select-serial-port', async (event, ports, webContents, callback) => {
    event.preventDefault();
    if (ports.length === 0) {
      callback('');
      dialog.showMessageBox(win, { type: 'info', title: 'Serial port', message: 'No serial port was found.',
        detail: 'Connect the RS-232/USB adapter and check that your user may open it (on Linux, the dialout group).' });
      return;
    }
    const names = ports.map((p) => [p.displayName, p.portName].filter(Boolean).join(' - ') || p.portId);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', title: 'Choose a serial port', message: 'Port with the HL7 output:',
      buttons: [...names, 'Cancel'], cancelId: names.length,
    });
    callback(response < ports.length ? ports[response].portId : '');
  });
  // Only the app's own page may use serial ports.
  ses.setPermissionCheckHandler((_wc, permission, origin) => permission !== 'serial' || origin === ORIGIN);
  ses.setDevicePermissionHandler((d) => d.deviceType !== 'serial' || d.origin === ORIGIN);
}

/** One listener per app; messages go to the window that started it. */
let mllp = null;
function mllpIpc() {
  ipcMain.handle('mllp:start', (event, o) => {
    if (!event.senderFrame || !event.senderFrame.url.startsWith(ORIGIN + '/')) return { ok: false, error: 'refused' };
    const wc = event.sender;
    const send = (ch, x) => { if (!wc.isDestroyed()) wc.send(ch, x); };
    if (mllp) mllp.stop();
    mllp = new MllpServer({ onMessage: (m) => send('mllp:message', m), onStatus: (s) => send('mllp:status', s) });
    return mllp.start(o || {});
  });
  ipcMain.handle('mllp:stop', async () => {
    if (mllp) await mllp.stop();
    mllp = null;
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
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  bluetoothChooser(win);
  serialChooser(win);
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
  mllpIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (mllp) mllp.stop();
  if (process.platform !== 'darwin') app.quit();
});
