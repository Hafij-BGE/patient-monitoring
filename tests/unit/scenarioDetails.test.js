'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const params = require('../../src/sim/params.js');
const refs = require('../../src/sim/references.js');
const { CONDITIONS, SCENARIOS } = require('../../src/sim/scenarioDetails.js');

const builtIn = params.PRESETS.filter(p => !p.community);

test('every built-in scenario has details with a known condition', () => {
  for (const p of builtIn) {
    const s = SCENARIOS[p.id];
    assert.ok(s, 'no details for ' + p.id);
    assert.ok(CONDITIONS[s.condition], p.id + ': unknown condition ' + s.condition);
    assert.ok(s.shows && s.shows.length > 20, p.id + ': empty "shows" text');
  }
  const ids = new Set(builtIn.map(p => p.id));
  for (const id of Object.keys(SCENARIOS)) assert.ok(ids.has(id), 'details for unknown scenario ' + id);
});

test('every condition is complete and used', () => {
  const used = new Set(Object.values(SCENARIOS).map(s => s.condition));
  for (const [k, c] of Object.entries(CONDITIONS)) {
    assert.ok(['condition', 'sign', 'technical'].includes(c.kind), k + ': bad kind');
    assert.ok(c.title, k + ': no title');
    for (const f of ['what', 'happens']) assert.ok(c[f] && c[f].length > 40, k + ': empty ' + f);
    assert.ok(used.has(k), k + ' is not used by any scenario');
  }
});

test('every reference a scenario cites exists in REFERENCES.md', () => {
  for (const p of builtIn) for (const n of p.refs || []) assert.ok(refs[n], p.id + ' cites missing reference ' + n);
});

test('vital-sign numbers quoted in "shows" match the scenario settings', () => {
  const checks = [
    [/heart rate (\d+)\/min/i, (p, m) => assert.equal(p.changes.hr, +m[1])],
    [/respiratory rate (?:down to )?(\d+)\/min/i, (p, m) => assert.equal(p.changes.rr, +m[1])],
    [/blood pressure (\d+)\/(\d+) mmHg/i, (p, m) => { assert.equal(p.changes.sbp, +m[1]); assert.equal(p.changes.dbp, +m[2]); }],
    [/EtCO2 (?:climbs to |falls to |falling to |back to )?(\d+) mmHg/i, (p, m) => assert.equal(p.changes.etco2, +m[1])],
  ];
  let n = 0;
  for (const p of builtIn) for (const [re, check] of checks) {
    const m = re.exec(SCENARIOS[p.id].shows);
    if (m) { n++; assert.doesNotThrow(() => check(p, m), p.id + ': "' + m[0] + '" does not match the settings'); }
  }
  assert.ok(n > 60, 'only ' + n + ' numbers checked');
});
