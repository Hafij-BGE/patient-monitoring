'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gatt = require('../../src/devices/gatt.js');
const { BleDevice, availability, BACKOFF_S } = require('../../src/devices/webBluetooth.js');
const replay = require('../../src/devices/replay.js');

// Byte vectors below are written by hand from the specifications, not produced by
// the encoders, so a mistake shared by encoder and decoder cannot hide.

test('IEEE 11073 SFLOAT and FLOAT decoding, including special values', () => {
  assert.deepEqual(gatt.decodeSFLOAT(0x0061), { value: 97, special: null });       // 97
  assert.deepEqual(gatt.decodeSFLOAT(0xF170), { value: 36.8, special: null });     // 368 × 10^-1
  assert.deepEqual(gatt.decodeSFLOAT(0xFFFF), { value: -0.1, special: null });     // −1 × 10^-1
  assert.equal(gatt.decodeSFLOAT(0x07FF).special, 'NaN');
  assert.equal(gatt.decodeSFLOAT(0x0800).special, 'NRes');
  assert.equal(gatt.decodeSFLOAT(0x07FE).special, '+INF');
  assert.equal(gatt.decodeSFLOAT(0x0802).special, '-INF');
  assert.equal(gatt.decodeSFLOAT(0x0801).value, null);
  assert.deepEqual(gatt.decodeFLOAT(0xFF000170), { value: 36.8, special: null });
  assert.deepEqual(gatt.decodeFLOAT(0xFE000E66), { value: 36.86, special: null });
  assert.equal(gatt.decodeFLOAT(0x007FFFFF).special, 'NaN');
  assert.equal(gatt.decodeFLOAT(0x00800000).special, 'NRes');
  for (const [v, e] of [[97, 0], [36.8, -1], [-12.5, -1], [120, 0], [1.5, -2]]) assert.equal(gatt.decodeSFLOAT(gatt.encodeSFLOAT(v, e)).value, v);
  assert.throws(() => gatt.encodeSFLOAT(5000, 0), RangeError);
});

test('Heart Rate Measurement 0x2A37: uint8/uint16, contact, energy, RR intervals', () => {
  assert.deepEqual(gatt.parseHeartRate('00 48'), { kind: 'heart_rate', flags: 0, hr: 72, contact: 'not-supported', energyKJ: null, rrIntervals: [] });
  const p = gatt.parseHeartRate('1F 2C 01 0A 00 00 04 00 02'); // u16 HR 300, contact detected, energy 10 kJ, RR 1.0 s and 0.5 s
  assert.equal(p.hr, 300); assert.equal(p.contact, 'detected'); assert.equal(p.energyKJ, 10);
  assert.deepEqual(p.rrIntervals, [1, 0.5]);
  assert.equal(gatt.parseHeartRate('04 50').contact, 'not-detected');
  assert.throws(() => gatt.parseHeartRate('01 48'), /too short/);
});

test('PLX continuous 0x2A5F and spot-check 0x2A5E with status words', () => {
  const c = gatt.parsePlxContinuous('1C 61 00 48 00 00 20 08 80 00 1F F0'); // SpO2 97, PR 72, meas 0x2000 unavailable, dev 0x008008, PAI 3.1
  assert.equal(c.spo2, 97); assert.equal(c.pr, 72); assert.equal(c.pai, 3.1);
  assert.deepEqual(c.measurementStatus, ['measurement unavailable']);
  assert.deepEqual(c.deviceStatus, ['inadequate signal detected', 'sensor disconnected']);
  const s = gatt.parsePlxSpotCheck('01 60 00 4B 00 EA 07 0A 14 08 1E 00'); // SpO2 96, PR 75, 2026-10-20 08:30:00
  assert.equal(s.spo2, 96); assert.equal(s.pr, 75);
  assert.deepEqual(s.deviceTime, { year: 2026, month: 10, day: 20, hours: 8, minutes: 30, seconds: 0 });
  const nan = gatt.parsePlxContinuous('00 FF 07 FF 07');
  assert.equal(nan.spo2, null); assert.equal(nan.special.spo2, 'NaN');
});

