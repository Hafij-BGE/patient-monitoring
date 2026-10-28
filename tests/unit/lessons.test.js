'use strict';
// Lessons: every step must be something the simulator can do, every quiz must be
// gradable, and the facts the quizzes rely on must hold in the running model.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/lessons/lessons.js');
const params = require('../../src/sim/params.js');
const { Engine } = require('../../src/sim/engine.js');

const TABS = ['controls', 'nibp', 'alarms', 'trends', 'data', 'profile', 'chain', 'lessons', 'science', 'tests', 'refs'];

test('lessons: presets, tabs and control changes are all valid', () => {
  const ids = new Set();
  for (const l of L.LESSONS) {
    assert.ok(!ids.has(l.id), 'duplicate ' + l.id); ids.add(l.id);
    let p = params.applyPreset(l.preset, params.DEFAULTS).params;
    assert.ok(l.objectives.length && l.steps.length, l.id);
    for (const s of l.steps) {
      if (s.tab) assert.ok(TABS.includes(s.tab), l.id + ' tab ' + s.tab);
      if (!s.set) continue;
      const r = params.validate(p, s.set);
      assert.deepEqual(r.errors, [], l.id + ': ' + JSON.stringify(s.set));
      assert.deepEqual(r.warnings, [], l.id + ': ' + JSON.stringify(s.set));
      p = r.params;
    }
  }
});

test('quizzes: answers in range, options unique, grading counts correctly', () => {
  for (const l of L.LESSONS) {
    assert.ok(l.quiz.length >= 3, l.id);
    for (const q of l.quiz) {
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, l.id + ': ' + q.q);
      assert.equal(new Set(q.options).size, q.options.length, l.id + ': ' + q.q);
      assert.ok(q.why, l.id);
    }
    const all = L.grade(l.id, l.quiz.map(q => q.answer));
    assert.equal(all.score, all.total); assert.equal(all.percent, 100); assert.ok(all.complete);
  }
  const g = L.grade('spo2', [2, null]);
  assert.equal(g.score, 0); assert.equal(g.complete, false);
  assert.equal(g.items[1].answered, false);
  assert.throws(() => L.grade('nope', []));
});

function run(p, seconds) {
  const e = new Engine(p);
  e.advance(seconds);
  return e;
}

test('quiz facts hold in the model: calibration, mains, Ks, delays', () => {
  // SpO2 lesson: SpO2 = 110 − 25·R, so the desaturation preset gives R ≈ (110 − 84)/25
  const e = run(params.applyPreset('desat', params.DEFAULTS).params, 30);
  assert.ok(Math.abs(e.spo2Est.out.ratio - (110 - 84) / 25) < 0.08, 'R ' + e.spo2Est.out.ratio);
  // ECG lesson assumes 50 Hz mains and a 20 s apnea delay by default (alarms lesson)
  assert.equal(params.DEFAULTS.mains_hz, 50);
  assert.equal(params.DEFAULTS.apnea_delay, 20);
  // NIBP lesson: a smaller Ks reports a higher systolic pressure for the same patient
  const sys = ks => {
    const en = new Engine(Object.assign({}, params.DEFAULTS, { nibp_ks: ks }));
    let res = null;
    en.onNibp = r => { res = r; };
    en.startNibp();
    en.advance(90);
    assert.ok(res && Number.isFinite(res.sbp), 'NIBP result for Ks ' + ks);
    return res.sbp;
  };
  assert.ok(sys(0.3) > sys(0.5) + 2);
});
