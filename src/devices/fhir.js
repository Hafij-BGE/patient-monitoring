/* HL7 FHIR R4 Observation import (single Observation, Bundle, or array).
 *
 * Codes: LOINC (FHIR vital signs profiles) or ISO/IEEE 11073 MDC (Personal Health
 * Device and Point-of-Care Device implementation guides). Values: valueQuantity,
 * or component[].valueQuantity for panels such as the blood pressure panel.
 *
 * Observation.subject, Patient and other person resources are ignored and never
 * stored. Device resources (in the Bundle or contained) give the device name.
 * meta.security HTEST (test health data) is shown as synthetic. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/units.js'), require('../core/observation.js'), require('./mdc.js'));
  else (root.PM = root.PM || {}).fhir = factory(root.PM.units, root.PM.observation, root.PM.mdc);
})(this, function (units, observation, mdc) {
  'use strict';

  const PERSON = ['Patient', 'Person', 'RelatedPerson', 'Practitioner', 'PractitionerRole'];
  const SKIP_STATUS = ['entered-in-error', 'cancelled'];

  const isTest = r => [].concat((r.meta && r.meta.security) || [], (r.meta && r.meta.tag) || []).some(c => c && c.code === 'HTEST');

  function parseTime(r) {
    const s = r.effectiveDateTime || r.effectiveInstant || (r.effectivePeriod && r.effectivePeriod.start) || r.issued || null;
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  function deviceName(d) {
    if (!d) return null;
    const n = (d.deviceName && d.deviceName[0] && d.deviceName[0].name) || (d.type && (d.type.text || (d.type.coding && d.type.coding[0] && d.type.coding[0].display))) || null;
    return [n, d.manufacturer, d.modelNumber].filter(Boolean).join(' · ') || d.id || null;
  }

  /**
   * opts: { source: 'device'|'imported', file, receivedAt }
   * Returns { observations, report: { resources, rows, warnings, errors } }.
   */
  function importJSON(input, opts) {
    opts = opts || {};
    const report = { resources: 0, rows: [], warnings: [], errors: [] }, out = [];
    let data = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input.replace(/^﻿/, '')); } catch (e) { report.errors.push('not valid JSON: ' + e.message); return { observations: out, report }; }
    }
    const resources = [];
    const collect = x => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(collect); return; }
      if (x.resourceType === 'Bundle') { (x.entry || []).forEach(e => collect(e && e.resource)); return; }
      if (x.resourceType) resources.push(x);
    };
    collect(data);
    report.resources = resources.length;
    if (!resources.length) { report.errors.push('no FHIR resources found (expected resourceType Observation or Bundle)'); return { observations: out, report }; }

    const devices = new Map();
    for (const r of resources) if (r.resourceType === 'Device') devices.set('Device/' + r.id, r);
    const persons = resources.filter(r => PERSON.includes(r.resourceType)).length;
    if (persons) report.warnings.push(persons + ' person resource(s) ignored; no patient identifiers are stored');
    let subjects = 0;

    const source = opts.source === 'device' ? observation.SOURCE.DEVICE : observation.SOURCE.IMPORTED;
    const receivedAt = opts.receivedAt || Date.now();

    for (const r of resources) {
      if (r.resourceType !== 'Observation') continue;
      if (r.subject) subjects++;
      const id = r.id || '(no id)';
      if (SKIP_STATUS.includes(r.status)) { report.rows.push({ id, result: 'skipped: status ' + r.status }); continue; }
      const contained = new Map((r.contained || []).filter(c => c.resourceType === 'Device').map(c => ['#' + c.id, c]));
      const devRef = r.device && r.device.reference;
      const dev = devRef ? (contained.get(devRef) || devices.get(devRef) || devices.get('Device/' + String(devRef).split('/').pop())) : null;
      const ts = parseTime(r);
      const base = { route: 'fhir', format: 'FHIR R4 Observation', file: opts.file || undefined, resourceId: id, status: r.status || null,
        device: deviceName(dev) || (r.device && r.device.display) || null,
        timeSource: ts !== null ? 'effective[x]' : 'time received', receivedAt: new Date(receivedAt).toISOString() };
      if (isTest(r)) base.replay = 'resource marked HTEST (test health data)';

      const parts = [{ code: r.code, q: r.valueQuantity, absent: r.dataAbsentReason, label: 'value' }]
        .concat((r.component || []).map((c, k) => ({ code: c.code, q: c.valueQuantity, absent: c.dataAbsentReason, label: 'component ' + (k + 1) })));
      for (const p of parts) {
        const codings = (p.code && p.code.coding) || [];
        const codeTxt = codings.map(c => c.code).filter(Boolean).join(', ') || (p.code && p.code.text) || '?';
        const hit = mdc.lookup(codings);
        if (!hit) { if (p.q || p.label === 'value') report.rows.push({ id, part: p.label, code: codeTxt, result: p.q ? 'code not mapped to a monitored parameter' : 'no value' }); continue; }
        if (hit.panel) { if (!p.q) continue; report.rows.push({ id, part: p.label, code: codeTxt, result: 'panel code with a value; skipped' }); continue; }
        let value = null, quality;
        if (!p.absent && p.q && p.q.value !== undefined && p.q.value !== null) {
          const v = Number(p.q.value);
          if (!Number.isFinite(v)) { report.rows.push({ id, part: p.label, code: codeTxt, param: hit.param, result: 'invalid: value is not a number' }); continue; }
          const u = mdc.unit([{ code: p.q.code, system: p.q.system }, { code: p.q.unit }]);
          const c = units.toCanonical(hit.param, v, u);
          if (c.error) { report.rows.push({ id, part: p.label, code: codeTxt, param: hit.param, result: 'invalid: ' + c.error }); continue; }
          value = c.value;
          if (!units.inRange(hit.param, value)) quality = observation.QUALITY.INVALID;
        } else if (!p.absent && !p.q) {
          continue; // e.g. a component without value and without a reason
        }
        const o = observation.make({ param: hit.param, value, source, quality, timestamp: ts !== null ? ts : receivedAt,
          provenance: Object.assign({}, base, { part: p.label, code: codeTxt, codeMatch: hit.via,
            originalValue: p.q ? p.q.value : null, originalUnit: p.q ? (p.q.code || p.q.unit || '') : '',
            dataAbsentReason: p.absent ? ((p.absent.coding && p.absent.coding[0] && p.absent.coding[0].code) || p.absent.text || 'unknown') : undefined }) });
        out.push(o);
        report.rows.push({ id, part: p.label, code: codeTxt, param: hit.param, result: o.value === null ? 'missing (' + (o.provenance.dataAbsentReason || 'no value') + ')' : o.quality === 'ok' ? 'stored' : 'stored (' + o.quality + ')' });
      }
    }
    if (subjects) report.warnings.push(subjects + ' Observation.subject reference(s) ignored');
    return { observations: out, report };
  }

  /** Synthetic Bundle for demonstrations and tests. o: { time, deviceName, observations:[{param,value,unit}], bp:{sbp,dbp,map} } */
  function encodeBundle(o) {
    const t = new Date(o.time || Date.now()).toISOString();
    const tag = { system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'HTEST', display: 'test health data' };
    const coding = p => {
      const c = mdc.codesFor(p), list = [];
      if (c.loinc) list.push({ system: mdc.SYS.LOINC, code: c.loinc });
      if (c.mdc) list.push({ system: mdc.SYS.MDC, code: String(c.mdc.code), display: c.mdc.refid });
      return list;
    };
    const qty = (p, value, unit) => {
      const u = unit || units.PARAMS[p].unit;
      return { value, unit: u, system: mdc.SYS.UCUM, code: mdc.unitCodesFor(u).ucum };
    };
    const entry = [{ resource: { resourceType: 'Device', id: 'dev1', meta: { security: [tag] }, deviceName: [{ name: o.deviceName || 'Synthetic spot-check monitor', type: 'user-friendly-name' }] } }];
    (o.observations || []).forEach((x, k) => {
      const r = { resourceType: 'Observation', id: 'obs' + (k + 1), meta: { security: [tag] }, status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: coding(x.param) }, effectiveDateTime: t, device: { reference: 'Device/dev1' } };
      if (x.value === null || x.value === undefined) r.dataAbsentReason = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/data-absent-reason', code: x.absent || 'error' }] };
      else r.valueQuantity = qty(x.param, x.value, x.unit);
      if (x.status) r.status = x.status;
      entry.push({ resource: r });
    });
    if (o.bp) {
      entry.push({ resource: { resourceType: 'Observation', id: 'bp', meta: { security: [tag] }, status: 'final',
        code: { coding: [{ system: mdc.SYS.LOINC, code: '85354-9' }] }, effectiveDateTime: t, device: { reference: 'Device/dev1' },
        component: ['sbp', 'dbp', 'map'].filter(p => o.bp[p] !== undefined).map(p => ({ code: { coding: coding(p) }, valueQuantity: qty(p, o.bp[p], o.bp.unit) })) } });
    }
    return { resourceType: 'Bundle', type: 'collection', meta: { security: [tag] }, entry };
  }

  const looksLike = text => /"resourceType"\s*:\s*"(Bundle|Observation)"/.test(String(text).slice(0, 4000));

  return { importJSON, encodeBundle, looksLike };
});
