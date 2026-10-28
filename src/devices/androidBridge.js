/* Converts messages from the Android app's native bridge (window.PMAndroid,
 * events 'pmandroid') into Observations. Two routes exist:
 *   - Health Connect: records that the user's own apps (for example a watch
 *     companion app) wrote to Health Connect, read only after the user grants
 *     read permission in the system dialog.
 *   - BLE Heart Rate Service: raw 0x2A37 notifications as hex, decoded by PM.gatt.
 * Both give source "device". Values outside the plausible range of the parameter
 * are rejected and reported, never clamped. Nothing here sends data anywhere. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/observation.js'), require('../core/units.js'), require('./gatt.js'));
  else (root.PM = root.PM || {}).androidBridge = factory(root.PM.observation, root.PM.units, root.PM.gatt);
})(this, function (observation, units, gatt) {
  'use strict';

  /** detail of an 'hc-records' event → {observations, rejected:[{param, value, unit, reason}], errors} */
  function healthConnectToObservations(detail) {
    const out = [], rejected = [], seen = new Set();
    for (const r of (detail && detail.records) || []) {
      const value = Number(r.value), time = Number(r.time);
      const bad = reason => rejected.push({ param: r.param, value: r.value, unit: r.unit, reason });
      if (!units.PARAMS[r.param]) { bad('parameter not supported'); continue; }
      if (!Number.isFinite(value)) { bad('not a number'); continue; }
      if (!Number.isFinite(time)) { bad('no timestamp'); continue; }
      const c = units.toCanonical(r.param, value, r.unit);
      if (c.error) { bad(c.error); continue; }
      if (!units.inRange(r.param, c.value)) { bad('outside ' + units.PARAMS[r.param].min + '–' + units.PARAMS[r.param].max + ' ' + units.PARAMS[r.param].unit); continue; }
      const key = r.param + '|' + time + '|' + c.value;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(observation.make({ param: r.param, value: c.value, source: observation.SOURCE.DEVICE, timestamp: time,
        provenance: { route: 'health-connect', recordType: r.type || null, dataOrigin: r.origin || null,
          originalValue: r.value, originalUnit: r.unit || null, timeSource: 'record time' } }));
    }
    return { observations: out, rejected, errors: (detail && detail.errors) || [] };
  }

  /** detail of a 'ble-hr' event {raw, time, device} → {parsed, observations} (throws on a malformed packet) */
  function bleHeartRateToObservations(detail) {
    const bytes = gatt.fromHex(detail.raw);
    const parsed = gatt.parseHeartRate(bytes);
    const observations = gatt.toObservations(parsed, { route: 'ble-hrs', deviceName: detail.device || null,
      receivedAt: Number.isFinite(detail.time) ? detail.time : Date.now(), rawHex: gatt.toHex(bytes) });
    return { parsed, observations };
  }

  /** Base64 of a Uint8Array / ArrayBuffer, for PMAndroid.saveBase64. */
  function toBase64(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64');
  }

  return { healthConnectToObservations, bleHeartRateToObservations, toBase64 };
});
