/* HL7 v2.x observation messages (ORU^R01), as sent by bedside monitors, central
 * stations and device-integration gateways. Follows the IHE Patient Care Device
 * "Communicate PCD Data" (PCD-01) profile: OBX-3 carries an ISO/IEEE 11073 MDC
 * code, OBX-6 an MDC or UCUM unit, OBX-18 the equipment instance identifier.
 *
 * Also: MLLP framing (VT … FS CR) for TCP and serial links, ACK generation and an
 * encoder for the synthetic sample feed.
 *
 * Patient identity (PID, NK1, …) is never read into the app: the segment is
 * counted and reported as ignored. Only device, location and observation fields
 * are used. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/units.js'), require('../core/observation.js'), require('./mdc.js'));
  else (root.PM = root.PM || {}).hl7v2 = factory(root.PM.units, root.PM.observation, root.PM.mdc);
})(this, function (units, observation, mdc) {
  'use strict';

  const VT = '\x0b', FS = '\x1c', CR = '\r';
  const MAX_MESSAGE = 1024 * 1024; // larger frames are dropped by the stream reader
  const IDENTITY_SEGMENTS = ['PID', 'PD1', 'NK1', 'GT1', 'IN1', 'IN2', 'MRG'];
  const PROCESSING = { P: 'production', T: 'training/test', D: 'debugging' };

  // ------------------------------------------------------------------ parsing

  /** HL7 DTM/TS "YYYY[MM[DD[HH[MM[SS[.S…]]]]]][+/-ZZZZ]" → ms. Naive times use opts.timezone ('local' | 'UTC'). */
  function parseTS(s, opts) {
    const m = String(s || '').trim().match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,4}))?([+-]\d{4})?$/);
    if (!m) return null;
    const p = [+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0];
    if (p[1] > 11 || p[2] > 31 || p[3] > 23 || p[4] > 59 || p[5] > 60) return null;
    if (m[8]) {
      const sign = m[8][0] === '-' ? -1 : 1, off = sign * (+m[8].slice(1, 3) * 60 + +m[8].slice(3, 5));
      return Date.UTC(...p) - off * 60000;
    }
    return (opts && /^utc$/i.test(opts.timezone || '')) ? Date.UTC(...p) : new Date(...p).getTime();
  }

  function formatTS(ms) {
    const d = new Date(ms), z = (n, w) => String(n).padStart(w || 2, '0');
    return d.getUTCFullYear() + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) + z(d.getUTCHours()) + z(d.getUTCMinutes()) + z(d.getUTCSeconds()) + '+0000';
  }

  /** Split text (file, paste or stream) into message strings. Handles MLLP frames and plain files. */
  function splitMessages(text) {
    const t = String(text || '').replace(/^﻿/, '');
    const parts = t.includes(VT) ? t.split(VT).map(x => x.split(FS)[0]) : t.split(/(?=^MSH\|)/m);
    return parts.map(x => x.replace(/^[\r\n\s]+/, '')).filter(x => x.startsWith('MSH'));
  }

  /** Parse one message. Returns {header, location, obx[], identitySegments, segments, warnings} or {error}. */
  function parseMessage(text) {
    const segs = String(text).replace(/[\x0b\x1c]/g, '').split(/\r\n|\r|\n/).filter(s => s.trim());
    if (!segs.length || !segs[0].startsWith('MSH') || segs[0].length < 8) return { error: 'message does not start with an MSH segment' };
    const fsep = segs[0][3], enc = segs[0].slice(4, 8);
    const [cs, rs, es, ss] = [enc[0] || '^', enc[1] || '~', enc[2] || '\\', enc[3] || '&'];
    const unesc = v => es ? v.replace(new RegExp('\\' + es + '([FSTRE])\\' + es, 'g'), (_, c) => ({ F: fsep, S: cs, T: ss, R: rs, E: es })[c]) : v;
    const fields = seg => {
      const f = seg.split(fsep);
      return f[0] === 'MSH' ? ['MSH', fsep].concat(f.slice(1)) : f; // MSH-1 is the separator itself
    };
    const comps = v => String(v || '').split(rs)[0].split(cs).map(unesc);
    const cwe = v => { const c = comps(v); return [{ code: c[0], display: c[1], system: c[2] }, { code: c[3], display: c[4], system: c[5] }]; };

    const warnings = [], obx = [], segments = [];
    let header = null, location = null, obrTime = null, identity = 0;
    for (const seg of segs) {
      const f = fields(seg), name = f[0];
      segments.push(name);
      if (name === 'MSH') {
        const sa = comps(f[3]), sf = comps(f[4]), type = comps(f[9]);
        header = { sendingApp: sa.filter(Boolean).join('^'), sendingAppName: sa[0] || '', sendingFacility: sf[0] || '',
          receivingApp: comps(f[5])[0] || '', time: f[7] || '', type: [type[0], type[1]].filter(Boolean).join('^'),
          controlId: f[10] || '', processingId: comps(f[11])[0] || '', version: comps(f[12])[0] || '' };
      } else if (IDENTITY_SEGMENTS.includes(name)) {
        identity++; // contents are not read
      } else if (name === 'PV1') {
        const l = comps(f[3]);
        while (l.length && !l[l.length - 1]) l.pop();
        location = l.length ? l.join('^') : null;
      } else if (name === 'OBR') {
        obrTime = f[7] || null;
      } else if (name === 'OBX') {
        const val = String(f[5] || '').split(rs)[0];
        obx.push({ setId: f[1] || '', valueType: (f[2] || '').trim(), id: cwe(f[3]), subId: f[4] || '', value: val,
          valueComps: val.split(cs), units: cwe(f[6]), refRange: f[7] || '', abnormal: f[8] || '', status: (f[11] || '').trim(),
          time: f[14] || obrTime || null, equipment: comps(f[18]).filter(Boolean).join('^') });
      }
    }
    if (!header) return { error: 'no MSH segment' };
    if (!/^ORU/.test(header.type)) warnings.push('message type ' + (header.type || '(empty)') + ' is not ORU; observations read anyway');
    if (identity) warnings.push(identity + ' patient identity segment(s) ignored; no patient identifiers are stored');
    return { header, location, obx, identitySegments: identity, segments, warnings };
  }

  /** Location filter: every non-empty component of `want` must equal the PV1-3 component (case-insensitive). */
  function locationMatches(loc, want) {
    if (!want) return true;
    const a = String(loc || '').toLowerCase().split('^'), b = String(want).toLowerCase().split('^');
    return b.every((x, i) => !x.trim() || (a[i] || '').trim() === x.trim());
  }

  // ------------------------------------------------------------------ mapping

  /**
   * Observations from a parsed message.
   * meta: { source: 'device'|'imported', route, peer, file, receivedAt, timezone, acceptLocation, replay }
   * Returns { observations, rows:[{obx, param, result}], warnings, rejected }.
   */
  function toObservations(msg, meta) {
    meta = meta || {};
    const receivedAt = meta.receivedAt || Date.now();
    const source = meta.source === 'imported' ? observation.SOURCE.IMPORTED : observation.SOURCE.DEVICE;
    const out = [], rows = [], warnings = (msg.warnings || []).slice();
    if (!locationMatches(msg.location, meta.acceptLocation)) {
      return { observations: out, rows, warnings, rejected: 'location ' + (msg.location || '(none)') + ' does not match ' + meta.acceptLocation };
    }
    const h = msg.header;
    const synthetic = !!meta.replay || h.processingId === 'T' || h.processingId === 'D';
    let device = null, deviceId = null;
    for (const x of msg.obx) { // MDS/VMD rows identify the device and carry no value
      const t = x.id.map(c => c.display || c.code || '').join(' ');
      if (!x.value && /MDC_DEV_/.test(t)) { device = device || (x.id[0].display || x.id[0].code); deviceId = deviceId || x.equipment || null; }
    }
    const base = { route: meta.route || 'hl7v2', format: 'HL7 v' + (h.version || '?') + ' ' + (h.type || ''),
      sendingApp: h.sendingApp || null, sendingFacility: h.sendingFacility || null, controlId: h.controlId || null,
      processingId: h.processingId ? h.processingId + ' (' + (PROCESSING[h.processingId] || 'unknown') + ')' : null,
      location: msg.location || null, device: device || h.sendingAppName || null, peer: meta.peer || undefined, file: meta.file || undefined,
      receivedAt: new Date(receivedAt).toISOString() };
    if (synthetic) base.replay = meta.replay ? 'synthetic HL7 sample — no hardware involved' : 'sender marked the message as ' + PROCESSING[h.processingId] + ' data';
    const msgTime = parseTS(h.time, meta);

    for (const x of msg.obx) {
      const label = (x.id[0].code || '') + '^' + (x.id[0].display || '');
      const row = r => rows.push(Object.assign({ obx: x.setId, code: label, value: x.value, unit: x.units[0].display || x.units[0].code || '' }, r));
      if (!x.value && !x.valueType) { row({ result: 'device descriptor' }); continue; }
      const hit = mdc.lookup(x.id);
      if (!hit || hit.panel) { row({ result: hit ? 'panel, no value' : 'code not mapped to a monitored parameter' }); continue; }
      if (x.status === 'D' || x.status === 'W') { row({ param: hit.param, result: 'skipped: result status ' + x.status + ' (deleted / wrong)' }); continue; }
      let value = null, quality;
      if (x.status !== 'X' && x.value.trim() !== '') {
        const raw = x.valueType === 'SN' ? x.valueComps[1] : x.valueComps[0];
        if (!['NM', 'SN', ''].includes(x.valueType)) { row({ param: hit.param, result: 'skipped: value type ' + x.valueType + ' is not numeric' }); continue; }
        const v = Number(String(raw).trim());
        if (!Number.isFinite(v)) { row({ param: hit.param, result: 'invalid: "' + x.value + '" is not a number' }); continue; }
        const u = mdc.unit(x.units);
        const c = units.toCanonical(hit.param, v, u);
        if (c.error) { row({ param: hit.param, result: 'invalid: ' + c.error }); continue; }
        value = c.value;
        if (!units.inRange(hit.param, value)) quality = observation.QUALITY.INVALID;
      }
      const ts = parseTS(x.time, meta);
      const o = observation.make({ param: hit.param, value, source, quality,
        timestamp: ts !== null ? ts : msgTime !== null ? msgTime : receivedAt,
        provenance: Object.assign({}, base, { code: label, codeMatch: hit.via, originalValue: x.value, originalUnit: x.units[0].display || x.units[0].code || '',
          resultStatus: x.status || null, abnormalFlags: x.abnormal || undefined, equipment: x.equipment || deviceId || undefined,
          timeSource: ts !== null ? 'OBX-14 / OBR-7' : msgTime !== null ? 'MSH-7' : 'time received' }) });
      out.push(o);
      row({ param: hit.param, result: o.value === null ? 'missing' : o.quality === 'ok' ? 'stored' : 'stored (' + o.quality + ')' });
    }
    return { observations: out, rows, warnings };
  }

  /** Parse every message in a text and map it. opts as toObservations meta. */
  function importText(text, opts) {
    const msgs = splitMessages(text), report = { messages: msgs.length, errors: [], warnings: [], rejected: [], rows: [] };
    const observations = [];
    for (const m of msgs) {
      const p = parseMessage(m);
      if (p.error) { report.errors.push(p.error); continue; }
      const r = toObservations(p, opts);
      if (r.rejected) { report.rejected.push((p.header.controlId || '?') + ': ' + r.rejected); continue; }
      observations.push(...r.observations);
      report.rows.push(...r.rows.map(x => Object.assign({ controlId: p.header.controlId }, x)));
      for (const w of r.warnings) if (!report.warnings.includes(w)) report.warnings.push(w);
    }
    if (!msgs.length) report.errors.push('no HL7 message found (expected a line starting with MSH|)');
    return { observations, report };
  }

  // ------------------------------------------------------------------ MLLP

  const frame = msg => VT + String(msg).replace(/\r?\n/g, CR).replace(/\r?$/, CR) + FS + CR;

  /** Stream reassembly. Returns {messages, rest}; feed `rest` back with the next chunk. */
  function deframe(buffer) {
    const messages = [];
    let s = String(buffer), i;
    while ((i = s.indexOf(VT)) !== -1) {
      const j = s.indexOf(FS, i + 1);
      if (j === -1) { s = s.slice(i); break; }
      messages.push(s.slice(i + 1, j));
      s = s.slice(j + 1).replace(/^\r/, '');
    }
    if (!s.includes(VT) || s.length > MAX_MESSAGE) s = ''; // bytes outside a frame are discarded
    return { messages, rest: s };
  }

  /** Accept acknowledgement (original mode). code: AA accept, AE error, AR reject. */
  function ack(msgText, code, note, now) {
    const p = typeof msgText === 'string' ? parseMessage(msgText) : msgText;
    const h = (p && p.header) || {};
    const t = formatTS(now || Date.now());
    return ['MSH|^~\\&|PM-SIM|EDU|' + (h.sendingAppName || '') + '|' + (h.sendingFacility || '') + '|' + t + '||ACK^R01^ACK|ACK' + t.slice(0, 14) + '|' + (h.processingId || 'P') + '|' + (h.version || '2.6'),
      'MSA|' + (code || 'AA') + '|' + (h.controlId || '') + (note ? '|' + String(note).replace(/[|^~\\&\r\n]/g, ' ').slice(0, 80) : '')].join(CR) + CR;
  }

  // ------------------------------------------------------------------ encoder (synthetic samples)

  /**
   * o: { sendingApp, eui, facility, controlId, time, processingId, location, deviceRefid, deviceCode,
   *      observations: [{ param, value (null = missing), unit, status }] }
   * Patient segment is a fixed, obviously fictional test record.
   */
  function encodeORU(o) {
    const t = formatTS(o.time || Date.now()), eui = o.eui || '0000000000000000';
    const lines = [
      'MSH|^~\\&|' + (o.sendingApp || 'SIM-MONITOR') + '^' + eui + '^EUI-64|' + (o.facility || 'EDU') + '|||' + t + '||ORU^R01^ORU_R01|' + (o.controlId || 'MSG0001') + '|' + (o.processingId || 'T') + '|2.6|||NE|AL||UNICODE UTF-8|||IHE_PCD_001^IHE PCD^1.3.6.1.4.1.19376.1.6.1.1.1^ISO',
      'PID|||TEST-0000^^^EDU^MR||TEST^SYNTHETIC',
      'PV1||I|' + (o.location || 'ICU^01^01'),
      'OBR|1|' + (o.controlId || 'MSG0001') + '^SIM||182777000^monitoring of patient^SCT|||' + t,
      'OBX|1||' + (o.deviceCode || '69965') + '^' + (o.deviceRefid || 'MDC_DEV_MON_PHYSIO_MULTI_PARAM_MDS') + '^MDC|1.0.0.0|||||||X|||||||' + eui + '^EUI-64',
    ];
    (o.observations || []).forEach((x, k) => {
      const c = mdc.codesFor(x.param).mdc, u = mdc.unitCodesFor(x.unit || units.PARAMS[x.param].unit).mdc;
      const code = c ? (c.code + '^' + c.refid + '^MDC') : ('^' + x.param);
      const unit = u ? ((u.code || '') + '^' + u.refid + '^MDC') : '^' + (x.unit || '');
      const missing = x.value === null || x.value === undefined;
      lines.push('OBX|' + (k + 2) + '|NM|' + code + '|1.1.1.' + (k + 1) + '|' + (missing ? '' : x.value) + '|' + unit + '|||||' + (missing ? 'X' : (x.status || 'R')) + '|||' + t + '||||' + eui + '^EUI-64');
    });
    return lines.join(CR) + CR;
  }

  return { parseTS, formatTS, splitMessages, parseMessage, locationMatches, toObservations, importText, frame, deframe, ack, encodeORU,
           VT, FS, CR, MAX_MESSAGE, IDENTITY_SEGMENTS };
});
