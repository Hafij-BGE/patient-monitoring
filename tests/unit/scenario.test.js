'use strict';
// Scenario select and alarm colour grading: which preset the settings match, and
// how active alarms map to tiles and controls.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/sim/params.js');
const S = require('../../src/alarms/severity.js');

test('matchPreset: each preset matches itself; a manual edit gives custom', () => {
  for (const p of P.PRESETS) assert.equal(P.matchPreset(P.applyPreset(p.id, P.DEFAULTS).params, p.id), p.id, p.id);
  const tachy = P.applyPreset('tachy', P.DEFAULTS).params;
  assert.equal(P.matchPreset(Object.assign({}, tachy, { hr: 136 })), 'custom');
  assert.equal(P.matchPreset(Object.assign({}, tachy, { hr: 135 })), 'tachy', 'editing back returns to the preset');
  assert.equal(P.matchPreset(Object.assign({}, P.DEFAULTS, { contact: 90 })), 'custom', 'sensor settings count');
});

test('matchPreset: display and processing settings do not make a scenario custom', () => {
  const desat = P.applyPreset('desat', P.DEFAULTS).params;
  assert.equal(P.matchPreset(Object.assign({}, desat, { sweep: 50, ecg_gain: 20, speed: 2, nibp_interval: 1 })), 'desat');
  assert.equal(P.matchPreset(Object.assign({}, desat, { spo2: '84' })), 'desat', 'string from an input equals the number');
});

test('applyPreset sets every patient and sensor value, not only the preset changes', () => {
  const edited = Object.assign({}, P.DEFAULTS, { hr: 150, spo2: 70, contact: 20, sweep: 50 });
  const r = P.applyPreset('desat', edited).params;
  assert.equal(r.hr, P.DEFAULTS.hr); assert.equal(r.contact, P.DEFAULTS.contact);
  assert.equal(r.spo2, 84); assert.equal(r.sweep, 50, 'display setting kept');
});

test('severity: highest priority wins per tile; all messages kept; technical maps to its sensor control', () => {
  const g = S.grade([
    { param: 'rhythm', priority: 'high', message: 'V-TACH' },
    { param: 'hr', priority: 'medium', message: 'HR high' },
    { param: 'ecgLeadsOff', priority: 'low', message: 'ECG leads off' },
    { param: 'sbp', priority: 'medium', message: 'NIBP SYS low' },
    { param: 'unknownThing', priority: 'high', message: 'x' },
  ]);
  assert.equal(g.tiles.tHr.sev, 'high');
  assert.deepEqual(g.tiles.tHr.messages, ['V-TACH', 'HR high', 'ECG leads off']);
  assert.equal(g.tiles.tNibp.sev, 'medium');
  assert.equal(g.controls.contact.sev, 'low');
  assert.equal(g.controls.arrhythmia.sev, 'high');
  assert.equal(g.tiles.tSpo2, undefined);
  assert.deepEqual(S.grade([]), { tiles: {}, controls: {} });
  assert.deepEqual(S.counts([{ priority: 'high' }, { priority: 'low' }, { priority: 'low' }]), { high: 1, medium: 0, low: 2 });
});

test('severity: every alarm param and technical flag the engine can raise is linked', () => {
  const A = require('../../src/alarms/alarmEngine.js');
  for (const k of Object.keys(A.DEFAULT_LIMITS).concat(Object.keys(A.TECHNICAL), ['rhythm']))
    assert.ok(S.LINKS[k], 'no link for ' + k);
  for (const l of Object.values(S.LINKS)) for (const c of l.controls) assert.ok(P.SPEC[c], 'unknown control ' + c);
});

test('literature presets: values in range, sourced, and distinct', () => {
  const refs = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../REFERENCES.md'), 'utf8');
  const sourced = P.PRESETS.filter(p => p.refs);
  assert.ok(sourced.length >= 12);
  for (const p of sourced) {
    const r = P.validate(P.DEFAULTS, p.changes);
    assert.deepEqual(r.errors, [], p.id);
    assert.deepEqual(r.warnings, [], p.id + ' clamped');
    assert.ok(p.note && p.refs.length, p.id);
    for (const n of p.refs) assert.match(refs, new RegExp('^' + n + '\\. \\*\\*', 'm'), p.id + ' ref ' + n);
    assert.equal(P.matchPreset(P.applyPreset(p.id).params), p.id, p.id + ' collides with another preset');
  }
});