test('Blood Pressure Measurement 0x2A35: mmHg and kPa, pulse, user, status bits', () => {
  const p = gatt.parseBloodPressure('1C 7C 00 4F 00 5D 00 49 00 01 0D 00', false); // 124/79 MAP 93, PR 73, user 1, movement+irregular, PR>upper
  assert.deepEqual([p.sbp, p.dbp, p.map, p.pr, p.userId], [124, 79, 93, 73, 1]);
  assert.deepEqual(p.measurementStatus, ['body movement detected', 'irregular pulse detected', 'pulse rate exceeds upper limit']);
  const k = gatt.parseBloodPressure('01 A0 F0 68 F0 7C F0', false); // 16.0 / 10.4 / 12.4 kPa
  assert.equal(k.unit, 'kPa');
  assert.equal(k.sbp, 120); assert.equal(k.dbp, 78); assert.equal(k.map, 93);
  assert.equal(gatt.parseBloodPressure('00 A0 00 FF 07 FF 07', true).cuff, 160);
});

test('Temperature 0x2A1C (°C/°F, site) and Weight 0x2A9D (kg/lb, BMI, height, failure)', () => {
  const t = gatt.parseTemperature('04 70 01 00 FF 06', false); // 36.8 °C, mouth
  assert.equal(t.temp, 36.8); assert.equal(t.site, 'mouth'); assert.equal(t.unit, '°C');
  const f = gatt.parseTemperature('01 DA 03 00 FF', false);   // 98.6 °F
  assert.equal(f.temp, 37); assert.equal(f.tempOriginal, 98.6);
  assert.equal(gatt.parseTemperature('00 FF FF 7F 00', false).temp, null);
  const w = gatt.parseWeight('08 B0 36 EE 00 B8 06');           // 70.0 kg, BMI 23.8, height 1.720 m
  assert.deepEqual([w.weight, w.bmi, w.height], [70, 23.8, 172]);
  const lb = gatt.parseWeight('01 48 3C');                      // 154.32 lb
  assert.ok(Math.abs(lb.weight - 70.0) < 0.01); assert.equal(lb.weightOriginal, 154.32);
  assert.equal(gatt.parseWeight('00 FF FF').weight, null);
});

test('encoders round-trip through the parsers for every profile', () => {
  const d = new Date(2026, 9, 20, 8, 30, 0);
  const cases = [
    ['heart_rate', { hr: 64, contact: 'detected', rrIntervals: [0.9375] }, p => [p.hr, p.rrIntervals[0]], [64, 0.9375]],
    ['plx_spot', { spo2: 95, pr: 80, time: d, pai: 2.4 }, p => [p.spo2, p.pr, p.pai, gatt.dateTimeToMs(p.deviceTime)], [95, 80, 2.4, d.getTime()]],
    ['bp', { sbp: 16.3, dbp: 10.1, map: 12.2, unit: 'kPa', status: ['cuff fit too loose'] }, p => [p.unit, p.measurementStatus[0]], ['kPa', 'cuff fit too loose']],
    ['temp', { temp: 101.2, unit: '°F', site: 'tympanum (ear drum)', time: d }, p => [p.tempOriginal, p.site], [101.2, 'tympanum (ear drum)']],
    ['weight', { weight: 154.3, unit: 'lb', bmi: 23.5, heightCm: 172.7, userId: 2 }, p => [p.weightOriginal, p.bmi, Math.round(p.height), p.userId], [154.3, 23.5, 173, 2]],
  ];
  for (const [kind, input, pick, want] of cases) assert.deepEqual(pick(gatt.PARSERS[kind](gatt.encode[kind](input))), want, kind);
});

