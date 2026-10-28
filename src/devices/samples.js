/* Synthetic example messages for the hospital routes (HL7 v2, FHIR, SDC) and a
 * scripted HL7 feed for demonstrating the live path without hardware.
 *
 * All numbers are made up for teaching and do not come from any person or device.
 * HL7 messages use processing ID "T" (training), FHIR resources carry the HTEST
 * security label and SDC metrics use MetricQuality Mode="Demo", so the parsers
 * mark every value from here as synthetic. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./hl7v2.js'), require('./fhir.js'), require('./sdc.js'));
  else (root.PM = root.PM || {}).samples = factory(root.PM.hl7v2, root.PM.fhir, root.PM.sdc);
})(this, function (hl7v2, fhir, sdc) {
  'use strict';

  /** Two ORU^R01 messages from a bedside monitor, one in kPa/°F, one with a missing value. */
  function hl7(now, location) {
    now = now || Date.now();
    const loc = location || 'ICU^01^01';
    const a = hl7v2.encodeORU({ sendingApp: 'SIM-BEDSIDE', eui: '0012340000000001', controlId: 'SIM0001', time: now - 60000, location: loc,
      observations: [{ param: 'hr', value: 78 }, { param: 'spo2', value: 97 }, { param: 'rr', value: 16 }, { param: 'temp', value: 37.1 },
        { param: 'sbp', value: 122 }, { param: 'dbp', value: 78 }, { param: 'map', value: 93 }] });
    const b = hl7v2.encodeORU({ sendingApp: 'SIM-BEDSIDE', eui: '0012340000000001', controlId: 'SIM0002', time: now, location: loc,
      observations: [{ param: 'hr', value: 81 }, { param: 'spo2', value: 96 }, { param: 'rr', value: null },
        { param: 'temp', value: 99.0, unit: '°F' }, { param: 'sbp', value: 16.4, unit: 'kPa' }, { param: 'dbp', value: 10.5, unit: 'kPa' },
        { param: 'art_sys', value: 118 }, { param: 'art_dia', value: 70 }, { param: 'art_map', value: 86 }, { param: 'etco2', value: 38 }] });
    return a + '\n' + b;
  }

  function fhirBundle(now) {
    return JSON.stringify(fhir.encodeBundle({ time: now || Date.now(), deviceName: 'Synthetic spot-check vital signs monitor',
      observations: [{ param: 'pr', value: 74 }, { param: 'spo2', value: 98 }, { param: 'temp', value: 36.8 }, { param: 'rr', value: null, absent: 'not-performed' },
        { param: 'weight', value: 71.2 }, { param: 'height', value: 172 }],
      bp: { sbp: 118, dbp: 76, map: 90 } }), null, 2);
  }

  function sdcMdib(now) {
    return sdc.encodeMdib({ time: now || Date.now(), manufacturer: 'PM-SIM (synthetic)', model: 'Demo SDC bedside monitor',
      metrics: [{ param: 'hr', value: 69 }, { param: 'spo2', value: 95, validity: 'Qst' }, { param: 'rr', value: 14 }, { param: 'etco2', value: 36 },
        { param: 'art_sys', value: 126 }, { param: 'art_dia', value: 72 }, { param: 'art_map', value: 90 }, { param: 'temp', value: null }] });
  }

  /**
   * Scripted live feed: one ORU^R01 every `period` seconds from a synthetic central
   * station that serves two beds. Messages for the other bed must be dropped by the
   * bed filter. It includes an SpO2 drop, a status X (missing) and an out-of-range value.
   * Returns [{at (s), text}] with MLLP framing removed.
   */
  function feed(o) {
    o = o || {};
    const n = o.count || 20, period = o.period || 2, t0 = o.now || Date.now();
    const mine = o.location || 'ICU^01^01', other = o.otherLocation || 'ICU^01^02';
    const out = [];
    for (let k = 0; k < n; k++) {
      const hr = 76 + Math.round(4 * Math.sin(k / 3));
      const spo2 = k >= 10 && k < 14 ? 88 : 97;
      const obs = [{ param: 'hr', value: hr }, { param: 'spo2', value: spo2 }, { param: 'rr', value: k === 6 ? null : 15 + (k % 3) },
        { param: 'etco2', value: 37 }, { param: 'art_sys', value: 120 + (k % 4) }, { param: 'art_dia', value: 72 }, { param: 'art_map', value: 88 }];
      if (k === 16) obs.push({ param: 'temp', value: 55 }); // out of plausible range → invalid
      if (k % 5 === 0) obs.push({ param: 'sbp', value: 124 }, { param: 'dbp', value: 80 }, { param: 'map', value: 95 });
      const loc = k % 4 === 3 ? other : mine;
      out.push({ at: k * period, location: loc, text: hl7v2.encodeORU({ sendingApp: 'SIM-CENTRAL', eui: '0012340000000099', controlId: 'FEED' + String(k + 1).padStart(4, '0'),
        time: t0 + k * period * 1000, location: loc, observations: obs }) });
    }
    return out;
  }

  return { hl7, fhirBundle, sdcMdib, feed };
});
