/* Parser (and test encoder) for the Bluetooth SIG Heart Rate Measurement
 * characteristic (0x2A37, Heart Rate Service 0x180D, notify).
 *
 * Used by the Android app's BLE route: the native side passes the raw notification
 * bytes as hex and this module decodes them, so the byte layout lives in one place
 * and is covered by the Node tests. Only the adopted, publicly specified layout is
 * handled: no vendor protocols, no reverse engineering. Numbers are little-endian.
 *
 * Parsed values become Observations with source "device". A value the sensor
 * reports is a device value, not a value derived by this app. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/observation.js'));
  else (root.PM = root.PM || {}).gatt = factory(root.PM.observation);
})(this, function (observation) {
  'use strict';

  function toDataView(data) {
    if (data instanceof DataView) return data;
    if (data instanceof ArrayBuffer) return new DataView(data);
    if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return new DataView(Uint8Array.from(data).buffer);
    if (typeof data === 'string') return new DataView(fromHex(data).buffer);
    throw new TypeError('expected bytes');
  }

  class Reader {
    constructor(data) { this.dv = toDataView(data); this.o = 0; }
    need(n, what) { if (this.o + n > this.dv.byteLength) throw new RangeError('packet too short for ' + what + ' (need ' + (this.o + n) + ' bytes, have ' + this.dv.byteLength + ')'); }
    u8(w) { this.need(1, w); return this.dv.getUint8(this.o++); }
    u16(w) { this.need(2, w); const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
    get remaining() { return this.dv.byteLength - this.o; }
  }

  // ---------------------------------------------------------------- Heart Rate Measurement 0x2A37
  function parseHeartRate(data) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const hr = flags & 0x01 ? r.u16('heart rate (uint16)') : r.u8('heart rate (uint8)');
    const contactBits = (flags >> 1) & 0x03;
    const contact = contactBits === 3 ? 'detected' : contactBits === 2 ? 'not-detected' : 'not-supported';
    const energyKJ = flags & 0x08 ? r.u16('energy expended') : null;
    const rrIntervals = [];
    if (flags & 0x10) while (r.remaining >= 2) rrIntervals.push(Number((r.u16('RR interval') / 1024).toFixed(4)));
    return { kind: 'heart_rate', flags, hr, contact, energyKJ, rrIntervals };
  }

  const SERVICE = { service: 0x180D, measurement: 0x2A37, bodySensorLocation: 0x2A38 };
  const BODY_SENSOR_LOCATION = { 0: 'other', 1: 'chest', 2: 'wrist', 3: 'finger', 4: 'hand', 5: 'ear lobe', 6: 'foot' };

  /** Parsed packet → Observations (source "device"). meta: {deviceName, deviceId, receivedAt, rawHex, route} */
  function toObservations(p, meta) {
    meta = meta || {};
    const receivedAt = meta.receivedAt || Date.now();
    const quality = p.contact === 'not-detected' ? observation.QUALITY.ARTIFACT : observation.QUALITY.OK;
    const hr = p.hr === 0 ? null : p.hr;
    return [observation.make({ param: 'hr', value: hr, source: observation.SOURCE.DEVICE, timestamp: receivedAt,
      quality: hr === null ? undefined : quality,
      provenance: { kind: p.kind, route: meta.route || null, deviceName: meta.deviceName || null, deviceId: meta.deviceId || null,
        rawHex: meta.rawHex || null, timeSource: 'time received', receivedAt: new Date(receivedAt).toISOString(), contact: p.contact,
        rrIntervals_s: p.rrIntervals.length ? p.rrIntervals : undefined, energyKJ: p.energyKJ === null ? undefined : p.energyKJ } })];
  }

  /** Test encoder: {hr, contact, energyKJ, rrIntervals} → bytes. */
  function encodeHeartRate(o) {
    const b = [], u16 = v => b.push(v & 0xFF, (v >> 8) & 0xFF), wide = o.hr > 255;
    b.push((wide ? 1 : 0) | (o.contact === 'detected' ? 6 : o.contact === 'not-detected' ? 4 : 0) | (o.energyKJ != null ? 8 : 0) | (o.rrIntervals && o.rrIntervals.length ? 0x10 : 0));
    wide ? u16(o.hr) : b.push(o.hr & 0xFF);
    if (o.energyKJ != null) u16(o.energyKJ);
    (o.rrIntervals || []).forEach(rr => u16(Math.round(rr * 1024)));
    return Uint8Array.from(b);
  }

  function toHex(bytes) { const dv = toDataView(bytes); return Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), b => b.toString(16).padStart(2, '0')).join(' '); }
  function fromHex(s) {
    const clean = String(s).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
    if (clean.length % 2) throw new Error('odd number of hex digits');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  return { parseHeartRate, toObservations, encodeHeartRate, SERVICE, BODY_SENSOR_LOCATION, toHex, fromHex };
});
