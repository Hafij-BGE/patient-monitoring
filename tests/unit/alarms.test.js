'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AlarmEngine, historyCSV } = require('../../src/alarms/alarmEngine.js');
const { Engine } = require('../../src/sim/engine.js');
const params = require('../../src/sim/params.js');

const TECH_OFF = { ecgLeadsOff: false, ecgNoSignal: false, spo2NoSignal: false, spo2ProbeOff: false, spo2LowSQI: false,
  respNoSignal: false, tempUnavailable: false, tempError: false, nibpFailed: false };
function frame(t, est, extra) {
  return Object.assign({ t, est: Object.assign({ hr: 72, spo2: 97, rr: 14, apnea: false, temp: 37 }, est),
    nibp: { state: 'idle', last: null, msg: '' }, technical: Object.assign({}, TECH_OFF) }, extra || {});
}

test('§19.5 SpO2 below the low limit raises an alarm only after the delay', () => {
  const a = new AlarmEngine();
  a.setLimit('spo2', { low: 90, delay: 10 });
  for (let t = 0; t < 10; t++) assert.equal(a.evaluate(frame(t, { spo2: 85 })).active.length, 0, 't=' + t);
  const s = a.evaluate(frame(10, { spo2: 85 }));
  assert.equal(s.active.length, 1);
  assert.equal(s.active[0].id, 'spo2:low');
  assert.equal(s.active[0].priority, 'medium');
  assert.equal(s.audio, 'medium');
});

test('limits are strict: a value equal to the limit does not alarm', () => {
  const a = new AlarmEngine();
  a.setLimit('spo2', { delay: 0 });
  assert.equal(a.evaluate(frame(0, { spo2: 90 })).active.length, 0);
  assert.equal(a.evaluate(frame(1, { spo2: 89.9 })).active.length, 1);
});

test('a short dip shorter than the delay does not alarm; alarms are non-latching', () => {
  const a = new AlarmEngine();
  a.evaluate(frame(0, { hr: 130 }));
  a.evaluate(frame(3, { hr: 130 }));
  a.evaluate(frame(4, { hr: 80 }));
  assert.equal(a.evaluate(frame(9, { hr: 130 })).active.length, 0, 'timer restarted');
  assert.equal(a.evaluate(frame(14, { hr: 130 })).active[0].id, 'hr:high');
  const s = a.evaluate(frame(15, { hr: 80 }));
  assert.equal(s.active.length, 0);
  assert.equal(a.history.length, 1);
  assert.equal(a.history[0].tOff, 15);
});

test('missing values never raise physiological alarms', () => {
  const a = new AlarmEngine();
  for (let t = 0; t < 30; t++) {
    const s = a.evaluate(frame(t, { hr: null, spo2: null, rr: null, temp: null }));
    assert.equal(s.active.filter(x => x.kind === 'physiological').length, 0);
  }
});

test('§19.6 acknowledge silences one alarm, mute counts down, reset clears', () => {
  const a = new AlarmEngine();
  a.setLimit('hr', { delay: 0 }); a.setLimit('spo2', { delay: 0 });
  let s = a.evaluate(frame(0, { hr: 150, spo2: 80 }));
  assert.equal(s.active.length, 2);
  assert.ok(a.acknowledge('hr:high'));
  assert.equal(a.acknowledge('hr:high'), false, 'already acknowledged');
  s = a.evaluate(frame(1, { hr: 150, spo2: 80 }));
  assert.equal(s.audio, 'medium', 'SpO2 alarm still sounds');
  a.acknowledgeAll();
  assert.equal(a.evaluate(frame(2, { hr: 150, spo2: 80 })).audio, null);
  // a new occurrence after the condition ended is not acknowledged
  a.evaluate(frame(3, { hr: 80, spo2: 80 }));
  s = a.evaluate(frame(4, { hr: 150, spo2: 80 }));
  assert.equal(s.audio, 'medium');
  a.mute(120);
  s = a.evaluate(frame(5, { hr: 150, spo2: 80 }));
  assert.equal(s.muted, true); assert.equal(s.audio, null); assert.equal(s.muteRemaining, 119);
  assert.equal(s.active.length, 2, 'visual indication continues while muted');
  s = a.evaluate(frame(124, { hr: 150, spo2: 80 }));
  assert.equal(s.muted, false); assert.equal(s.audio, 'medium');
  a.reset();
  assert.equal(a.history.length, 0);
  assert.equal(a.state().active.length, 0);
});

test('apnea is high priority and replaces the RR-low alarm', () => {
  const a = new AlarmEngine();
  const s = a.evaluate(frame(0, { rr: 0, apnea: true }));
  assert.deepEqual(s.active.map(x => x.id), ['apnea']);
  assert.equal(s.audio, 'high');
});

test('technical alarms are low priority, delayed, and separate from physiological ones', () => {
  const a = new AlarmEngine();
  const tech = Object.assign({}, TECH_OFF, { spo2ProbeOff: true });
  a.evaluate(frame(0, { spo2: null }, { technical: tech }));
  a.evaluate(frame(1, { spo2: null }, { technical: tech }));
  const s = a.evaluate(frame(2, { spo2: null }, { technical: tech }));
  assert.equal(s.active.length, 1);
  assert.equal(s.active[0].kind, 'technical');
  assert.equal(s.active[0].priority, 'low');
});

test('limit validation rejects low ≥ high and bad numbers', () => {
  const a = new AlarmEngine();
  assert.equal(a.setLimit('hr', { low: 130 }).ok, false);
  assert.equal(a.setLimit('hr', { low: 'x' }).ok, false);
  assert.equal(a.setLimit('hr', { delay: 99 }).ok, false);
  assert.equal(a.setLimit('nope', {}).ok, false);
  assert.equal(a.setLimit('hr', { low: '45' }).limit.low, 45);
  assert.equal(a.setLimit('spo2', { high: '' }).limit.high, null);
});

test('history exports as CSV', () => {
  const a = new AlarmEngine();
  a.setLimit('hr', { delay: 0 });
  a.evaluate(frame(0, { hr: 150 }));
  const csv = historyCSV(a.history).trim().split('\n');
  assert.equal(csv.length, 2);
  assert.match(csv[1], /^hr:high,physiological,medium,HR high,150,120,0,0,,$/);
});

test('presets drive the expected alarms end to end (simulation → alarm engine)', () => {
  const expect = {
    baseline: [], tachy: ['hr:high'], brady: ['hr:low'], desat: ['spo2:low'], tachypnea: ['rr:high'],
    bradypnea: ['rr:low'], fever: ['temp:high'], apnea: ['apnea'],
    hypotension: ['sbp:low', 'dbp:low', 'map:low', 'art_sys:low', 'art_map:low'],
    hypertension: ['sbp:high', 'dbp:high', 'map:high', 'art_sys:high', 'art_map:high'], disconnect: ['tech:ecgLeadsOff', 'tech:spo2NoSignal'],
    af: ['rhythm:irregular'], pvc: ['rhythm:pvc'], hypovent: ['etco2:high', 'rr:low'],
    vt: ['rhythm:vtach', 'hr:high', 'sbp:low', 'dbp:low', 'map:low', 'art_sys:low', 'art_map:low'],
  };
  for (const [id, ids] of Object.entries(expect)) {
    const e = new Engine(params.applyPreset(id, params.DEFAULTS).params);
    const a = new AlarmEngine();
    e.onFrame = f => a.evaluate(f);
    e.startNibp();
    e.advance(70);
    const got = a.state().active.map(x => x.id).sort();
    assert.deepEqual(got, ids.slice().sort(), id);
  }
});
