/* Serial (RS-232 / USB-serial) HL7 v2 receiver using the Web Serial API.
 *
 * Many bedside monitors and gateways can send HL7 v2 ORU messages over a serial
 * port, framed with MLLP (VT ... FS CR) or as plain CR-separated segments. The
 * user picks the port in the browser's own dialog; the page cannot see ports it
 * was not given. This module only reads. It never writes to the port, so no ACK
 * is sent on this route. The DOM-free framing logic is in SerialFramer so it can
 * be tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./hl7v2.js'));
  else (root.PM = root.PM || {}).webSerial = factory(root.PM.hl7v2);
})(this, function (hl7v2) {
  'use strict';

  function availability(env) {
    env = env || (typeof window !== 'undefined' ? window : {});
    if (!env.isSecureContext) return { ok: false, reason: 'Web Serial needs a secure context (http://localhost or the desktop app).' };
    if (!env.navigator || !env.navigator.serial) return { ok: false, reason: 'This browser does not provide Web Serial. Use Chrome or Edge 89+, or the desktop app.' };
    return { ok: true, reason: '' };
  }

  /**
   * Turns a byte/text stream into complete HL7 messages.
   * MLLP frames are used when a VT byte is seen. Otherwise text is split before each
   * "MSH|" and the last message is flushed after `idleMs` without new data.
   */
  class SerialFramer {
    constructor(onMessage, idleMs) {
      this.onMessage = onMessage; this.idleMs = idleMs || 1500;
      this.buf = ''; this.mllp = false; this.timer = null;
    }
    push(text) {
      this.buf += text;
      if (this.buf.length > hl7v2.MAX_MESSAGE * 2) this.buf = this.buf.slice(-hl7v2.MAX_MESSAGE);
      if (this.buf.includes(hl7v2.VT)) this.mllp = true;
      if (this.mllp) {
        const r = hl7v2.deframe(this.buf);
        this.buf = r.rest;
        r.messages.forEach(m => this.onMessage(m, 'MLLP'));
        return;
      }
      const parts = this.buf.split(/(?=MSH\|)/);
      this.buf = parts.pop();
      parts.filter(p => p.startsWith('MSH|')).forEach(p => this.onMessage(p, 'plain'));
      this.arm();
    }
    arm() {
      if (this.timer) clearTimeout(this.timer);
      if (!this.buf.startsWith('MSH|')) return;
      this.timer = setTimeout(() => this.flush(), this.idleMs);
    }
    flush() {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (!this.mllp && this.buf.startsWith('MSH|')) this.onMessage(this.buf, 'plain (idle flush)');
      if (!this.mllp) this.buf = '';
    }
  }

  class SerialSource {
    /**
     * o: { serial (navigator.serial), baudRate, dataBits, parity, stopBits,
     *      onMessage(text, framing), onStatus({state, message, bytes, messages}) }
     */
    constructor(o) {
      this.o = o; this.port = null; this.reader = null; this.stopping = false;
      this.bytes = 0; this.messages = 0;
      this.framer = new SerialFramer((m, f) => { this.messages++; o.onMessage(m, f); this.status('receiving', 'message received'); });
    }
    status(state, message) { if (this.o.onStatus) this.o.onStatus({ state, message, bytes: this.bytes, messages: this.messages }); }
    /** Must be called from a user gesture (click). */
    async connect() {
      try {
        this.status('requesting', 'choose a serial port in the browser dialog');
        this.port = await this.o.serial.requestPort();
        const opts = { baudRate: this.o.baudRate || 9600, dataBits: this.o.dataBits || 8, parity: this.o.parity || 'none', stopBits: this.o.stopBits || 1 };
        await this.port.open(opts);
        this.status('open', 'port open at ' + opts.baudRate + ' baud, ' + opts.dataBits + (opts.parity[0] || 'n').toUpperCase() + opts.stopBits + '; waiting for HL7 data');
        this.loop();
      } catch (e) {
        this.status('failed', e && e.name === 'NotFoundError' ? 'no port chosen' : String(e && e.message || e));
      }
    }
    async loop() {
      const dec = new TextDecoder('utf-8');
      while (this.port && this.port.readable && !this.stopping) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            this.bytes += value.byteLength;
            this.framer.push(dec.decode(value, { stream: true }));
          }
        } catch (e) {
          if (!this.stopping) this.status('error', 'read error: ' + (e && e.message || e) + '; retrying');
        } finally { try { this.reader.releaseLock(); } catch (e) { /* already released */ } }
      }
    }
    async disconnect() {
      this.stopping = true;
      this.framer.flush();
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* ignore */ }
      try { if (this.port) await this.port.close(); } catch (e) { /* ignore */ }
      this.port = null;
      this.status('disconnected', 'port closed');
    }
  }

  return { availability, SerialFramer, SerialSource };
});
