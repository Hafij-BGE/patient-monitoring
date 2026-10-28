/* Web Bluetooth connection manager for standard BLE medical profiles.
 *
 * - The browser shows its own device chooser; the user picks the device. The
 *   page never scans silently and never sees devices the user did not choose.
 * - Requires a secure context (https:// or http://localhost) and a browser with
 *   Web Bluetooth (Chrome/Edge; on Linux, chrome://flags/#enable-experimental-web-platform-features
 *   may be needed). From file:// the feature is unavailable and the UI says so.
 * - Data stays in this page. Nothing is uploaded.
 * - Reconnect after an unexpected disconnect with backoff 1, 2, 4, 8, 16 s
 *   (5 attempts); a disconnect requested by the user is not retried.
 *
 * Dependencies (bluetooth object, timers, clock) are injectable so the logic is
 * unit-tested in Node with a fake. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gatt.js'));
  else (root.PM = root.PM || {}).webBluetooth = factory(root.PM.gatt);
})(this, function (gatt) {
  'use strict';

  const BACKOFF_S = [1, 2, 4, 8, 16];

  function availability(env) {
    env = env || (typeof window !== 'undefined' ? window : {});
    if (!env.isSecureContext) return { ok: false, reason: 'Web Bluetooth needs a secure context. Serve the folder with "python3 -m http.server" and open http://localhost:8000 (file:// does not work).' };
    if (!env.navigator || !env.navigator.bluetooth) return { ok: false, reason: 'This browser does not provide Web Bluetooth. Use Chrome or Edge; on Linux enable chrome://flags/#enable-experimental-web-platform-features.' };
    return { ok: true, reason: '' };
  }

  const dvToHex = dv => gatt.toHex(dv);
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  class BleDevice {
    /**
     * @param {object} o
     *   bluetooth  navigator.bluetooth (or a fake)
     *   kinds      keys of gatt.SERVICES to request, e.g. ['blood_pressure']
     *   onObservations(list, packet)   parsed observations
     *   onLive(packet)                 every parsed packet (incl. intermediate cuff/temperature)
     *   onStatus(status)               {state, name, attempt, message, manufacturer, model, battery}
     *   setTimeout / clearTimeout / now  injectable for tests
     */
    constructor(o) {
      this.o = Object.assign({ setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id), now: () => Date.now(),
        onObservations: () => {}, onLive: () => {}, onStatus: () => {} }, o);
      this.device = null; this.server = null; this.subs = []; this.timer = null;
      this.userClosed = false; this.attempt = 0;
      this.info = { name: null, id: null, manufacturer: null, model: null, battery: null, services: [] };
      this.state = 'idle';
      this.packets = 0; this.errors = 0;
    }

    status(state, message) {
      this.state = state;
      this.o.onStatus(Object.assign({ state, message: message || '', attempt: this.attempt, packets: this.packets, errors: this.errors }, this.info));
    }

    /** Opens the browser's chooser (must be called from a user gesture). */
    async request() {
      const kinds = this.o.kinds && this.o.kinds.length ? this.o.kinds : Object.keys(gatt.SERVICES);
      const filters = kinds.map(k => ({ services: [gatt.SERVICES[k].service] }));
      const optionalServices = Object.values(gatt.SERVICES).map(s => s.service).concat([gatt.DEVICE_INFO.service, gatt.BATTERY.service]);
      this.status('choosing', 'Waiting for you to pick a device in the browser dialog…');
      try {
        this.device = await this.o.bluetooth.requestDevice({ filters, optionalServices });
      } catch (e) {
        this.status('idle', e && e.name === 'NotFoundError' ? 'No device chosen.' : 'Request failed: ' + (e && e.message || e));
        return false;
      }
      this.info.name = this.device.name || '(unnamed device)';
      this.info.id = this.device.id || null;
      this.onDisc = () => this.handleDisconnect();
      this.device.addEventListener('gattserverdisconnected', this.onDisc);
      this.userClosed = false;
      return this.connect();
    }

    async connect() {
      this.status(this.attempt ? 'reconnecting' : 'connecting', this.attempt ? 'Reconnect attempt ' + this.attempt + ' of ' + BACKOFF_S.length : 'Connecting…');
      try {
        this.server = await this.device.gatt.connect();
        await this.readInfo();
        const found = [];
        for (const [kind, spec] of Object.entries(gatt.SERVICES)) {
          let svc;
          try { svc = await this.server.getPrimaryService(spec.service); } catch (e) { continue; }
          for (const c of spec.chars) {
            let ch;
            try { ch = await svc.getCharacteristic(c.uuid); } catch (e) { if (!c.optional) this.status(this.state, c.name + ' not found'); continue; }
            const handler = ev => this.handlePacket(kind, c, ev.target.value);
            ch.addEventListener('characteristicvaluechanged', handler);
            await ch.startNotifications(); // also enables indications for indicate-only characteristics
            this.subs.push({ ch, handler });
            found.push(spec.label + ': ' + c.name);
          }
        }
        this.info.services = found;
        if (!found.length) {
          this.status('error', 'Connected, but the device exposes none of the supported standard profiles (it may use a vendor protocol, which this app does not support).');
          this.disconnect();
          return false;
        }
        this.attempt = 0;
        this.status('connected', 'Receiving: ' + found.join('; ') + '. Many devices send a reading only after a measurement finishes.');
        return true;
      } catch (e) {
        this.status('error', 'Connection failed: ' + (e && e.message || e));
        if (!this.userClosed) this.scheduleReconnect();
        return false;
      }
    }

    async readInfo() {
      const read = async (svcId, chId) => {
        try { const s = await this.server.getPrimaryService(svcId); const c = await s.getCharacteristic(chId); return await c.readValue(); }
        catch (e) { return null; }
      };
      const text = dv => dv && decoder ? decoder.decode(dv).replace(/\0+$/, '').trim() : null;
      this.info.manufacturer = text(await read(gatt.DEVICE_INFO.service, gatt.DEVICE_INFO.manufacturer));
      this.info.model = text(await read(gatt.DEVICE_INFO.service, gatt.DEVICE_INFO.model));
      const b = await read(gatt.BATTERY.service, gatt.BATTERY.level);
      this.info.battery = b ? b.getUint8(0) : null;
    }

    handlePacket(kind, c, dv) {
      const rawHex = dvToHex(dv);
      let p;
      try { p = c.parse(dv); }
      catch (e) { this.errors++; this.status(this.state, 'Malformed packet from ' + c.name + ' (' + rawHex + '): ' + e.message); return; }
      this.packets++;
      const meta = { deviceName: this.info.name, deviceId: this.info.id, characteristic: gatt.uuidName(c.uuid) + ' ' + c.name,
        rawHex, receivedAt: this.o.now(), manufacturer: this.info.manufacturer, model: this.info.model };
      this.o.onLive(Object.assign({ parsed: p }, meta));
      const obs = gatt.toObservations(p, meta);
      if (obs.length) this.o.onObservations(obs, Object.assign({ parsed: p }, meta));
    }

    handleDisconnect() {
      this.subs = []; this.server = null;
      if (this.userClosed) { this.status('disconnected', 'Disconnected.'); return; }
      this.scheduleReconnect();
    }

    scheduleReconnect() {
      if (this.timer !== null) return;
      if (this.attempt >= BACKOFF_S.length) { this.status('failed', 'Device lost. Gave up after ' + BACKOFF_S.length + ' reconnect attempts. Check the device is on and in range, then connect again.'); this.attempt = 0; return; }
      const wait = BACKOFF_S[this.attempt++];
      this.status('waiting', 'Connection lost. Retrying in ' + wait + ' s (attempt ' + this.attempt + ' of ' + BACKOFF_S.length + ').');
      this.timer = this.o.setTimeout(() => { this.timer = null; this.connect(); }, wait * 1000);
    }

    disconnect() {
      this.userClosed = true;
      if (this.timer !== null) { this.o.clearTimeout(this.timer); this.timer = null; }
      for (const s of this.subs) { try { s.ch.removeEventListener('characteristicvaluechanged', s.handler); s.ch.stopNotifications(); } catch (e) { /* already gone */ } }
      this.subs = [];
      if (this.device && this.device.gatt && this.device.gatt.connected) this.device.gatt.disconnect();
      else this.status('disconnected', 'Disconnected.');
      this.attempt = 0;
    }
  }

  return { BleDevice, availability, BACKOFF_S };
});
