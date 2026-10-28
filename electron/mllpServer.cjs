'use strict';

// HL7 v2 MLLP listener for the desktop app. Receives framed messages
// (VT ... FS CR), answers each one with an HL7 ACK (MSA AA, or AE when the
// message cannot be read) and hands the text to the page. It only receives:
// it never connects out and never forwards data anywhere else.
// Kept free of Electron imports so the Node tests can run it.

const net = require('node:net');
const hl7v2 = require('../src/devices/hl7v2.js');

const MAX_CONNECTIONS = 8;
const MAX_BUFFER = 1024 * 1024;

class MllpServer {
  /** o: { onMessage({text, peer, receivedAt}), onStatus({state, message, connections, messages}) } */
  constructor(o) {
    this.o = o;
    this.server = null;
    this.sockets = new Set();
    this.messages = 0;
  }

  status(state, message) {
    this.o.onStatus({ state, message, connections: this.sockets.size, messages: this.messages });
  }

  /** Resolves { ok, error }. host: '127.0.0.1' (default) or '0.0.0.0'. */
  start({ host, port }) {
    host = host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
    port = Number(port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return Promise.resolve({ ok: false, error: 'port must be 1024-65535' });
    if (this.server) return Promise.resolve({ ok: false, error: 'already listening' });
    return new Promise((resolve) => {
      const server = net.createServer((sock) => this.accept(sock));
      server.maxConnections = MAX_CONNECTIONS;
      server.once('error', (e) => {
        this.server = null;
        this.status('stopped', e.code === 'EADDRINUSE' ? 'port ' + port + ' is in use' : e.message);
        resolve({ ok: false, error: e.code === 'EADDRINUSE' ? 'port ' + port + ' is in use' : e.message });
      });
      server.listen(port, host, () => {
        this.server = server;
        this.status('listening', 'on ' + host + ':' + port);
        resolve({ ok: true });
      });
    });
  }

  accept(sock) {
    const peer = (sock.remoteAddress || '?').replace(/^::ffff:/, '') + ':' + sock.remotePort;
    this.sockets.add(sock);
    this.status('listening', 'connection from ' + peer);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > MAX_BUFFER) {
        sock.destroy();
        this.status('listening', 'connection from ' + peer + ' closed: more than 1 MB without a complete frame');
        return;
      }
      const r = hl7v2.deframe(buf);
      buf = r.rest;
      for (const text of r.messages) {
        this.messages++;
        const parsed = hl7v2.parseMessage(text);
        const reply = parsed.error ? hl7v2.ack({ header: {} }, 'AE', parsed.error) : hl7v2.ack(parsed, 'AA');
        sock.write(hl7v2.frame(reply));
        this.o.onMessage({ text, peer, receivedAt: Date.now() });
      }
      if (r.messages.length) this.status('listening', 'last message from ' + peer);
    });
    sock.on('error', () => { /* reset by peer; close handles cleanup */ });
    sock.on('close', () => {
      this.sockets.delete(sock);
      if (this.server) this.status('listening', peer + ' disconnected');
    });
  }

  stop() {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    if (!this.server) return Promise.resolve();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server = null;
      this.status('stopped', 'listener closed');
    });
  }
}

module.exports = { MllpServer, MAX_CONNECTIONS, MAX_BUFFER };
