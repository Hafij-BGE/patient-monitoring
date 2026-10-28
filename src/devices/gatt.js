/* Parsers (and test encoders) for Bluetooth SIG standard medical GATT profiles.
 *
 * Only adopted, publicly specified characteristics are handled — no vendor
 * protocols, no reverse engineering. Byte layouts follow the Bluetooth SIG
 * service specifications and the GATT Specification Supplement (GSS):
 *
 *   Heart Rate Service (0x180D)       Heart Rate Measurement        0x2A37 notify
 *   Pulse Oximeter Service (0x1822)   PLX Spot-Check Measurement    0x2A5E indicate
 *                                     PLX Continuous Measurement    0x2A5F notify
 *   Blood Pressure Service (0x1810)   Blood Pressure Measurement    0x2A35 indicate
 *                                     Intermediate Cuff Pressure    0x2A36 notify
 *   Health Thermometer Service (0x1809) Temperature Measurement     0x2A1C indicate
 *                                     Intermediate Temperature      0x2A1E notify
 *   Weight Scale Service (0x181D)     Weight Measurement            0x2A9D indicate
 *
 * Numbers use little-endian byte order. Medical values use the IEEE 11073-20601
 * SFLOAT (16-bit) and FLOAT (32-bit) formats, which have reserved special
 * values (NaN, NRes, ±INF); those become missing values here, never 0.
 *
 * Parsed values become Observations with source "device". A value the device
 * reports (including a MAP from a BP monitor) is a device value, not a value
 * derived by this app. Status flags travel in the provenance and lower the
 * quality where the device itself says the reading is questionable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/observation.js'));
  else (root.PM = root.PM || {}).gatt = factory(root.PM.observation);
})(this, function (observation) {
  'use strict';

  // ---------------------------------------------------------------- IEEE 11073 numbers
  const SFLOAT_SPECIAL = { 0x07FF: 'NaN', 0x0800: 'NRes', 0x07FE: '+INF', 0x0802: '-INF', 0x0801: 'reserved' };
  const FLOAT_SPECIAL = { 0x007FFFFF: 'NaN', 0x00800000: 'NRes', 0x007FFFFE: '+INF', 0x00800002: '-INF', 0x00800001: 'reserved' };

  const scaled = (m, e) => e < 0 ? Number((m * Math.pow(10, e)).toFixed(-e)) : m * Math.pow(10, e);

  /** 16-bit SFLOAT: 4-bit signed exponent, 12-bit signed mantissa. → {value|null, special|null} */
  function decodeSFLOAT(raw) {
    raw &= 0xFFFF;
    if (SFLOAT_SPECIAL[raw]) return { value: null, special: SFLOAT_SPECIAL[raw] };
    let m = raw & 0x0FFF, e = raw >> 12;
    if (m >= 0x0800) m -= 0x1000;
    if (e >= 0x8) e -= 0x10;
    return { value: scaled(m, e), special: null };
  }

  /** 32-bit FLOAT: 8-bit signed exponent, 24-bit signed mantissa. */
  function decodeFLOAT(raw) {
    raw >>>= 0;
    const mRaw = raw & 0x00FFFFFF;
    if ((raw >>> 24) === 0 && FLOAT_SPECIAL[mRaw]) return { value: null, special: FLOAT_SPECIAL[mRaw] };
    let m = mRaw, e = raw >>> 24;
    if (m >= 0x800000) m -= 0x1000000;
    if (e >= 0x80) e -= 0x100;
    return { value: scaled(m, e), special: null };
  }

  function encodeSFLOAT(value, exp) {
    if (value === null || value === undefined || Number.isNaN(value)) return 0x07FF;
    exp = exp === undefined ? 0 : exp;
    const m = Math.round(value / Math.pow(10, exp));
    if (m < -2046 || m > 2045) throw new RangeError('SFLOAT mantissa out of range');
    return ((exp & 0xF) << 12) | (m & 0x0FFF);
  }

  function encodeFLOAT(value, exp) {
    if (value === null || value === undefined || Number.isNaN(value)) return 0x007FFFFF;
    exp = exp === undefined ? 0 : exp;
    const m = Math.round(value / Math.pow(10, exp));
    return (((exp & 0xFF) << 24) | (m & 0x00FFFFFF)) >>> 0;
  }

  // ---------------------------------------------------------------- byte reader
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
    u24(w) { this.need(3, w); const v = this.dv.getUint16(this.o, true) | (this.dv.getUint8(this.o + 2) << 16); this.o += 3; return v; }
    u32(w) { this.need(4, w); const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
    sfloat(w) { return decodeSFLOAT(this.u16(w)); }
    float(w) { return decodeFLOAT(this.u32(w)); }
    dateTime() {
      const year = this.u16('timestamp'), month = this.u8('timestamp'), day = this.u8('timestamp');
      const hours = this.u8('timestamp'), minutes = this.u8('timestamp'), seconds = this.u8('timestamp');
      return { year, month, day, hours, minutes, seconds };
    }
    get remaining() { return this.dv.byteLength - this.o; }
  }

  /** Device clocks carry no time zone. Year 0 / month 0 / day 0 mean "not known". */
  function dateTimeToMs(dt) {
    if (!dt || dt.year === 0 || dt.month === 0 || dt.day === 0) return null;
    return new Date(dt.year, dt.month - 1, dt.day, dt.hours, dt.minutes, dt.seconds).getTime();
  }

  const bits = (word, table) => Object.keys(table).filter(b => word & (1 << Number(b))).map(b => table[b]);

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

  // ---------------------------------------------------------------- Pulse oximetry 0x2A5E / 0x2A5F
  const PLX_MEAS_STATUS = { 5: 'measurement ongoing', 6: 'early estimated data', 7: 'validated data', 8: 'fully qualified data',
    9: 'data from measurement storage', 10: 'data for demonstration', 11: 'data for testing', 12: 'calibration ongoing',
    13: 'measurement unavailable', 14: 'questionable measurement detected', 15: 'invalid measurement detected' };
  const PLX_DEVICE_STATUS = { 0: 'extended display update ongoing', 1: 'equipment malfunction detected', 2: 'signal processing irregularity detected',
    3: 'inadequate signal detected', 4: 'poor signal detected', 5: 'low perfusion detected', 6: 'erratic signal detected',
    7: 'non-pulsatile signal detected', 8: 'questionable pulse detected', 9: 'signal analysis ongoing', 10: 'sensor interference detected',
    11: 'sensor unconnected to user', 12: 'unknown sensor connected', 13: 'sensor displaced', 14: 'sensor malfunctioning', 15: 'sensor disconnected' };

  function parsePlxSpotCheck(data) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const spo2 = r.sfloat('SpO2'), pr = r.sfloat('pulse rate');
    const out = { kind: 'plx_spot', flags, spo2: spo2.value, pr: pr.value, special: { spo2: spo2.special, pr: pr.special } };
    if (flags & 0x01) out.deviceTime = r.dateTime();
    if (flags & 0x02) out.measurementStatus = bits(r.u16('measurement status'), PLX_MEAS_STATUS);
    if (flags & 0x04) out.deviceStatus = bits(r.u24('device and sensor status'), PLX_DEVICE_STATUS);
    if (flags & 0x08) out.pai = r.sfloat('pulse amplitude index').value;
    return out;
  }

  function parsePlxContinuous(data) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const spo2 = r.sfloat('SpO2 (normal)'), pr = r.sfloat('PR (normal)');
    const out = { kind: 'plx_continuous', flags, spo2: spo2.value, pr: pr.value, special: { spo2: spo2.special, pr: pr.special } };
    if (flags & 0x01) out.fast = { spo2: r.sfloat('SpO2 (fast)').value, pr: r.sfloat('PR (fast)').value };
    if (flags & 0x02) out.slow = { spo2: r.sfloat('SpO2 (slow)').value, pr: r.sfloat('PR (slow)').value };
    if (flags & 0x04) out.measurementStatus = bits(r.u16('measurement status'), PLX_MEAS_STATUS);
    if (flags & 0x08) out.deviceStatus = bits(r.u24('device and sensor status'), PLX_DEVICE_STATUS);
    if (flags & 0x10) out.pai = r.sfloat('pulse amplitude index').value;
    return out;
  }

  // ---------------------------------------------------------------- Blood pressure 0x2A35 / 0x2A36
  const BP_STATUS = { 0: 'body movement detected', 1: 'cuff fit too loose', 2: 'irregular pulse detected', 5: 'improper measurement position' };
  const BP_PR_RANGE = ['pulse rate within range', 'pulse rate exceeds upper limit', 'pulse rate below lower limit', 'reserved'];
  const MMHG_PER_KPA = 7.500615758;

  function parseBloodPressure(data, intermediate) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const kPa = !!(flags & 0x01);
    const s = r.sfloat('systolic / cuff pressure'), d = r.sfloat('diastolic'), m = r.sfloat('MAP');
    const conv = v => v === null ? null : kPa ? Number((v * MMHG_PER_KPA).toFixed(1)) : v;
    const out = { kind: intermediate ? 'bp_cuff' : 'bp', flags, unit: kPa ? 'kPa' : 'mmHg' };
    if (intermediate) out.cuff = conv(s.value);
    else Object.assign(out, { sbp: conv(s.value), dbp: conv(d.value), map: conv(m.value), special: { sbp: s.special, dbp: d.special, map: m.special } });
    if (flags & 0x02) out.deviceTime = r.dateTime();
    if (flags & 0x04) out.pr = r.sfloat('pulse rate').value;
    if (flags & 0x08) out.userId = r.u8('user id');
    if (flags & 0x10) {
      const w = r.u16('measurement status');
      out.measurementStatus = bits(w, BP_STATUS).concat(((w >> 3) & 3) ? [BP_PR_RANGE[(w >> 3) & 3]] : []);
    }
    return out;
  }

  // ---------------------------------------------------------------- Health thermometer 0x2A1C / 0x2A1E
  const TEMP_TYPE = { 1: 'armpit', 2: 'body (general)', 3: 'ear (usually earlobe)', 4: 'finger', 5: 'gastro-intestinal tract',
    6: 'mouth', 7: 'rectum', 8: 'toe', 9: 'tympanum (ear drum)' };

  function parseTemperature(data, intermediate) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const f = r.float('temperature');
    const fahrenheit = !!(flags & 0x01);
    const out = { kind: intermediate ? 'temp_intermediate' : 'temp', flags, unit: fahrenheit ? '°F' : '°C',
      tempOriginal: f.value, special: { temp: f.special },
      temp: f.value === null ? null : fahrenheit ? Number(((f.value - 32) * 5 / 9).toFixed(2)) : f.value };
    if (flags & 0x02) out.deviceTime = r.dateTime();
    if (flags & 0x04) { const t = r.u8('temperature type'); out.site = TEMP_TYPE[t] || 'reserved (' + t + ')'; }
    return out;
  }

  // ---------------------------------------------------------------- Weight scale 0x2A9D
  const LB_PER_KG = 2.2046226218;
  function parseWeight(data) {
    const r = new Reader(data);
    const flags = r.u8('flags');
    const imperial = !!(flags & 0x01);
    const raw = r.u16('weight');
    const out = { kind: 'weight', flags, unit: imperial ? 'lb' : 'kg' };
    if (raw === 0xFFFF) { out.weight = null; out.special = { weight: 'measurement unsuccessful' }; }
    else out.weight = imperial ? Number((raw * 0.01 / LB_PER_KG).toFixed(3)) : Number((raw * 0.005).toFixed(3));
    out.weightOriginal = raw === 0xFFFF ? null : imperial ? Number((raw * 0.01).toFixed(2)) : out.weight;
    if (flags & 0x02) out.deviceTime = r.dateTime();
    if (flags & 0x04) out.userId = r.u8('user id');
    if (flags & 0x08) {
      out.bmi = Number((r.u16('BMI') * 0.1).toFixed(1));
      const h = r.u16('height');
      out.height = imperial ? Number((h * 0.1 * 2.54).toFixed(1)) : Number((h * 0.1).toFixed(1)); // 0.001 m → cm; 0.1 in → cm
    }
    return out;
  }

  // ---------------------------------------------------------------- registry
  const SERVICES = {
    heart_rate:         { label: 'Heart rate monitor (chest strap, HR sensor)', service: 0x180D, chars: [{ uuid: 0x2A37, name: 'Heart Rate Measurement', mode: 'notify', parse: parseHeartRate }] },
    pulse_oximeter:     { label: 'Pulse oximeter', service: 0x1822, chars: [
      { uuid: 0x2A5F, name: 'PLX Continuous Measurement', mode: 'notify', parse: parsePlxContinuous },
      { uuid: 0x2A5E, name: 'PLX Spot-Check Measurement', mode: 'indicate', parse: parsePlxSpotCheck }] },
    blood_pressure:     { label: 'Blood pressure monitor', service: 0x1810, chars: [
      { uuid: 0x2A35, name: 'Blood Pressure Measurement', mode: 'indicate', parse: d => parseBloodPressure(d, false) },
      { uuid: 0x2A36, name: 'Intermediate Cuff Pressure', mode: 'notify', parse: d => parseBloodPressure(d, true), optional: true }] },
    health_thermometer: { label: 'Thermometer', service: 0x1809, chars: [
      { uuid: 0x2A1C, name: 'Temperature Measurement', mode: 'indicate', parse: d => parseTemperature(d, false) },
      { uuid: 0x2A1E, name: 'Intermediate Temperature', mode: 'notify', parse: d => parseTemperature(d, true), optional: true }] },
    weight_scale:       { label: 'Weight scale', service: 0x181D, chars: [{ uuid: 0x2A9D, name: 'Weight Measurement', mode: 'indicate', parse: parseWeight }] },
  };
  const DEVICE_INFO = { service: 0x180A, manufacturer: 0x2A29, model: 0x2A24 };
  const BATTERY = { service: 0x180F, level: 0x2A19 };

  const QUESTIONABLE = ['questionable measurement detected', 'invalid measurement detected', 'measurement unavailable',
    'early estimated data', 'calibration ongoing', 'signal processing irregularity detected', 'inadequate signal detected',
    'poor signal detected', 'erratic signal detected', 'non-pulsatile signal detected', 'questionable pulse detected',
    'sensor interference detected', 'sensor displaced', 'sensor malfunctioning', 'equipment malfunction detected',
    'body movement detected', 'cuff fit too loose', 'improper measurement position'];
  const INVALIDATING = ['invalid measurement detected', 'measurement unavailable', 'sensor unconnected to user', 'sensor disconnected'];

  /** Parsed packet → Observations (source "device"). meta: {deviceName, deviceId, receivedAt, rawHex, replay} */
  function toObservations(p, meta) {
    meta = meta || {};
    const receivedAt = meta.receivedAt || Date.now();
    const devMs = dateTimeToMs(p.deviceTime);
    const status = (p.measurementStatus || []).concat(p.deviceStatus || []);
    let quality = observation.QUALITY.OK;
    if (status.some(s => INVALIDATING.includes(s))) quality = observation.QUALITY.INVALID;
    else if (status.some(s => QUESTIONABLE.includes(s))) quality = observation.QUALITY.LOW;
    if (p.kind === 'heart_rate' && p.contact === 'not-detected') quality = observation.QUALITY.ARTIFACT;
    const base = {
      kind: p.kind, deviceName: meta.deviceName || null, deviceId: meta.deviceId || null,
      characteristic: meta.characteristic || null, rawHex: meta.rawHex || null,
      timeSource: devMs !== null ? 'device clock (no time zone; read as local time)' : 'time received',
      receivedAt: new Date(receivedAt).toISOString(),
    };
    if (status.length) base.status = status;
    if (status.includes('data for demonstration') || status.includes('data for testing')) base.deviceSaysDemoOrTestData = true;
    if (meta.replay) base.replay = 'synthetic packet replay — no hardware involved';
    const ts = devMs !== null ? devMs : receivedAt;
    const out = [];
    const add = (param, value, extra) => out.push(observation.make({ param, value, source: observation.SOURCE.DEVICE, timestamp: ts,
      quality: value === null ? undefined : quality, provenance: Object.assign({}, base, extra || {}) }));
    switch (p.kind) {
      case 'heart_rate':
        add('hr', p.hr === 0 ? null : p.hr, { contact: p.contact, rrIntervals_s: p.rrIntervals.length ? p.rrIntervals : undefined, energyKJ: p.energyKJ === null ? undefined : p.energyKJ });
        break;
      case 'plx_spot': case 'plx_continuous':
        add('spo2', p.spo2, p.special.spo2 ? { special: p.special.spo2 } : null);
        add('pr', p.pr, p.special.pr ? { special: p.special.pr } : null);
        if (p.pai !== undefined && p.pai !== null) add('pi', p.pai, { note: 'Pulse amplitude index as reported by the device' });
        break;
      case 'bp':
        add('sbp', p.sbp, { originalUnit: p.unit }); add('dbp', p.dbp, { originalUnit: p.unit });
        add('map', p.map, { originalUnit: p.unit, note: 'MAP reported by the device (device algorithm), not computed by this app' });
        if (p.pr !== undefined && p.pr !== null) add('pr', p.pr);
        break;
      case 'temp':
        add('temp', p.temp, { originalUnit: p.unit, originalValue: p.tempOriginal, site: p.site });
        break;
      case 'weight':
        add('weight', p.weight, { originalUnit: p.unit, originalValue: p.weightOriginal, userId: p.userId });
        if (p.bmi) add('bmi', p.bmi, { note: 'BMI reported by the scale' });
        if (p.height) add('height', p.height, { note: 'height stored in the scale' });
        break;
      // bp_cuff and temp_intermediate are live progress values: shown, not stored
    }
    return out;
  }

  // ---------------------------------------------------------------- encoders (tests and the packet-replay demo)
  class Writer {
    constructor() { this.b = []; }
    u8(v) { this.b.push(v & 0xFF); return this; }
    u16(v) { this.b.push(v & 0xFF, (v >> 8) & 0xFF); return this; }
    u24(v) { this.b.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF); return this; }
    u32(v) { this.b.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); return this; }
    sfloat(v, e) { return this.u16(encodeSFLOAT(v, e)); }
    float(v, e) { return this.u32(encodeFLOAT(v, e)); }
    dateTime(d) { return this.u16(d.getFullYear()).u8(d.getMonth() + 1).u8(d.getDate()).u8(d.getHours()).u8(d.getMinutes()).u8(d.getSeconds()); }
    bytes() { return Uint8Array.from(this.b); }
  }
  const bitWord = (names, table) => (names || []).reduce((w, n) => { const k = Object.keys(table).find(b => table[b] === n); return k === undefined ? w : w | (1 << Number(k)); }, 0);

  const encode = {
    heart_rate(o) {
      const w = new Writer(), wide = o.hr > 255;
      const flags = (wide ? 1 : 0) | (o.contact === 'detected' ? 6 : o.contact === 'not-detected' ? 4 : 0) | (o.energyKJ != null ? 8 : 0) | (o.rrIntervals && o.rrIntervals.length ? 0x10 : 0);
      w.u8(flags); wide ? w.u16(o.hr) : w.u8(o.hr);
      if (o.energyKJ != null) w.u16(o.energyKJ);
      (o.rrIntervals || []).forEach(rr => w.u16(Math.round(rr * 1024)));
      return w.bytes();
    },
    plx_continuous(o) {
      const w = new Writer();
      const flags = (o.measurementStatus ? 0x04 : 0) | (o.deviceStatus ? 0x08 : 0) | (o.pai != null ? 0x10 : 0);
      w.u8(flags).sfloat(o.spo2, 0).sfloat(o.pr, 0);
      if (o.measurementStatus) w.u16(bitWord(o.measurementStatus, PLX_MEAS_STATUS));
      if (o.deviceStatus) w.u24(bitWord(o.deviceStatus, PLX_DEVICE_STATUS));
      if (o.pai != null) w.sfloat(o.pai, -1);
      return w.bytes();
    },
    plx_spot(o) {
      const w = new Writer();
      const flags = (o.time ? 1 : 0) | (o.measurementStatus ? 2 : 0) | (o.deviceStatus ? 4 : 0) | (o.pai != null ? 8 : 0);
      w.u8(flags).sfloat(o.spo2, 0).sfloat(o.pr, 0);
      if (o.time) w.dateTime(o.time);
      if (o.measurementStatus) w.u16(bitWord(o.measurementStatus, PLX_MEAS_STATUS));
      if (o.deviceStatus) w.u24(bitWord(o.deviceStatus, PLX_DEVICE_STATUS));
      if (o.pai != null) w.sfloat(o.pai, -1);
      return w.bytes();
    },
    bp(o) {
      const w = new Writer(), kPa = o.unit === 'kPa', e = kPa ? -1 : 0;
      const flags = (kPa ? 1 : 0) | (o.time ? 2 : 0) | (o.pr != null ? 4 : 0) | (o.userId != null ? 8 : 0) | (o.status ? 0x10 : 0);
      w.u8(flags).sfloat(o.sbp, e).sfloat(o.dbp, e).sfloat(o.map, e);
      if (o.time) w.dateTime(o.time);
      if (o.pr != null) w.sfloat(o.pr, 0);
      if (o.userId != null) w.u8(o.userId);
      if (o.status) w.u16(bitWord(o.status, BP_STATUS) | ((o.prRange || 0) << 3));
      return w.bytes();
    },
    bp_cuff(o) { return new Writer().u8(0).sfloat(o.cuff, 0).sfloat(null).sfloat(null).bytes(); },
    temp(o) {
      const w = new Writer(), f = o.unit === '°F';
      const typeId = o.site ? Number(Object.keys(TEMP_TYPE).find(k => TEMP_TYPE[k] === o.site)) : null;
      w.u8((f ? 1 : 0) | (o.time ? 2 : 0) | (typeId ? 4 : 0)).float(o.temp, -1);
      if (o.time) w.dateTime(o.time);
      if (typeId) w.u8(typeId);
      return w.bytes();
    },
    weight(o) {
      const w = new Writer(), lb = o.unit === 'lb';
      w.u8((lb ? 1 : 0) | (o.time ? 2 : 0) | (o.userId != null ? 4 : 0) | (o.bmi != null ? 8 : 0));
      w.u16(o.weight === null ? 0xFFFF : Math.round(o.weight / (lb ? 0.01 : 0.005)));
      if (o.time) w.dateTime(o.time);
      if (o.userId != null) w.u8(o.userId);
      if (o.bmi != null) { w.u16(Math.round(o.bmi * 10)); w.u16(Math.round(lb ? o.heightCm / 2.54 * 10 : o.heightCm * 10)); }
      return w.bytes();
    },
  };

  const PARSERS = { heart_rate: parseHeartRate, plx_spot: parsePlxSpotCheck, plx_continuous: parsePlxContinuous,
    bp: d => parseBloodPressure(d, false), bp_cuff: d => parseBloodPressure(d, true),
    temp: d => parseTemperature(d, false), temp_intermediate: d => parseTemperature(d, true), weight: parseWeight };

  function toHex(bytes) { return Array.from(toBytes(bytes), b => b.toString(16).padStart(2, '0')).join(' '); }
  function toBytes(d) { const dv = toDataView(d); return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength); }
  function fromHex(s) {
    const clean = String(s).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
    if (clean.length % 2) throw new Error('odd number of hex digits');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  const uuidName = n => '0x' + n.toString(16).toUpperCase().padStart(4, '0');

  return { decodeSFLOAT, decodeFLOAT, encodeSFLOAT, encodeFLOAT, parseHeartRate, parsePlxSpotCheck, parsePlxContinuous,
    parseBloodPressure, parseTemperature, parseWeight, toObservations, encode, PARSERS, SERVICES, DEVICE_INFO, BATTERY,
    PLX_MEAS_STATUS, PLX_DEVICE_STATUS, BP_STATUS, TEMP_TYPE, toHex, fromHex, dateTimeToMs, uuidName };
});
