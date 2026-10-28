/* Common observation data model. Every value shown or stored by the app is an
 * Observation that keeps its source, unit, timestamp, quality and provenance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./units.js'));
  else (root.PM = root.PM || {}).observation = factory(root.PM.units);
})(this, function (units) {
  'use strict';

  const SOURCE = Object.freeze({
    SIMULATED: 'simulated', // value produced by the simulation engine (incl. its device-like estimators)
    DERIVED: 'derived',     // calculated from other values (BMI, BSA, MAP formula, pulse pressure)
    DEVICE: 'device',       // reported live by a connected device (e.g. BLE profile)
    IMPORTED: 'imported',   // historical record loaded from a file
    USER: 'user',           // entered manually by the user
  });

  const QUALITY = Object.freeze({
    OK: 'ok',
    LOW: 'low-quality',      // value present but signal quality index below threshold
    MISSING: 'missing',      // no value available (never stored as 0)
    INVALID: 'invalid',      // value present but rejected by validation
    ARTIFACT: 'artifact',
  });

  let seq = 0;

  /**
   * @param {object} o
   *  param, value (number|null), unit, source, timestamp (ms since epoch or null),
   *  quality, provenance (object: device, file, method, ...), simTime (s, optional)
   */
  function make(o) {
    if (!units.PARAMS[o.param]) throw new Error('unknown parameter: ' + o.param);
    if (!Object.values(SOURCE).includes(o.source)) throw new Error('unknown source: ' + o.source);
    const value = (o.value === null || o.value === undefined || Number.isNaN(o.value)) ? null : Number(o.value);
    const quality = value === null ? QUALITY.MISSING : (o.quality || QUALITY.OK);
    return Object.freeze({
      id: o.id || ('obs-' + (++seq)),
      param: o.param,
      value,
      unit: o.unit || units.PARAMS[o.param].unit,
      source: o.source,
      timestamp: Number.isFinite(o.timestamp) ? o.timestamp : null,
      simTime: Number.isFinite(o.simTime) ? o.simTime : null,
      quality,
      provenance: Object.freeze(Object.assign({}, o.provenance || {})),
    });
  }

  const isMissing = obs => obs.value === null;

  return { SOURCE, QUALITY, make, isMissing };
});
