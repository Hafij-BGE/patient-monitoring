'use strict';
// Android bridge: Health Connect records and BLE notifications become "device"
// observations; bad records are rejected with a reason, never clamped.
const test = require('node:test');
const assert = require('node:assert/strict');
const AB = require('../../src/devices/androidBridge.js');
const gatt = require('../../src/devices/gatt.js');

const T = Date.UTC(2026, 9, 27, 8, 0, 0);

test('health connect: valid records stored as device values with provenance', () => {
  const r = AB.healthConnectToObservations({ days: 7, errors: [{ type: 'StepsRecord', error: 'permission not granted' }], records: [
    { param: 'hr', value: 64, unit: 'bpm', time: T, origin: 'com.example.watch', type: 'HeartRateRecord' },
    { param: 'spo2', value: 97, unit: '%', time: T, origin: 'com.example.watch', type: 'OxygenSaturationRecord' },
    { param: 'temp', value: 36.6, unit: '°C', time: T, origin: 'x', type: 'BodyTemperatureRecord' },
    { param: 'hr', value: 64, unit: 'bpm', time: T, origin: 'com.example.watch', type: 'HeartRateRecord' }, // duplicate
  ] });
  assert.equal(r.observations.length, 3);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.errors.length, 1);
  const hr = r.observations[0];
  assert.equal(hr.source, 'device'); assert.equal(hr.value, 64); assert.equal(hr.unit, 'bpm'); assert.equal(hr.timestamp, T);
  assert.equal(hr.provenance.route, 'health-connect'); assert.equal(hr.provenance.dataOrigin, 'com.example.watch');
});

test('health connect: unknown, non-numeric, out-of-range and untimed records are rejected', () => {
  const r = AB.healthConnectToObservations({ records: [
    { param: 'glucose', value: 5, unit: 'mmol/L', time: T },
    { param: 'hr', value: 'abc', unit: 'bpm', time: T },
    { param: 'spo2', value: 140, unit: '%', time: T },
    { param: 'hr', value: 70, unit: 'bpm' },
    { param: 'sbp', value: 16, unit: 'kPa', time: T },
  ] });
  assert.equal(r.rejected.length, 4);
  assert.equal(r.observations.length, 1);
  assert.ok(Math.abs(r.observations[0].value - 16 * 7.50062) < 0.01, 'kPa converted to mmHg');
  assert.match(r.rejected[2].reason, /outside/);
  assert.deepEqual(AB.healthConnectToObservations({}).observations, []);
});

test('ble heart rate: hex notification decoded through gatt with route ble-hrs', () => {
  const raw = gatt.toHex(gatt.encodeHeartRate({ hr: 72, contact: 'detected', rrIntervals: [0.8] }));
  const r = AB.bleHeartRateToObservations({ raw, time: T, device: 'Strap' });
  assert.equal(r.parsed.hr, 72);
  assert.equal(r.observations.length, 1);
  const o = r.observations[0];
  assert.equal(o.source, 'device'); assert.equal(o.value, 72); assert.equal(o.timestamp, T);
  assert.equal(o.provenance.route, 'ble-hrs'); assert.equal(o.provenance.deviceName, 'Strap');
  assert.throws(() => AB.bleHeartRateToObservations({ raw: '1', time: T }));
});

test('base64 helper matches Buffer', () => {
  const b = new Uint8Array(70000).map((_, i) => i * 7);
  assert.equal(AB.toBase64(b), Buffer.from(b).toString('base64'));
});
