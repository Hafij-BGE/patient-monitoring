#!/usr/bin/env node
/* Community scenario tool, used by .github/workflows/community-scenarios.yml.
 *
 *   node tools/community-scenario.js check <event.json> <comment.md>
 *       Checks the scenario in a GitHub issue event and writes the reply comment.
 *       Sets the step output valid=true|false.
 *   node tools/community-scenario.js add <event.json> <comment.md>
 *       Checks again and, if valid, appends it to community/scenarios.json and
 *       regenerates community/scenarios.js. Sets the step output added=true|false.
 *   node tools/community-scenario.js build
 *       Regenerates community/scenarios.js from community/scenarios.json.
 *
 * The issue text is untrusted. It is only parsed as JSON and checked here; it never
 * reaches a shell. The comment repeats the issue text only after it passed the checks
 * (plain text, no backticks), and error lines are put in a code block. */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../src/core/community.js');

const ROOT = path.join(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'community', 'scenarios.json');
const JS_FILE = path.join(ROOT, 'community', 'scenarios.js');
// Text of the two required boxes in .github/ISSUE_TEMPLATE/scenario.yml (start of each label).
const CONSENT = ['The values are invented', 'I agree that the scenario is published'];

function readCollection() {
  return fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : C.emptyCollection();
}

function writeCollection(c) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(c, null, 2) + '\n');
  fs.writeFileSync(JS_FILE, C.toScript(c));
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, name + '=' + value + '\n');
  else console.log(name + '=' + value);
}

/** Error lines for a comment: no backticks, no fences, bounded length. */
function errorBlock(errors) {
  const lines = errors.slice(0, 20).map(e => '- ' + String(e).replace(/[`\r\n]/g, "'").slice(0, 200));
  if (errors.length > 20) lines.push('- … and ' + (errors.length - 20) + ' more');
  return '```text\n' + lines.join('\n') + '\n```';
}

/** Checks the issue in a GitHub event. Returns { ok, errors, scenario }. */
function checkIssue(event) {
  const issue = event && event.issue;
  if (!issue) return { ok: false, errors: ['not an issue event'] };
  const body = String(issue.body || '');
  const errors = [];
  for (const c of CONSENT) {
    const ticked = body.split('\n').some(l => /^\s*-\s*\[[xX]\]/.test(l) && l.includes(c));
    if (!ticked) errors.push('the box "' + c + ' …" is not ticked');
  }
  const parsed = C.parseIssueBody(body);
  if (!parsed.ok) return { ok: false, errors: errors.concat([parsed.error]) };
  // Already approved community scenarios count as existing ones for the duplicate check.
  C.register(readCollection());
  const r = C.validateSubmission(parsed.value);
  return { ok: r.ok && !errors.length, errors: errors.concat(r.errors), scenario: r.scenario };
}

function summary(s) {
  return '```json\n' + JSON.stringify({ name: s.name, note: s.note || undefined, source: s.source, changes: s.changes }, null, 2) + '\n```';
}

function cmdCheck(eventFile, commentFile) {
  const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  const r = checkIssue(event);
  const text = r.ok
    ? '**Automatic check passed.** Thank you! The scenario below is well formed and all values are inside the simulator ranges.\n\n' +
      summary(r.scenario) + '\n\n' +
      'This check covers format and ranges only, not clinical plausibility. A maintainer will review it; ' +
      'when the `approved` label is added, the scenario is added to VitalsLab and this issue is closed.'
    : '**Automatic check failed.** Please edit the issue to fix:\n\n' + errorBlock(r.errors) + '\n\n' +
      'The easiest way to get a valid scenario is VitalsLab → Controls → *Share as community scenario…*. ' +
      'The check runs again after every edit.';
  fs.writeFileSync(commentFile, text + '\n');
  setOutput('valid', r.ok ? 'true' : 'false');
  return r.ok;
}

function cmdAdd(eventFile, commentFile) {
  const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  const r = checkIssue(event);
  let text, added = false;
  if (r.ok) {
    try {
      const meta = { author: event.issue.user.login, issue: event.issue.number, added: new Date().toISOString().slice(0, 10) };
      const next = C.addToCollection(readCollection(), r.scenario, meta);
      writeCollection(next);
      const entry = next.scenarios[next.scenarios.length - 1];
      added = true;
      text = '**Added** as `' + entry.id + '`. It appears under "Community scenarios" on the website after the next ' +
        'Pages deployment (a few minutes) and in the next app release. Thank you, @' + meta.author + '!';
    } catch (err) {
      r.errors.push(err.message);
    }
  }
  if (!added) text = '**Not added.** The scenario no longer passes the checks:\n\n' + errorBlock(r.errors) +
    '\n\nThe `approved` label was removed. Fix the issue and ask a maintainer to approve it again.';
  fs.writeFileSync(commentFile, text + '\n');
  setOutput('added', added ? 'true' : 'false');
  return added;
}

function main(argv) {
  const [cmd, a, b] = argv;
  if (cmd === 'check' && a && b) { cmdCheck(a, b); return 0; }
  if (cmd === 'add' && a && b) { cmdAdd(a, b); return 0; }
  if (cmd === 'build') { writeCollection(readCollection()); return 0; }
  console.error('usage: community-scenario.js check|add <event.json> <comment.md> | build');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { checkIssue, errorBlock, CONSENT };
