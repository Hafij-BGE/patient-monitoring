'use strict';
// Hospital interfaces: HL7 v2 (PCD-01 style), MLLP framing, FHIR R4, SDC MDIB XML,
// serial framing, format detection and the bed filter. Fixtures are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const hl7v2 = require('../../src/devices/hl7v2.js');
const mdc = require('../../src/devices/mdc.js');
const fhir = require('../../src/devices/fhir.js');
const sdc = require('../../src/devices/sdc.js');
const samples = require('../../src/devices/samples.js');
const catalog = require('../../src/devices/catalog.js');
const { SerialFramer } = require('../../src/devices/webSerial.js');
const { MllpServer } = require('../../electron/mllpServer.cjs');

const fx = f => fs.readFileSync(path.join(__dirname, '../../fixtures', f), 'utf8');
const last = (obs, p) => obs.filter(o => o.param === p).pop();

test('MDC lookup: refid text, numeric code and LOINC', () => {
  assert.equal(mdc.lookup([{ code: '150456', system: 'urn:iso:std:iso:11073:10101' }]).param, 'spo2');
  assert.equal(mdc.lookup([{ code: 'MDC_ECG_HEART_RATE' }]).param, 'hr');
  assert.equal(mdc.lookup([{ code: '59408-5', system: 'http://loinc.org' }]).param, 'spo2');
  assert.equal(mdc.lookup([{ code: '99999' }]), null);
});

test('HL7 fixture: units converted, missing kept, identity not stored, synthetic flag', () => {
  const r = hl7v2.importText(fx('hl7_oru_pcd01.hl7'), { source: 'imported', file: 'hl7_oru_pcd01.hl7' });
  assert.equal(r.report.messages, 2);
  assert.equal(r.report.errors.length, 0);
  const obs = r.observations;
  assert.ok(Math.abs(last(obs, 'sbp').value - 123.0) < 0.5, 'kPa to mmHg');
  assert.ok(Math.abs(last(obs, 'temp').value - 37.22) < 0.05, '°F to °C');
  assert.equal(last(obs, 'rr').value, null);
  assert.equal(last(obs, 'rr').quality, 'missing');
  assert.equal(last(obs, 'etco2').value, 38);
  assert.equal(last(obs, 'art_map').value, 86);
  assert.ok(obs.every(o => o.source === 'imported' && o.provenance.replay));
  assert.ok(!JSON.stringify(obs).includes('TEST-0000'), 'PID value must not be stored');
  assert.ok(r.report.warnings.some(w => /identity/.test(w)));
});

test('HL7 timestamps: OBX-14 with offset parsed to UTC', () => {
  assert.equal(hl7v2.parseTS('20261028085900+0000'), Date.UTC(2026, 9, 28, 8, 59, 0));
  assert.equal(hl7v2.parseTS('20261028115900+0300'), Date.UTC(2026, 9, 28, 8, 59, 0));
  assert.equal(hl7v2.parseTS('garbage'), null);
});

test('HL7 parser rejects a message without MSH', () => {
  assert.ok(hl7v2.parseMessage('PID|1||x').error);
  const r = hl7v2.importText('hello world', {});
  assert.equal(r.observations.length, 0);
  assert.ok(r.report.errors.length >= 1);
});

test('MLLP deframe: junk dropped, partial frame kept, ACK echoes control ID', () => {
  const msg = samples.hl7(Date.now()).split('\n')[0];
  const d = hl7v2.deframe('noise' + hl7v2.frame(msg) + hl7v2.VT + 'MSH|part');
  assert.equal(d.messages.length, 1);
  assert.ok(d.messages[0].startsWith('MSH|'));
  assert.equal(d.rest, hl7v2.VT + 'MSH|part');
  const ack = hl7v2.ack(d.messages[0], 'AA');
  assert.match(ack, /MSA\|AA\|SIM0001/);
});

test('bed filter: feed messages for the other bed are rejected', () => {
  const feed = samples.feed({ count: 20, now: Date.now(), location: 'ICU^01^01', otherLocation: 'ICU^01^02' });
  let rejected = 0, stored = 0;
  for (const it of feed) {
    const r = hl7v2.toObservations(hl7v2.parseMessage(it.text), { source: 'device', acceptLocation: 'ICU^01^01' });
    if (r.rejected) rejected++; else stored += r.observations.length;
  }
  assert.equal(rejected, 5);
  assert.ok(stored > 100);
  const spo2 = hl7v2.toObservations(hl7v2.parseMessage(feed[16].text), { source: 'device' }).observations;
  assert.equal(last(spo2, 'temp').quality, 'invalid', '55 °C kept but marked invalid');
});

