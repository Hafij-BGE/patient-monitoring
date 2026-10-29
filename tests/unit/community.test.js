'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../../src/sim/params.js');
const C = require('../../src/core/community.js');
const tool = require('../../tools/community-scenario.js');

const GOOD = { name: 'Dehydrated older adult', note: 'Fast heart, low pressure, warm.', source: 'Invented teaching example',
  changes: { age_years: 78, hr: 112, sbp: 98, dbp: 62, temp: 37.9 } };
const BUILT_IN = P.PRESETS.length;

function issueBody(scenario, boxes) {
  return '### Scenario\n\n```json\n' + JSON.stringify(scenario, null, 2) + '\n```\n\n### Confirmation\n\n' +
    tool.CONSENT.map((c, i) => '- [' + ((boxes || [true, true])[i] ? 'X' : ' ') + '] ' + c + ' (rest of the label)').join('\n') + '\n';
}

function unregister() { P.PRESETS.splice(BUILT_IN); }

test('a well-formed submission passes and gets a slug id', () => {
  const r = C.validateSubmission(GOOD);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.scenario.id, 'c-dehydrated-older-adult');
  assert.deepEqual(r.scenario.changes, GOOD.changes);
});

test('submission errors: unknown keys, processing keys, bad types, clamping, baseline values', () => {
  const bad = (changes, extra) => C.validateSubmission(Object.assign({}, GOOD, { changes }, extra)).errors.join(' | ');
  assert.match(bad({ heart_rate: 90 }), /changes\.heart_rate: unknown parameter/);
  assert.match(bad({ hr: 90, sweep: 50 }), /changes\.sweep: display\/processing settings/);
  assert.match(bad({ hr: '90' }), /changes\.hr: must be a number/);
  assert.match(bad({ hr: 400 }), /changes\.hr: outside the allowed range/);
  assert.match(bad({ sbp: 90, dbp: 85 }), /diastolic must be at least 10 mmHg below systolic/);
  assert.match(bad({ hr: 72, temp: 38 }), /changes\.hr: equals the baseline value/);
  assert.match(bad({ arrhythmia: 'zombie' }), /changes\.arrhythmia: must be one of/);
  assert.match(bad({}), /set at least one parameter/);
  assert.match(bad({ hr: 90 }, { extra: 1 }), /extra: unknown field/);
  assert.equal(C.validateSubmission([]).ok, false);
});

test('text fields: lengths, required source, no markup characters', () => {
  const t = extra => C.validateSubmission(Object.assign({}, GOOD, extra)).errors.join(' | ');
  assert.match(t({ name: 'ab' }), /name: at least 3/);
  assert.match(t({ name: 'x'.repeat(81) }), /name: at most 80/);
  assert.match(t({ name: '<img src=x onerror=alert(1)>' }), /name: plain text only/);
  assert.match(t({ note: 'see `code`' }), /note: plain text only/);
  assert.match(t({ source: undefined }), /source: at least 5/);
  assert.match(t({ name: 42 }), /name: must be text/);
  assert.equal(C.validateSubmission(Object.assign({}, GOOD, { note: undefined })).ok, true);
});

test('duplicates of existing scenarios are refused by settings and by name', () => {
  const sepsis = P.PRESETS.find(p => p.id !== 'baseline' && Object.keys(p.changes).length);
  const sameSettings = C.validateSubmission(Object.assign({}, GOOD, { changes: sepsis.changes }));
  assert.match(sameSettings.errors.join(), /same settings as the existing scenario/);
  const sameName = C.validateSubmission(Object.assign({}, GOOD, { name: sepsis.name.toUpperCase() }));
  assert.match(sameName.errors.join(), /already exists/);
});

test('changesFrom leaves out display settings and, unless asked, the patient profile', () => {
  const params = Object.assign({}, P.DEFAULTS, { hr: 120, age_years: 80, sweep: 50 });
  assert.deepEqual(C.changesFrom(params, false), { hr: 120 });
  assert.deepEqual(C.changesFrom(params, true), { age_years: 80, hr: 120 });
});

test('issue URL is prefilled with the form field and an encoded JSON body', () => {
  const u = new URL(C.issueUrl(GOOD));
  assert.equal(u.origin + u.pathname, 'https://github.com/Hafij-BGE/patient-monitoring/issues/new');
  assert.equal(u.searchParams.get('template'), 'scenario.yml');
  assert.equal(u.searchParams.get('title'), 'Scenario: ' + GOOD.name);
  assert.deepEqual(JSON.parse(u.searchParams.get('scenario')), GOOD);
  assert.ok(C.issueUrl(GOOD).length < 8000);
});

test('issue body parser reads the first json block and reports bad JSON', () => {
  assert.deepEqual(C.parseIssueBody(issueBody(GOOD)).value, GOOD);
  assert.equal(C.parseIssueBody('no code here').ok, false);
  assert.match(C.parseIssueBody('```json\n{bad\n```').error, /does not parse/);
});

