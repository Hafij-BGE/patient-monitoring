'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gatt = require('../../src/devices/gatt.js');

// Byte vectors below are written by hand from the specification, not produced by
// the encoder, so a mistake shared by encoder and decoder cannot hide.

test('Heart Rate Measurement 0x2A37: uint8/uint16, contact, energy, RR intervals', () => {
  assert.deepEqual(gatt.parseHeartRate('00 48'), { kind: 'heart_rate', flags: 0, hr: 72, contact: 'not-supported', energyKJ: null, rrIntervals: [] });
  const p = gatt.parseHeartRate('1F 2C 01 0A 00 00 04 00 02'); // u16 HR 300, contact detected, energy 10 kJ, RR 1.0 s and 0.5 s
  assert.equal(p.hr, 300); assert.equal(p.contact, 'detected'); assert.equal(p.energyKJ, 10);
  assert.deepEqual(p.rrIntervals, [1, 0.5]);
  assert.equal(gatt.parseHeartRate('04 50').contact, 'not-detected');
  assert.throws(() => gatt.parseHeartRate('01 48'), /too short/);
  assert.throws(() => gatt.fromHex('0'), /odd number/);
});

test('encoder round-trips through the parser', () => {
  for (const o of [{ hr: 64, contact: 'detected', rrIntervals: [0.9375] }, { hr: 300, energyKJ: 12 }, { hr: 50, contact: 'not-detected' }]) {
    const p = gatt.parseHeartRate(gatt.encodeHeartRate(o));
    assert.equal(p.hr, o.hr);
    assert.deepEqual(p.rrIntervals, o.rrIntervals || []);
  }
  assert.equal(gatt.toHex(gatt.encodeHeartRate({ hr: 72 })), '00 48');
});

test('heart-rate packets become "device" observations with provenance and contact-based quality', () => {
  const now = Date.UTC(2026, 9, 20, 6, 0, 0);
  const ok = gatt.toObservations(gatt.parseHeartRate('16 48 55 03'), { deviceName: 'Watch', receivedAt: now, rawHex: '16 48 55 03', route: 'ble-hrs' });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].param, 'hr'); assert.equal(ok[0].value, 72); assert.equal(ok[0].source, 'device');
  assert.equal(ok[0].timestamp, now); assert.equal(ok[0].quality, 'ok');
  assert.equal(ok[0].provenance.route, 'ble-hrs');
  assert.deepEqual(ok[0].provenance.rrIntervals_s, [0.833]);
  assert.equal(gatt.toObservations(gatt.parseHeartRate('04 50'), { receivedAt: now })[0].quality, 'artifact');
  const zero = gatt.toObservations(gatt.parseHeartRate('00 00'), { receivedAt: now })[0];
  assert.equal(zero.value, null); assert.equal(zero.quality, 'missing');
});
