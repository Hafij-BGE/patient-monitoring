/* Packet replay: a demonstration of the device data path WITHOUT hardware.
 *
 * Builds byte-exact BLE packets with the encoders in gatt.js and pushes them
 * through the same parse → Observation path a real device uses. Every
 * observation carries provenance.replay and the device name "Packet replay
 * (synthetic)", so replayed values can never be mistaken for real readings.
 * The numbers are made up for the demo and do not come from any person. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gatt.js'));
  else (root.PM = root.PM || {}).replay = factory(root.PM.gatt);
})(this, function (gatt) {
  'use strict';

  const NAME = 'Packet replay (synthetic)';
  const CHAR = { heart_rate: '0x2A37 Heart Rate Measurement', plx_continuous: '0x2A5F PLX Continuous Measurement',
    plx_spot: '0x2A5E PLX Spot-Check Measurement', bp: '0x2A35 Blood Pressure Measurement', bp_cuff: '0x2A36 Intermediate Cuff Pressure',
    temp: '0x2A1C Temperature Measurement', weight: '0x2A9D Weight Measurement' };

  /** A 60 s scripted session: HR strap and oximeter every second, one BP
   *  measurement with cuff-pressure progress, one thermometer and one scale
   *  reading, and two deliberately faulty packets. Returns [{at, kind, bytes}]. */
  function script() {
    const s = [];
    for (let t = 0; t < 60; t++) {
      const hr = 72 + Math.round(3 * Math.sin(t / 6));
      s.push({ at: t, kind: 'heart_rate', bytes: gatt.encode.heart_rate({ hr, contact: t >= 40 && t < 44 ? 'not-detected' : 'detected', rrIntervals: [60 / hr] }) });
      const probeOff = t >= 30 && t < 35;
      s.push({ at: t + 0.5, kind: 'plx_continuous', bytes: gatt.encode.plx_continuous({ spo2: probeOff ? null : 97 - (t > 50 ? 3 : 0), pr: probeOff ? null : hr,
        measurementStatus: probeOff ? ['measurement unavailable'] : [], deviceStatus: probeOff ? ['sensor disconnected'] : [], pai: probeOff ? null : 3.1 }) });
    }
    for (let p = 160, t = 5; p >= 50; p -= 10, t += 1.2) s.push({ at: t, kind: 'bp_cuff', bytes: gatt.encode.bp_cuff({ cuff: p }) });
    s.push({ at: 19, kind: 'bp', bytes: gatt.encode.bp({ sbp: 124, dbp: 79, map: 93, pr: 73, userId: 1, status: [], prRange: 0 }) });
    s.push({ at: 24, kind: 'temp', bytes: gatt.encode.temp({ temp: 36.9, site: 'mouth' }) });
    s.push({ at: 27, kind: 'weight', bytes: gatt.encode.weight({ weight: 70.4, bmi: 23.8, heightCm: 172 }) });
    s.push({ at: 45, kind: 'bp', bytes: gatt.encode.bp({ sbp: 131, dbp: 84, map: 99, status: ['body movement detected'] }) });
    s.push({ at: 47, kind: 'bp', bytes: Uint8Array.from([0x1E, 0x7C]) });         // truncated packet → parse error
    s.push({ at: 52, kind: 'temp', bytes: gatt.encode.temp({ temp: null }) });     // NaN special value → missing
    return s.sort((a, b) => a.at - b.at);
  }

  /** Decode one scripted packet exactly as a live notification would be. */
  function decode(item, receivedAt) {
    const meta = { deviceName: NAME, deviceId: 'replay', characteristic: CHAR[item.kind], rawHex: gatt.toHex(item.bytes), receivedAt, replay: true };
    try {
      const parsed = gatt.PARSERS[item.kind](item.bytes);
      return { parsed, meta, observations: gatt.toObservations(parsed, meta) };
    } catch (e) {
      return { error: e.message, meta, observations: [] };
    }
  }

  return { script, decode, NAME };
});