test('collection: append, unique ids, duplicate issue refused, script round trip', () => {
  const s1 = C.validateSubmission(GOOD).scenario;
  let c = C.addToCollection(C.emptyCollection(), s1, { author: 'someone', issue: 7, added: '2026-10-29' });
  assert.equal(c.scenarios[0].id, 'c-dehydrated-older-adult');
  const s2 = Object.assign({}, s1, { changes: Object.assign({}, s1.changes, { hr: 118 }) });
  c = C.addToCollection(c, s2, { author: 'other', issue: 8, added: '2026-10-29' });
  assert.equal(c.scenarios[1].id, 'c-dehydrated-older-adult-2');
  assert.throws(() => C.addToCollection(c, s2, { author: 'other', issue: 8, added: '2026-10-29' }), /already in the list/);
  assert.throws(() => C.addToCollection(c, s2, { author: 'bad name!', issue: 9, added: '2026-10-29' }), /author/);
  const root = {};
  new Function('root', C.toScript(c).replace('})(this);', '})(root);'))(root);
  assert.deepEqual(root.PM.communityData, c);
});

test('register adds valid entries as community presets and skips broken ones', () => {
  const s1 = C.validateSubmission(GOOD).scenario;
  const c = C.addToCollection(C.emptyCollection(), s1, { author: 'someone', issue: 7, added: '2026-10-29' });
  const broken = Object.assign({}, c.scenarios[0], { id: 'c-broken', issue: 9, changes: { hr: 999 } });
  const r = C.register({ scenarios: c.scenarios.concat([broken, { id: 'c-x' }]) });
  try {
    assert.equal(r.added.length, 1);
    assert.equal(r.rejected.length, 2);
    const p = P.PRESETS.find(q => q.id === 'c-dehydrated-older-adult');
    assert.equal(p.community, true);
    assert.deepEqual(p.refs, []);
    assert.equal(P.applyPreset(p.id, P.DEFAULTS).params.hr, 112);
    assert.equal(P.matchPreset(P.applyPreset(p.id, P.DEFAULTS).params), p.id);
    // a registered community scenario now counts for the duplicate check
    assert.match(C.validateSubmission(Object.assign({}, GOOD, { name: 'Another name' })).errors.join(), /same settings/);
    // registering the same list again adds nothing
    assert.equal(C.register(c).added.length, 0);
  } finally { unregister(); }
});

test('Action tool: check needs both consent boxes and a valid scenario; error comments carry no backticks', () => {
  const ev = body => ({ issue: { number: 3, body, user: { login: 'someone' } } });
  assert.equal(tool.checkIssue(ev(issueBody(GOOD))).ok, true);
  unregister();
  const noBox = tool.checkIssue(ev(issueBody(GOOD, [true, false])));
  assert.equal(noBox.ok, false);
  assert.match(noBox.errors.join(), /I agree that the scenario is published/);
  unregister();
  const evil = tool.checkIssue(ev(issueBody(Object.assign({}, GOOD, { changes: { 'x```\n@everyone': 1 } }))));
  unregister();
  assert.equal(evil.ok, false);
  const block = tool.errorBlock(evil.errors);
  assert.equal((block.match(/```/g) || []).length, 2, 'only the opening and closing fence');
  assert.ok(!/\n@everyone/.test(block));
});

test('Action tool: add writes json and script, then refuses the same issue again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-community-'));
  const repo = path.join(__dirname, '..', '..', 'community');
  const saved = { json: fs.readFileSync(path.join(repo, 'scenarios.json'), 'utf8'), js: fs.readFileSync(path.join(repo, 'scenarios.js'), 'utf8') };
  const { execFileSync } = require('child_process');
  const event = path.join(dir, 'event.json'), comment = path.join(dir, 'comment.md'), out = path.join(dir, 'out');
  // Runs against the real list (the approve workflow runs the tests after adding an entry), then restores it.
  const mine = Object.assign({}, GOOD, { name: 'Unit test scenario zq', changes: { hr: 113, rr: 23, temp: 38.3 } });
  const before = JSON.parse(saved.json).scenarios.length;
  fs.writeFileSync(event, JSON.stringify({ issue: { number: 99999, body: issueBody(mine), user: { login: 'someone' } } }));
  const run = () => { fs.writeFileSync(out, ''); execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'tools', 'community-scenario.js'), 'add', event, comment], { env: Object.assign({}, process.env, { GITHUB_OUTPUT: out }) }); return fs.readFileSync(out, 'utf8'); };
  try {
    assert.equal(run(), 'added=true\n');
    const c = JSON.parse(fs.readFileSync(path.join(repo, 'scenarios.json'), 'utf8'));
    assert.equal(c.scenarios.length, before + 1);
    const e = c.scenarios[before];
    assert.equal(e.author, 'someone');
    assert.equal(e.issue, 99999);
    assert.match(e.id, /^c-unit-test-scenario-zq/);
    assert.ok(fs.readFileSync(path.join(repo, 'scenarios.js'), 'utf8').includes('"' + e.id + '"'));
    assert.match(fs.readFileSync(comment, 'utf8'), /\*\*Added\*\* as `c-unit-test-scenario-zq/);
    assert.equal(run(), 'added=false\n');
    assert.match(fs.readFileSync(comment, 'utf8'), /Not added/);
  } finally {
    fs.writeFileSync(path.join(repo, 'scenarios.json'), saved.json);
    fs.writeFileSync(path.join(repo, 'scenarios.js'), saved.js);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the shipped community list is valid', () => {
  const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'community', 'scenarios.json'), 'utf8'));
  assert.equal(c.format, C.FORMAT);
  for (const e of c.scenarios) assert.deepEqual(C.validateEntry(e).errors, [], e.id);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', '..', 'community', 'scenarios.js'), 'utf8'), C.toScript(c));
});