test('device packets become "device" observations with provenance and status-based quality', () => {
  const now = Date.UTC(2026, 9, 20, 6, 0, 0);
  const bp = gatt.toObservations(gatt.parseBloodPressure('11 7C 00 4F 00 5D 00 01 00', false), { deviceName: 'Cuff', receivedAt: now, rawHex: 'x' });
  assert.deepEqual(bp.map(o => o.param), ['sbp', 'dbp', 'map']);
  assert.ok(bp.every(o => o.source === 'device' && o.timestamp === now));
  assert.equal(bp[0].quality, 'low-quality');                // body movement detected
  assert.match(bp[2].provenance.note, /reported by the device/); // device MAP is not "derived"
  const ox = gatt.toObservations(gatt.parsePlxContinuous('1C FF 07 FF 07 00 20 00 80 00 FF 07'), { receivedAt: now });
  assert.deepEqual(ox.map(o => [o.param, o.value, o.quality]), [['spo2', null, 'missing'], ['pr', null, 'missing']]);
  const hr = gatt.toObservations(gatt.parseHeartRate('04 50'), { receivedAt: now });
  assert.equal(hr[0].quality, 'artifact');
  const spot = gatt.toObservations(gatt.parsePlxSpotCheck('01 60 00 4B 00 EA 07 0A 14 08 1E 00'), { receivedAt: now });
  assert.equal(spot[0].timestamp, new Date(2026, 9, 20, 8, 30).getTime());
  assert.match(spot[0].provenance.timeSource, /device clock/);
  assert.equal(gatt.toObservations(gatt.parseBloodPressure('00 A0 00 FF 07 FF 07', true), {}).length, 0, 'cuff progress is not stored');
});

test('packet replay is labelled synthetic and exercises errors and missing values', () => {
  const items = replay.script();
  const out = items.map((it, i) => replay.decode(it, 1000 * i));
  const obs = out.flatMap(r => r.observations);
  assert.ok(obs.length > 100);
  assert.ok(obs.every(o => o.source === 'device' && /synthetic/.test(o.provenance.replay) && o.provenance.deviceName === replay.NAME));
  assert.equal(out.filter(r => r.error).length, 1);
  assert.ok(obs.some(o => o.param === 'spo2' && o.value === null));
  assert.ok(obs.some(o => o.param === 'temp' && o.value === null));
  assert.ok(obs.some(o => o.param === 'map' && o.value === 93));
});

// ---------------------------------------------------------------- fake Web Bluetooth
function fakeBluetooth(opts) {
  const listeners = {};
  const chars = {};
  const enc = new TextEncoder();
  const mkChar = uuid => ({ uuid, l: [], addEventListener(_, f) { this.l.push(f); }, removeEventListener() {},
    startNotifications: async () => {}, stopNotifications: async () => {},
    readValue: async () => uuid === 0x2A19 ? new DataView(Uint8Array.from([87]).buffer) : new DataView(enc.encode(uuid === 0x2A29 ? 'Example Co' : 'BP-1').buffer),
    emit(bytes) { const value = new DataView(Uint8Array.from(bytes).buffer); this.l.forEach(f => f({ target: { value } })); } });
  const services = { 0x1810: [0x2A35], 0x180A: [0x2A29, 0x2A24], 0x180F: [0x2A19] };
  let fails = opts.failConnects || 0;
  const device = {
    name: 'Test cuff', id: 'dev1',
    addEventListener(ev, f) { listeners[ev] = f; },
    gatt: {
      connected: false,
      async connect() {
        if (fails > 0) { fails--; throw new Error('out of range'); }
        this.connected = true;
        return { getPrimaryService: async id => {
          if (!services[id]) throw new Error('no service');
          return { getCharacteristic: async c => { if (!services[id].includes(c)) throw new Error('no char'); return chars[c] || (chars[c] = mkChar(c)); } };
        } };
      },
      disconnect() { this.connected = false; listeners.gattserverdisconnected && listeners.gattserverdisconnected(); },
    },
    drop() { this.gatt.connected = false; listeners.gattserverdisconnected(); },
  };
  return { device, chars, requested: null,
    async requestDevice(o) { this.requested = o; if (opts.cancel) { const e = new Error('cancelled'); e.name = 'NotFoundError'; throw e; } return device; } };
}

