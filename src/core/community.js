/* Community scenarios: scenarios that other people submit through a GitHub issue.
 * The same checks run in three places: in the page before a submission is sent,
 * in the GitHub Action that validates the issue and, after a maintainer adds the
 * "approved" label, writes community/scenarios.json + community/scenarios.js, and in
 * the page again when the bundled list is loaded. An entry that fails is skipped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../sim/params.js'));
  else (root.PM = root.PM || {}).community = factory(root.PM.params);
})(this, function (P) {
  'use strict';

  const REPO = 'Hafij-BGE/patient-monitoring';
  const TEMPLATE = 'scenario.yml';
  const FORMAT = 'vitalslab-community-scenarios';
  // [min, max] characters. Source is required: every scenario needs a reason for its numbers.
  const LIMITS = { name: [3, 80], note: [0, 600], source: [5, 300] };
  const MAX_ENTRIES = 200;
  // Plain text only. <> and backticks are refused so the text cannot become markup
  // in the page or break out of the code block in the Action's issue comment.
  const BAD_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f<>`]/;
  const SUBMISSION_KEYS = ['name', 'note', 'source', 'changes'];
  const ENTRY_KEYS = SUBMISSION_KEYS.concat(['id', 'author', 'issue', 'added']);

  /** Keys a scenario may set: everything except the display/processing settings. */
  function scenarioKeys() {
    return Object.keys(P.SPEC).filter(k => P.SPEC[k].group !== 'processing');
  }

  function slug(name) {
    const s = String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return 'c-' + (s || 'scenario');
  }

  function checkText(field, v, errors) {
    const [min, max] = LIMITS[field];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') { errors.push(field + ': must be text'); return ''; }
    const t = v.replace(/\r\n?/g, '\n').trim();
    if (t.length < min) errors.push(field + ': at least ' + min + ' characters');
    if (t.length > max) errors.push(field + ': at most ' + max + ' characters');
    if (BAD_CHARS.test(t)) errors.push(field + ': plain text only (no <, > or ` and no control characters)');
    return t;
  }

  /** Checks the changes object: known scenario keys, valid values, nothing clamped. */
  function checkChanges(changes, errors) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) { errors.push('changes: must be an object of parameter: value'); return {}; }
    const allowed = scenarioKeys(), out = {};
    for (const [k, v] of Object.entries(changes)) {
      const s = P.SPEC[k];
      if (!s) { errors.push('changes.' + k + ': unknown parameter'); continue; }
      if (!allowed.includes(k)) { errors.push('changes.' + k + ': display/processing settings are not part of a scenario'); continue; }
      if (s.type === 'num' && typeof v !== 'number') { errors.push('changes.' + k + ': must be a number'); continue; }
      if (s.type === 'sel' && !s.options.some(o => o === v)) { errors.push('changes.' + k + ': must be one of ' + s.options.join(', ')); continue; }
      out[k] = v;
    }
    const keys = Object.keys(out);
    if (!keys.length && !errors.some(e => e.startsWith('changes'))) errors.push('changes: set at least one parameter that differs from the baseline');
    const r = P.validate(P.DEFAULTS, out);
    for (const e of r.errors) errors.push('changes.' + e.key + ': ' + e.msg);
    for (const w of r.warnings) errors.push('changes.' + w.key + ': outside the allowed range (' + w.msg + ')');
    for (const k of keys) if (String(out[k]) === String(P.DEFAULTS[k])) errors.push('changes.' + k + ': equals the baseline value; leave it out');
    return out;
  }

  /** Built-in or community preset whose patient and sensor settings equal these changes. */
  function sameAs(changes, presets) {
    const keys = scenarioKeys();
    const mine = Object.assign({}, P.DEFAULTS, changes);
    return (presets || P.PRESETS).find(p => keys.every(k => String(Object.assign({}, P.DEFAULTS, p.changes)[k]) === String(mine[k])));
  }

  /**
   * Checks a submission { name, note, source, changes }.
   * opts.presets: list to check for duplicates (default: all presets loaded now).
   * Returns { ok, errors, scenario } with trimmed text and a generated id.
   */
  function validateSubmission(sub, opts) {
    const errors = [];
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return { ok: false, errors: ['the scenario must be a JSON object'], scenario: null };
    for (const k of Object.keys(sub)) if (!SUBMISSION_KEYS.includes(k)) errors.push(k + ': unknown field (allowed: ' + SUBMISSION_KEYS.join(', ') + ')');
    const scenario = {
      name: checkText('name', sub.name, errors),
      note: checkText('note', sub.note, errors),
      source: checkText('source', sub.source, errors),
      changes: checkChanges(sub.changes, errors),
    };
    const presets = (opts && opts.presets) || P.PRESETS;
    scenario.id = slug(scenario.name);
    if (!errors.length) {
      const dup = sameAs(scenario.changes, presets);
      if (dup) errors.push('changes: same settings as the existing scenario "' + dup.name + '"');
      const lower = scenario.name.toLowerCase();
      const named = presets.find(p => p.name.toLowerCase() === lower);
      if (named) errors.push('name: a scenario called "' + named.name + '" already exists');
    }
    return { ok: errors.length === 0, errors, scenario };
  }

  /** Checks one stored entry (submission fields plus id, author, issue, added). */
  function validateEntry(e) {
    const errors = [];
    if (!e || typeof e !== 'object') return { ok: false, errors: ['entry is not an object'] };
    for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) errors.push(k + ': unknown field');
    const sub = {};
    for (const k of SUBMISSION_KEYS) if (k in e) sub[k] = e[k];
    const r = validateSubmission(sub, { presets: [] });
    errors.push(...r.errors);
    if (typeof e.id !== 'string' || !/^c-[a-z0-9-]{1,40}(-\d+)?$/.test(e.id)) errors.push('id: must look like c-name');
    if (typeof e.author !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(e.author)) errors.push('author: must be a GitHub user name');
    if (!Number.isInteger(e.issue) || e.issue < 1) errors.push('issue: must be the issue number');
    if (typeof e.added !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.added)) errors.push('added: must be a YYYY-MM-DD date');
    return { ok: errors.length === 0, errors };
  }

  /** Changes from baseline in the current parameters (display settings never count). */
  function changesFrom(params, includeProfile) {
    const out = {};
    for (const k of scenarioKeys()) {
      if (!includeProfile && P.SPEC[k].group === 'patient') continue;
      if (String(params[k]) !== String(P.DEFAULTS[k])) out[k] = params[k];
    }
    return out;
  }

  /** New issue page with the form prefilled (the form field id is "scenario"). */
  function issueUrl(sub) {
    return 'https://github.com/' + REPO + '/issues/new?template=' + TEMPLATE +
      '&title=' + encodeURIComponent('Scenario: ' + (sub.name || '')) +
      '&scenario=' + encodeURIComponent(JSON.stringify(sub, null, 2));
  }

  /** The first ```json fenced block in an issue body, parsed. */
  function parseIssueBody(body) {
    const m = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(String(body || ''));
    if (!m) return { ok: false, error: 'no ```json block found in the issue' };
    try { return { ok: true, value: JSON.parse(m[1]) }; } catch (err) { return { ok: false, error: 'the JSON block does not parse: ' + err.message }; }
  }

  function emptyCollection() { return { format: FORMAT, version: 1, scenarios: [] }; }

  /** Collection with a checked submission appended; ids are made unique. */
  function addToCollection(collection, scenario, meta) {
    const c = collection && Array.isArray(collection.scenarios) ? collection : emptyCollection();
    if (c.scenarios.length >= MAX_ENTRIES) throw new Error('the community list is full (' + MAX_ENTRIES + ')');
    if (c.scenarios.some(e => e.issue === meta.issue)) throw new Error('issue #' + meta.issue + ' is already in the list');
    const taken = new Set(P.PRESETS.map(p => p.id).concat(c.scenarios.map(e => e.id)));
    let id = scenario.id, n = 2;
    while (taken.has(id)) id = scenario.id + '-' + n++;
    const entry = { id, name: scenario.name, note: scenario.note, source: scenario.source, changes: scenario.changes,
      author: meta.author, issue: meta.issue, added: meta.added };
    const v = validateEntry(entry);
    if (!v.ok) throw new Error(v.errors.join('; '));
    return { format: FORMAT, version: 1, scenarios: c.scenarios.concat([entry]) };
  }

  /** community/scenarios.js: the same data as a script, so the page needs no network request. */
  function toScript(collection) {
    return '/* Generated from community/scenarios.json by tools/community-scenario.js. Do not edit by hand. */\n' +
      '(function (root) { (root.PM = root.PM || {}).communityData = ' + JSON.stringify(collection, null, 2) + '; })(this);\n';
  }

  /** Adds the valid entries of a collection to the preset list. Returns { added, rejected }. */
  function register(collection) {
    const added = [], rejected = [];
    const list = collection && Array.isArray(collection.scenarios) ? collection.scenarios : [];
    for (const e of list) {
      const v = validateEntry(e);
      if (!v.ok || P.PRESETS.some(p => p.id === e.id)) { rejected.push({ id: e && e.id, errors: v.ok ? ['duplicate id'] : v.errors }); continue; }
      const preset = { id: e.id, name: e.name, changes: Object.assign({}, e.changes), community: true,
        author: e.author, issue: e.issue, added: e.added, source: e.source, note: e.note || '', refs: [] };
      P.PRESETS.push(preset);
      added.push(preset);
    }
    return { added, rejected };
  }

  return { REPO, FORMAT, LIMITS, MAX_ENTRIES, slug, scenarioKeys, validateSubmission, validateEntry, changesFrom,
    issueUrl, parseIssueBody, emptyCollection, addToCollection, toScript, register };
});