test('FHIR fixture: BP panel split, dataAbsentReason missing, subject ignored', () => {
  const r = fhir.importJSON(fx('fhir_vitals_bundle.json'), { source: 'imported' });
  assert.equal(r.report.errors.length, 0);
  const obs = r.observations;
  assert.equal(last(obs, 'sbp').value, 118);
  assert.equal(last(obs, 'dbp').value, 76);
  assert.equal(last(obs, 'map').value, 90);
  assert.equal(last(obs, 'rr').value, null);
  assert.equal(last(obs, 'rr').provenance.dataAbsentReason, 'not-performed');
  assert.ok(obs.every(o => o.provenance.replay));
  const withSubject = { resourceType: 'Observation', status: 'final', subject: { reference: 'Patient/1' },
    code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] }, valueQuantity: { value: 70, code: '/min' } };
  const r2 = fhir.importJSON([withSubject, { resourceType: 'Patient', id: '1' }], {});
  assert.equal(r2.observations[0].value, 70);
  assert.ok(!JSON.stringify(r2.observations).includes('Patient/1'));
  assert.equal(r2.report.warnings.length, 2);
});

test('FHIR: entered-in-error skipped, bad JSON reported', () => {
  const r = fhir.importJSON({ resourceType: 'Observation', status: 'entered-in-error',
    code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] }, valueQuantity: { value: 70 } }, {});
  assert.equal(r.observations.length, 0);
  assert.ok(fhir.importJSON('{ broken', {}).report.errors.length);
});

test('SDC fixture: validity mapped to quality, empty metric missing', () => {
  const r = sdc.importXML(fx('sdc_mdib.xml'), { source: 'imported' });
  assert.equal(r.report.errors.length, 0);
  const obs = r.observations;
  assert.equal(last(obs, 'hr').value, 69);
  assert.equal(last(obs, 'spo2').quality, 'low-quality');
  assert.equal(last(obs, 'temp').value, null);
  assert.equal(last(obs, 'art_sys').value, 126);
  assert.ok(obs.every(o => o.provenance.replay));
});

test('SDC parser refuses DOCTYPE / entity declarations', () => {
  const evil = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>';
  const r = sdc.importXML(evil, {});
  assert.equal(r.observations.length, 0);
  assert.ok(r.report.errors.length);
});

test('serial framer: plain CR text split on MSH and flushed when idle; MLLP when VT seen', async () => {
  const got = [];
  const f = new SerialFramer((m, how) => got.push(how), 30);
  const [a, b] = samples.hl7(Date.now()).split('\n');
  f.push(a.slice(0, 50)); f.push(a.slice(50) + '\r' + b.slice(0, 20)); f.push(b.slice(20));
  assert.deepEqual(got, ['plain']);
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(got, ['plain', 'plain (idle flush)']);
  const g = [];
  const m = new SerialFramer((x, how) => g.push(how), 30);
  const fr = hl7v2.frame(a);
  m.push(fr.slice(0, 10)); m.push(fr.slice(10));
  assert.deepEqual(g, ['MLLP']);
});

test('format detection and importAny report', () => {
  assert.equal(catalog.detect(fx('hl7_oru_pcd01.hl7'), 'x.txt'), 'hl7');
  assert.equal(catalog.detect(fx('fhir_vitals_bundle.json'), 'x.json'), 'fhir');
  assert.equal(catalog.detect(fx('sdc_mdib.xml'), 'x.txt'), 'sdc');
  assert.equal(catalog.detect('time,hr\n1,2', 'v.csv'), 'table');
  const r = catalog.importAny(fx('hl7_oru_pcd01.hl7'), 'hl7_oru_pcd01.hl7', { acceptLocation: 'ICU^09^09' });
  assert.equal(r.observations.length, 0);
  assert.ok(r.report.warnings.some(w => /^rejected/.test(w)));
});

test('catalog: browser-only page cannot offer MLLP; file routes always work', () => {
  assert.equal(catalog.availability('hl7-mllp', {}).ok, false);
  assert.equal(catalog.availability('hl7-mllp', { PMDesktop: { mllp: {} } }).ok, true);
  assert.equal(catalog.availability('hl7-serial', { isSecureContext: false }).ok, false);
  assert.equal(catalog.availability('fhir-file', {}).ok, true);
  for (const c of catalog.CLASSES) for (const r of c.routes) assert.ok(catalog.ROUTES[r], c.id + ' → ' + r);
  assert.ok(!/honor/i.test(JSON.stringify(catalog)), 'no brand-specific entries');
});

test('MLLP server: receives a framed message on 127.0.0.1 and answers AA', async () => {
  const msgs = [];
  const srv = new MllpServer({ onMessage: m => msgs.push(m), onStatus: () => {} });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const st = await srv.start({ port });
  assert.ok(st.ok, st.error);
  const text = samples.hl7(Date.now()).split('\n')[0];
  const ack = await new Promise((resolve, reject) => {
    const c = net.connect(port, '127.0.0.1', () => c.write(hl7v2.frame(text)));
    let buf = '';
    c.on('data', d => { buf += d; const r = hl7v2.deframe(buf); if (r.messages.length) { c.end(); resolve(r.messages[0]); } });
    c.on('error', reject);
  });
  await srv.stop();
  assert.match(ack, /MSA\|AA\|SIM0001/);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].peer, /^127\.0\.0\.1:/);
  assert.equal((await srv.start({ port: 80 })).ok, false, 'privileged port refused');
});
