'use strict';

// Exposes a small, fixed API to the page. The page cannot reach Node or IPC
// directly; it can only start/stop the local MLLP listener and receive what
// the listener hands over.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('PMDesktop', {
  mllp: {
    start: (o) => ipcRenderer.invoke('mllp:start', { host: String(o && o.host), port: Number(o && o.port) }),
    stop: () => ipcRenderer.invoke('mllp:stop'),
    onMessage: (cb) => { ipcRenderer.on('mllp:message', (_e, m) => cb(m)); },
    onStatus: (cb) => { ipcRenderer.on('mllp:status', (_e, s) => cb(s)); },
  },
});
