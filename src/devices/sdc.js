/* IEEE 11073 SDC (Service-oriented Device Connectivity) MDIB import.
 *
 * Reads an XML file that holds a BICEPS (IEEE 11073-10207) medical device
 * information base: a GetMdibResponse, an Mdib element, or an EpisodicMetricReport.
 * Live SDC needs WS-Discovery multicast and TLS (IEEE 11073-20702), which a browser
 * cannot do; this module only reads saved XML. Pure, no DOM.
 *
 *   NumericMetricDescriptor  Handle, Type (MDC Code / SymbolicCodeName), Unit
 *   NumericMetricState       DescriptorHandle, MetricValue Value + DeterminationTime
 *   MetricQuality            Validity (Vld, Vldated, Ong, Qst, Calib, Inv, Oflw, Uflw, NA)
 *                            Mode (Real, Test, Demo): Test and Demo are shown as synthetic
 *
 * Elements are matched by local name, so any namespace prefix works. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/units.js'), require('../core/observation.js'), require('./mdc.js'));
  else (root.PM = root.PM || {}).sdc = factory(root.PM.units, root.PM.observation, root.PM.mdc);
})(this, function (units, observation, mdc) {
  'use strict';

  const MAX_XML = 5 * 1024 * 1024;
  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  const unescape = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
  const local = n => n.slice(n.indexOf(':') + 1);

  /** Minimal XML tree builder: elements, attributes and text. No DTD, no entities beyond the five built-in ones. */
  function parseXML(text) {
    text = String(text).replace(/^﻿/, '');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DOCTYPE/ENTITY declarations are not accepted');
    const rootNode = { name: '#root', attrs: {}, children: [], text: '' };
    const stack = [rootNode];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(text))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) top.text += m[1];
      else if (m[2]) {
        if (stack.length < 2 || stack[stack.length - 1].qname !== m[2]) throw new Error('mismatched closing tag </' + m[2] + '>');
        stack.pop();
      } else if (m[3]) {
        const node = { name: local(m[3]), qname: m[3], attrs: {}, children: [], text: '' };
        const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let a;
        while ((a = ar.exec(m[4] || ''))) node.attrs[local(a[1])] = unescape(a[2] !== undefined ? a[2] : a[3]);
        top.children.push(node);
        if (!m[5]) stack.push(node);
      } else if (m[6] !== undefined) top.text += unescape(m[6]);
      else if (m[0][0] === '<' && !/^<(!--|\?)/.test(m[0])) throw new Error('malformed markup near "' + m[0].slice(0, 30) + '"');
    }
    if (stack.length !== 1) throw new Error('unclosed element <' + stack[stack.length - 1].qname + '>');
    return rootNode;
  }

  function walk(node, fn, parents) {
    parents = parents || [];
    fn(node, parents);
    for (const c of node.children) walk(c, fn, parents.concat(node));
  }
  const child = (n, name) => n.children.find(c => c.name === name);
  const textOf = n => n ? (n.text.trim() || n.children.map(textOf).filter(Boolean).join(' ')) : '';

  function validity(v) {
    switch (v) {
      case 'Vld': case 'Vldated': return observation.QUALITY.OK;
      case 'Ong': case 'Qst': case 'Calib': return observation.QUALITY.LOW;
      case 'Inv': case 'Oflw': case 'Uflw': return observation.QUALITY.INVALID;
      case 'NA': return observation.QUALITY.MISSING;
      default: return null;
    }
  }

  const codings = cv => cv ? [{ code: cv.attrs.SymbolicCodeName }, { code: cv.attrs.Code, system: cv.attrs.CodingSystem }] : [];

  /**
   * opts: { source: 'device'|'imported', file, receivedAt }
   * Returns { observations, report: { devices, descriptors, states, rows, warnings, errors } }.
   */
  function importXML(text, opts) {
    opts = opts || {};
    const report = { devices: [], descriptors: 0, states: 0, rows: [], warnings: [], errors: [] }, out = [];
    if (String(text).length > MAX_XML) { report.errors.push('file larger than 5 MB'); return { observations: out, report }; }
    let tree;
    try { tree = parseXML(text); } catch (e) { report.errors.push('XML: ' + e.message); return { observations: out, report }; }

    const desc = new Map(), mdsOf = new Map(), states = [];
    walk(tree, (n, parents) => {
      if (n.name === 'Mds' && n.attrs.Handle) {
        const md = child(n, 'MetaData');
        const name = md ? [textOf(child(md, 'Manufacturer')), textOf(child(md, 'ModelName'))].filter(Boolean).join(' ') : '';
        mdsOf.set(n, name || n.attrs.Handle);
        report.devices.push(name || n.attrs.Handle);
      }
      if (n.attrs.Handle && /NumericMetricDescriptor$/.test(n.attrs.type || '') ) {
        const mds = parents.slice().reverse().find(p => p.name === 'Mds');
        desc.set(n.attrs.Handle, { type: child(n, 'Type'), unit: child(n, 'Unit'), device: mds ? mdsOf.get(mds) : null });
      }
      if (n.attrs.DescriptorHandle && child(n, 'MetricValue')) states.push(n);
    });
    report.descriptors = desc.size;
    report.states = states.length;
    if (!states.length) { report.errors.push('no metric states with a MetricValue found (expected an SDC MDIB or EpisodicMetricReport)'); return { observations: out, report }; }

    const source = opts.source === 'device' ? observation.SOURCE.DEVICE : observation.SOURCE.IMPORTED;
    const receivedAt = opts.receivedAt || Date.now();
    for (const s of states) {
      const h = s.attrs.DescriptorHandle, d = desc.get(h);
      if (!d) { report.rows.push({ handle: h, result: 'no NumericMetricDescriptor for this handle' }); continue; }
      const hit = mdc.lookup(codings(d.type));
      const codeTxt = (d.type && (d.type.attrs.SymbolicCodeName || d.type.attrs.Code)) || '?';
      if (!hit || hit.panel) { report.rows.push({ handle: h, code: codeTxt, result: 'code not mapped to a monitored parameter' }); continue; }
      const mv = child(s, 'MetricValue'), mq = child(mv, 'MetricQuality');
      const q = mq ? validity(mq.attrs.Validity) : null;
      const mode = mq && mq.attrs.Mode;
      const raw = mv.attrs.Value;
      let value = null, quality = q || undefined;
      if (raw !== undefined && q !== observation.QUALITY.MISSING) {
        const v = Number(raw);
        if (!Number.isFinite(v)) { report.rows.push({ handle: h, code: codeTxt, param: hit.param, result: 'invalid: value is not a number' }); continue; }
        const u = mdc.unit(codings(d.unit));
        const c = units.toCanonical(hit.param, v, u);
        if (c.error) { report.rows.push({ handle: h, code: codeTxt, param: hit.param, result: 'invalid: ' + c.error }); continue; }
        value = c.value;
        if (!units.inRange(hit.param, value)) quality = observation.QUALITY.INVALID;
      }
      const dt = Number(mv.attrs.DeterminationTime);
      const ts = Number.isFinite(dt) && dt > 0 ? dt : null;
      const prov = { route: 'sdc', format: 'IEEE 11073 SDC (BICEPS MDIB XML)', file: opts.file || undefined, handle: h, code: codeTxt, codeMatch: hit.via,
        device: d.device, validity: mq ? mq.attrs.Validity || null : null, mode: mode || null,
        originalValue: raw === undefined ? null : raw, originalUnit: d.unit ? (d.unit.attrs.SymbolicCodeName || d.unit.attrs.Code || '') : '',
        timeSource: ts !== null ? 'DeterminationTime' : 'time received', receivedAt: new Date(receivedAt).toISOString() };
      if (mode === 'Test' || mode === 'Demo') prov.replay = 'MetricQuality Mode=' + mode;
      const o = observation.make({ param: hit.param, value, source, quality, timestamp: ts !== null ? ts : receivedAt, provenance: prov });
      out.push(o);
      report.rows.push({ handle: h, code: codeTxt, param: hit.param, result: o.value === null ? 'missing' : o.quality === 'ok' ? 'stored' : 'stored (' + o.quality + ')' });
    }
    return { observations: out, report };
  }

  const xmlAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /** Synthetic MDIB for demonstrations and tests. o: { time, manufacturer, model, metrics:[{param, value, unit, validity}] } */
  function encodeMdib(o) {
    const t = Math.round(o.time || Date.now());
    const descs = [], sts = [];
    (o.metrics || []).forEach((x, k) => {
      const c = mdc.codesFor(x.param).mdc, u = mdc.unitCodesFor(x.unit || units.PARAMS[x.param].unit).mdc;
      const h = 'm' + (k + 1) + '.' + x.param;
      descs.push('        <pm:Metric xsi:type="pm:NumericMetricDescriptor" Handle="' + h + '" MetricCategory="Msrmt" MetricAvailability="Cont" Resolution="0.1">\n' +
        '          <pm:Type Code="' + (c ? c.code : '') + '" SymbolicCodeName="' + (c ? c.refid : '') + '"/>\n' +
        '          <pm:Unit Code="' + (u && u.code ? u.code : '') + '" SymbolicCodeName="' + (u ? u.refid : xmlAttr(x.unit || '')) + '"/>\n' +
        '        </pm:Metric>');
      sts.push('    <pm:State xsi:type="pm:NumericMetricState" DescriptorHandle="' + h + '">\n' +
        '      <pm:MetricValue' + (x.value === null || x.value === undefined ? '' : ' Value="' + x.value + '"') + ' DeterminationTime="' + t + '">\n' +
        '        <pm:MetricQuality Validity="' + (x.validity || (x.value === null || x.value === undefined ? 'NA' : 'Vld')) + '" Mode="Demo"/>\n' +
        '      </pm:MetricValue>\n    </pm:State>');
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!-- Synthetic SDC MDIB generated by PM-SIM for teaching. Not from a real device. -->\n' +
      '<msg:GetMdibResponse xmlns:msg="http://standards.ieee.org/downloads/11073/11073-10207-2017/message" xmlns:pm="http://standards.ieee.org/downloads/11073/11073-10207-2017/participant" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" MdibVersion="1">\n' +
      '  <msg:Mdib MdibVersion="1">\n  <pm:MdDescription>\n' +
      '    <pm:Mds Handle="mds0">\n      <pm:MetaData><pm:Manufacturer>' + xmlAttr(o.manufacturer || 'PM-SIM (synthetic)') + '</pm:Manufacturer><pm:ModelName>' + xmlAttr(o.model || 'Demo SDC monitor') + '</pm:ModelName></pm:MetaData>\n' +
      '      <pm:Vmd Handle="vmd0"><pm:Channel Handle="ch0">\n' + descs.join('\n') + '\n      </pm:Channel></pm:Vmd>\n    </pm:Mds>\n' +
      '  </pm:MdDescription>\n  <pm:MdState>\n' + sts.join('\n') + '\n  </pm:MdState>\n  </msg:Mdib>\n</msg:GetMdibResponse>\n';
  }

  const looksLike = text => /<([\w-]+:)?(GetMdibResponse|Mdib|EpisodicMetricReport)\b/.test(String(text).slice(0, 4000));

  return { parseXML, importXML, encodeMdib, looksLike };
});