function harness(opts) {
  const bt = fakeBluetooth(opts || {});
  const timers = [], statuses = [], obs = [];
  const dev = new BleDevice({ bluetooth: bt, kinds: ['blood_pressure'], now: () => 5000,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
    onStatus: s => statuses.push(s), onObservations: l => obs.push(...l) });
  return { bt, dev, timers, statuses, obs };
}
const flush = () => new Promise(r => setImmediate(r));

test('Web Bluetooth availability needs a secure context and the API', () => {
  assert.equal(availability({ isSecureContext: false, navigator: { bluetooth: {} } }).ok, false);
  assert.match(availability({ isSecureContext: true, navigator: {} }).reason, /does not provide Web Bluetooth/);
  assert.equal(availability({ isSecureContext: true, navigator: { bluetooth: {} } }).ok, true);
});

test('connect: chooser filters, device info, battery, notifications → observations', async () => {
  const h = harness();
  assert.equal(await h.dev.request(), true);
  assert.deepEqual(h.bt.requested.filters, [{ services: [0x1810] }]);
  assert.ok(h.bt.requested.optionalServices.includes(0x180A));
  const last = h.statuses[h.statuses.length - 1];
  assert.equal(last.state, 'connected');
  assert.equal(last.manufacturer, 'Example Co'); assert.equal(last.model, 'BP-1'); assert.equal(last.battery, 87);
  h.bt.chars[0x2A35].emit([0x00, 0x7C, 0x00, 0x4F, 0x00, 0x5D, 0x00]);
  assert.deepEqual(h.obs.map(o => [o.param, o.value, o.source]), [['sbp', 124, 'device'], ['dbp', 79, 'device'], ['map', 93, 'device']]);
  assert.equal(h.obs[0].provenance.deviceName, 'Test cuff');
  h.bt.chars[0x2A35].emit([0x00, 0x7C]);
  assert.equal(h.dev.errors, 1, 'malformed packet counted, not thrown');
  assert.match(h.statuses[h.statuses.length - 1].message, /Malformed packet/);
});

test('cancelled chooser is reported, not thrown', async () => {
  const h = harness({ cancel: true });
  assert.equal(await h.dev.request(), false);
  assert.equal(h.statuses.pop().message, 'No device chosen.');
});

test('unexpected disconnect reconnects with 1-2-4-8-16 s backoff; user disconnect does not', async () => {
  const h = harness({});
  await h.dev.request();
  h.bt.device.drop();
  assert.equal(h.timers.length, 1); assert.equal(h.timers[0].ms, 1000);
  h.timers[0].f(); await flush();
  assert.equal(h.dev.state, 'connected');
  assert.equal(h.dev.attempt, 0, 'backoff resets after success');
  // now the device stays away: five attempts, then give up
  const h2 = harness({ failConnects: 99 });
  h2.dev.device = h2.bt.device; h2.dev.info.name = 'x';
  h2.dev.device.addEventListener('gattserverdisconnected', () => h2.dev.handleDisconnect());
  await h2.dev.connect(); // first failure schedules attempt 1
  for (let i = 0; i < 5; i++) { h2.timers[i].f(); await flush(); }
  assert.deepEqual(h2.timers.map(t => t.ms / 1000), BACKOFF_S);
  assert.equal(h2.dev.state, 'failed');
  const h3 = harness({});
  await h3.dev.request();
  h3.dev.disconnect();
  assert.equal(h3.timers.length, 0);
  assert.equal(h3.dev.state, 'disconnected');
});

test('a device without any supported profile is reported, not silently accepted', async () => {
  const h = harness({});
  h.dev.o.kinds = ['weight_scale'];
  h.bt.device.gatt.connect = async function () { this.connected = true; return { getPrimaryService: async () => { throw new Error('none'); } }; };
  assert.equal(await h.dev.request(), false);
  assert.ok(h.statuses.some(s => /none of the supported standard profiles/.test(s.message)));
});
