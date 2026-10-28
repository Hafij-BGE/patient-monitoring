/* Device catalogue for the Devices tab: generic classes of medical devices found
 * in hospitals and homes, the standard interface routes each class commonly
 * offers, and which routes this app can use in the current runtime.
 *
 * Classes are generic (no brand names). "Typical routes" lists interfaces that
 * such devices often provide; whether a given model supports one must be checked
 * in its own interface documentation. Also hosts importAny(), which detects the
 * format of a file (HL7 v2, FHIR, SDC XML, CSV/JSON) and calls the right parser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./hl7v2.js'), require('./fhir.js'), require('./sdc.js'), require('../data/importer.js'));
  else (root.PM = root.PM || {}).catalog = factory(root.PM.hl7v2, root.PM.fhir, root.PM.sdc, root.PM.importer);
})(this, function (hl7v2, fhir, sdc, importer) {
  'use strict';

  const ROUTES = {
    'hl7-mllp':   { label: 'HL7 v2 over MLLP (TCP listener)', std: 'HL7 v2.6 ORU^R01, IHE PCD-01 (DEC)', live: true,
      note: 'The monitor, central station or interface engine sends ORU^R01 messages to this computer. Desktop app only: a web page cannot open a TCP port.' },
    'hl7-serial': { label: 'HL7 v2 over serial port', std: 'HL7 v2 with MLLP or CR framing, RS-232/USB', live: true,
      note: 'For devices with an RS-232 or USB-serial HL7 output. Uses Web Serial (Chrome/Edge or the desktop app).' },
    'ble':        { label: 'Bluetooth LE standard health profile', std: 'Bluetooth SIG HRS, PLXS, BLS, HTS, WSS; IEEE 11073-20601 number formats', live: true,
      note: 'For devices that implement the public Bluetooth SIG profiles. Uses Web Bluetooth (Chrome/Edge or the desktop app).' },
    'hl7-file':   { label: 'HL7 v2 message file', std: 'HL7 v2.x ORU^R01 (.hl7, .txt)', live: false,
      note: 'A saved message log or export from a monitor, gateway or interface engine.' },
    'fhir-file':  { label: 'FHIR R4 Observation / Bundle', std: 'HL7 FHIR R4, vital signs profile, LOINC or MDC codes', live: false,
      note: 'JSON exported from an EHR, a device gateway or a remote-monitoring platform.' },
    'sdc-file':   { label: 'SDC MDIB XML', std: 'IEEE 11073-10207 (BICEPS) / 11073-20701 SDC', live: false,
      note: 'A saved GetMdibResponse or EpisodicMetricReport. Live SDC needs WS-Discovery and TLS, which this app does not implement.' },
    'csv-file':   { label: 'CSV / JSON table', std: 'Vendor or spreadsheet export', live: false,
      note: 'Tables exported from a device app or typed in a spreadsheet. Uses the Data import tab.' },
    'manual':     { label: 'Manual entry', std: 'Read from the device display', live: false,
      note: 'Type a value read from the device. Stored with source "user". Uses the Data import tab.' },
    'demo':       { label: 'Synthetic HL7 feed (no hardware)', std: 'HL7 v2 ORU^R01 generated in the page', live: true,
      note: 'Plays scripted messages from a synthetic central station through the same parser as the live routes.' },
  };

  const CLASSES = [
    { id: 'bedside', label: 'Bedside multiparameter monitor', params: 'ECG HR, SpO₂, PR, NIBP, IBP, RR, EtCO₂, temperature',
      routes: ['hl7-mllp', 'hl7-serial', 'sdc-file', 'hl7-file', 'manual', 'demo'] },
    { id: 'central', label: 'Central station / device integration gateway', params: 'All parameters of the connected bedside monitors',
      routes: ['hl7-mllp', 'hl7-file', 'fhir-file', 'demo'] },
    { id: 'spotcheck', label: 'Spot-check vital signs monitor', params: 'NIBP, SpO₂, PR, temperature',
      routes: ['hl7-mllp', 'hl7-serial', 'fhir-file', 'hl7-file', 'ble', 'manual'] },
    { id: 'oximeter', label: 'Pulse oximeter', params: 'SpO₂, PR, perfusion index',
      routes: ['ble', 'hl7-serial', 'csv-file', 'manual'] },
    { id: 'nibp', label: 'Automated blood pressure monitor', params: 'SBP, DBP, MAP, PR',
      routes: ['ble', 'hl7-serial', 'csv-file', 'manual'] },
    { id: 'thermo', label: 'Clinical thermometer', params: 'Body temperature',
      routes: ['ble', 'csv-file', 'manual'] },
    { id: 'ecg', label: 'ECG telemetry / Holter / chest strap', params: 'Heart rate, RR intervals',
      routes: ['ble', 'hl7-mllp', 'hl7-file', 'csv-file'] },
    { id: 'capno', label: 'Capnograph', params: 'EtCO₂, airway respiratory rate',
      routes: ['hl7-serial', 'hl7-mllp', 'sdc-file', 'manual'] },
    { id: 'vent', label: 'Ventilator / anaesthesia workstation', params: 'Airway RR, EtCO₂ (other ventilation values are not shown)',
      routes: ['sdc-file', 'hl7-mllp', 'hl7-serial', 'hl7-file'] },
    { id: 'scale', label: 'Patient or bed scale', params: 'Weight, height, BMI',
      routes: ['ble', 'hl7-serial', 'csv-file', 'manual'] },
    { id: 'rpm', label: 'Wearable patch / remote-monitoring hub', params: 'HR, SpO₂, RR, temperature',
      routes: ['fhir-file', 'ble', 'csv-file'] },
    { id: 'ehr', label: 'EHR or health record export', params: 'Vital signs recorded in the chart',
      routes: ['fhir-file', 'hl7-file', 'csv-file'] },
  ];

  /**
   * Whether a route works here. env: { isSecureContext, navigator, PMDesktop }.
   * Returns { ok, reason }.
   */
  function availability(route, env) {
    env = env || (typeof window !== 'undefined' ? window : {});
    const nav = env.navigator || {};
    switch (route) {
      case 'hl7-mllp':
        return env.PMDesktop && env.PMDesktop.mllp ? { ok: true, reason: 'desktop app' } : { ok: false, reason: 'desktop app only (a browser page cannot listen on a TCP port)' };
      case 'hl7-serial':
        if (!env.isSecureContext) return { ok: false, reason: 'needs http://localhost or the desktop app' };
        return nav.serial ? { ok: true, reason: 'Web Serial' } : { ok: false, reason: 'browser has no Web Serial (use Chrome/Edge or the desktop app)' };
      case 'ble':
        if (!env.isSecureContext) return { ok: false, reason: 'needs http://localhost or the desktop app' };
        return nav.bluetooth ? { ok: true, reason: 'Web Bluetooth' } : { ok: false, reason: 'browser has no Web Bluetooth (use Chrome/Edge or the desktop app)' };
      default:
        return ROUTES[route] ? { ok: true, reason: 'works offline in any browser' } : { ok: false, reason: 'unknown route' };
    }
  }

  /** Format of a text file: 'hl7' | 'fhir' | 'sdc' | 'table'. */
  function detect(text, name) {
    const head = String(text).replace(/^﻿/, '').slice(0, 4000).replace(/^[\s\x0b]+/, '');
    if (/\.hl7$/i.test(name || '') || head.startsWith('MSH|')) return 'hl7';
    if (/\.xml$/i.test(name || '') || sdc.looksLike(head)) return 'sdc';
    if (fhir.looksLike(head)) return 'fhir';
    return 'table';
  }

  /**
   * Import a file with automatic format detection. Returns the importer-style
   * { observations, report } where report always has `format` and `errors`,
   * and `details` keeps the parser's own report for the hospital formats.
   * opts: { source, file, timezone, acceptLocation, receivedAt, ...importer options }
   */
  function importAny(text, name, opts) {
    opts = Object.assign({}, opts || {});
    const kind = detect(text, name);
    if (kind === 'table') return importer.importText(text, name, opts);
    const meta = { source: opts.source || 'imported', file: name, receivedAt: opts.receivedAt, timezone: opts.timezone, acceptLocation: opts.acceptLocation, route: kind + '-file' };
    const r = kind === 'hl7' ? hl7v2.importText(text, meta) : kind === 'fhir' ? fhir.importJSON(text, meta) : sdc.importXML(text, meta);
    const obs = r.observations;
    const params = Array.from(new Set(obs.map(o => o.param)));
    const ts = obs.map(o => o.timestamp).filter(Number.isFinite);
    const warnings = (r.report.warnings || []).concat((r.report.rejected || []).map(x => 'rejected ' + x));
    return { observations: obs, report: {
      file: name, format: { hl7: 'HL7 v2 (ORU^R01)', fhir: 'FHIR R4', sdc: 'SDC MDIB XML' }[kind], kind,
      errors: r.report.errors || [], warnings,
      rowsRead: (r.report.rows || []).length, params, accepted: obs.filter(o => o.value !== null && o.quality !== 'invalid').length,
      missing: obs.filter(o => o.value === null).length, empty: 0, duplicates: 0,
      invalid: (r.report.rows || []).filter(x => /^invalid/.test(x.result))
        .map(x => ({ line: x.controlId || x.id || x.handle || '', column: [x.code, x.param].filter(Boolean).join(' → '), reason: x.result }))
        .concat(obs.filter(o => o.quality === 'invalid').map(o => ({ line: o.provenance.controlId || o.provenance.resourceId || o.provenance.handle || '', column: o.param, reason: 'outside plausible range (kept, marked invalid)' }))),
      conflicts: [], timeRange: ts.length ? { start: Math.min(...ts), end: Math.max(...ts) } : null,
      details: r.report } };
  }

  return { ROUTES, CLASSES, availability, detect, importAny };
});
