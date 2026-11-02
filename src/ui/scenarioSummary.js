/* Scenario summary under the controls: what the selected scenario is, what it changes
 * against the baseline defaults, and the literature behind it (from REFERENCES.md via
 * src/sim/references.js). renderDetails fills the Scenario details tab with the
 * background from src/sim/scenarioDetails.js. All text goes in through textContent.
 * Browser only. */
(function (root) {
  'use strict';
  const { el } = root.PM.dom;
  const P = root.PM.params;
  const R = root.PM.references || {};
  const D = root.PM.scenarioDetails || { CONDITIONS: {}, SCENARIOS: {} };
  const DISCLAIMER = 'Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.';

  function show(k, v) {
    const s = P.SPEC[k];
    return s.unit ? v + ' ' + s.unit : String(v);
  }

  function refItem(n) {
    const r = R[n];
    if (!r) return el('li', { value: n, text: 'Reference ' + n + ' (see REFERENCES.md)' });
    const href = r.doi ? 'https://doi.org/' + r.doi : r.url;
    return el('li', { value: n },
      el('span.cite', { text: r.cite }), ' ',
      href ? el('a', { href, target: '_blank', rel: 'noopener', text: r.doi ? 'DOI' : 'Link' }) : null,
      r.supports ? el('div.supports', { text: 'Supports: ' + r.supports }) : null);
  }

  function changesTable(p) {
    const keys = Object.keys(p.changes);
    if (!keys.length) return el('p.hint', { text: 'No changes: every patient and sensor setting stays at its default.' });
    return el('table.scn-changes', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Setting' }), el('th', { text: 'Scenario' }), el('th', { text: 'Default' }))),
      el('tbody', {}, keys.map(k => el('tr', {},
        el('td', { text: P.SPEC[k].label }),
        el('td.d', { text: show(k, p.changes[k]) }),
        el('td', { text: show(k, P.SPEC[k].def) })))));
  }

  /** Render the summary for preset id ('custom' = settings edited by hand).
   *  opts.openDetails, when given, adds a button that opens the Scenario details tab. */
  function render(box, id, opts) {
    box.textContent = '';
    box.append(el('h3', { text: 'Scenario summary' }));
    if (id === 'custom') {
      box.append(el('p.scn-edited', { text: 'Settings edited by hand: they no longer match any scenario, so no summary or references apply. Pick a scenario to load one.' }),
        el('p.hint', { text: DISCLAIMER }));
      return;
    }
    const p = P.PRESETS.find(x => x.id === id);
    if (!p) { box.append(el('p.hint', { text: 'No scenario selected.' })); return; }
    const g = P.SCENARIO_GROUPS.find(x => x.id === p.group);
    box.append(el('p.scn-head', {}, el('strong', { text: p.name }), ' ',
      el('span.scn-group', { text: p.community ? 'Community scenario' : (g ? g.label : '') })));
    if (p.note) box.append(el('p.scn-note', { text: p.note }));
    if (opts && opts.openDetails && D.SCENARIOS[p.id]) {
      const b = el('button', { type: 'button', text: 'What is this condition? Open scenario details' });
      b.addEventListener('click', opts.openDetails);
      box.append(el('p', {}, b));
    }
    box.append(el('h4', { text: 'What this scenario changes' }), changesTable(p));
    if (p.community) {
      box.append(el('h4', { text: 'Source' }),
        el('p', {}, 'Submitted by @' + p.author + ' in ',
          el('a', { href: 'https://github.com/Hafij-BGE/patient-monitoring/issues/' + p.issue, target: '_blank', rel: 'noopener', text: 'issue #' + p.issue }),
          ' (added ' + p.added + '). Source given by the author: ' + p.source + '.'),
        el('p.hint', { text: 'The maintainer checked the format and the parameter ranges, not the clinical content.' }));
    } else if (p.refs && p.refs.length) {
      box.append(el('h4', { text: 'Literature (' + p.refs.length + ')' }),
        el('ol.scn-refs', {}, p.refs.map(refItem)),
        el('p.hint', { text: 'Numbers match REFERENCES.md and the References tab.' }));
    }
    box.append(el('p.hint', { text: 'Illustrative pattern for teaching signal behaviour; real presentations vary and values are not diagnostic. ' + DISCLAIMER }));
  }

  const KIND = {
    condition: 'Clinical condition',
    sign: 'Vital-sign pattern, not a diagnosis',
    technical: 'Technical problem: the patient may be well'
  };

  /** Render the Scenario details tab for preset id: what the condition is, what happens
   *  in the body, what this scenario shows on the monitor, and the literature. */
  function renderDetails(box, id) {
    box.textContent = '';
    box.append(el('h3', { text: 'Scenario details' }));
    if (id === 'custom') {
      box.append(el('p.scn-edited', { text: 'Settings edited by hand: they no longer match any scenario, so no condition details apply. Pick a scenario in Controls or on the bedside view to see its details.' }),
        el('p.hint', { text: DISCLAIMER }));
      return;
    }
    const p = P.PRESETS.find(x => x.id === id);
    if (!p) { box.append(el('p.hint', { text: 'No scenario selected.' })); return; }
    const g = P.SCENARIO_GROUPS.find(x => x.id === p.group);
    const s = D.SCENARIOS[p.id];
    const c = s && D.CONDITIONS[s.condition];
    box.append(el('p.scn-head', {}, el('strong', { text: p.name }), ' ',
      el('span.scn-group', { text: p.community ? 'Community scenario' : (g ? g.label : '') })));
    if (!c) {
      box.append(el('p.hint', { text: p.community
        ? 'Community scenarios have no background text here. See the source the author gave in the scenario summary under Controls.'
        : 'No background text for this scenario yet.' }),
        el('h4', { text: 'What this scenario changes' }), changesTable(p),
        el('p.hint', { text: DISCLAIMER }));
      return;
    }
    box.append(
      el('h4', { text: c.title }),
      el('p.scn-kind.' + c.kind, { text: KIND[c.kind] }),
      el('h4', { text: c.kind === 'condition' ? 'What is this condition?' : 'What is it?' }),
      el('p', { text: c.what }),
      el('h4', { text: c.kind === 'technical' ? 'What happens' : 'What happens in the body' }),
      el('p', { text: c.happens }),
      el('h4', { text: 'What this scenario shows on the monitor' }),
      el('p', { text: s.shows }),
      changesTable(p));
    if (p.note) box.append(el('h4', { text: 'Teaching note' }), el('p.scn-note', { text: p.note }));
    if (p.refs && p.refs.length) {
      box.append(el('h4', { text: 'Literature (' + p.refs.length + ')' }),
        el('ol.scn-refs', {}, p.refs.map(refItem)),
        el('p.hint', { text: 'The background is a plain-language summary of general knowledge in these sources; specific numbers come from their "Supports" lines. Numbers match REFERENCES.md and the References tab.' }));
    }
    box.append(el('p.hint', { text: 'Illustrative pattern for teaching signal behaviour; real presentations vary and values are not diagnostic. ' + DISCLAIMER }));
  }

  (root.PM = root.PM || {}).scenarioSummary = { render, renderDetails };
})(this);
