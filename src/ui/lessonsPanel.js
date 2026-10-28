/* Lessons tab: shows one lesson at a time, applies its scenario and control
 * changes through callbacks from app.js, and grades the quiz with PM.lessons.
 * Best scores stay in this browser only (localStorage). */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el } = PM.dom;
  const KEY = 'pmsim.lessons.v1';

  function loadScores() { try { return JSON.parse(root.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveScores(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: scores just aren't kept */ } }

  /** Fixed rotation of the option order, so the right answer is not always in the same place. */
  function order(n, k) { return Array.from({ length: n }, (_, j) => (j + k) % n); }

  /** opts: { applyPreset(id), setParams(obj), showTab(name), tabLabel(name) } */
  function init(opts) {
    const L = PM.lessons, list = $('#lsList'), body = $('#lsBody');
    let scores = loadScores(), current = null;

    function renderList() {
      list.textContent = '';
      for (const l of L.LESSONS) {
        const best = scores[l.id];
        list.append(el('li', null, el('button.ls-item', {
          type: 'button', 'aria-current': String(current === l.id),
          onclick: () => open(l.id),
        }, el('span', { text: l.title }), el('span.muted', { text: ' · ' + l.minutes + ' min' + (best ? ' · best ' + best.score + '/' + best.total : '') }))));
      }
    }

    function open(id) {
      const l = L.get(id);
      current = id;
      renderList();
      body.textContent = '';
      const msg = el('p.ls-msg', { 'aria-live': 'polite' });
      body.append(
        el('h3', { text: l.title }),
        el('p.muted', { text: 'About ' + l.minutes + ' minutes. Scenario: ' + l.preset + '.' }),
        el('h4', { text: 'You will be able to' }),
        el('ul', null, ...l.objectives.map(o => el('li', { text: o }))),
        el('div.row', null, el('button.primary', { type: 'button', text: 'Load the scenario', onclick: () => {
          opts.applyPreset(l.preset);
          msg.textContent = 'Scenario "' + l.preset + '" loaded. Follow the steps below.';
        } })),
        msg,
        el('h4', { text: 'Steps' }),
        el('ol.ls-steps', null, ...l.steps.map(s => el('li', null,
          el('span', { text: s.text + ' ' }),
          s.set ? el('button', { type: 'button', text: 'Do it', title: Object.entries(s.set).map(([k, v]) => k + ' = ' + v).join(', '),
            onclick: () => { opts.setParams(s.set); msg.textContent = 'Set ' + Object.entries(s.set).map(([k, v]) => k + ' = ' + v).join(', ') + '.'; } }) : null,
          s.tab ? el('button', { type: 'button', text: 'Open ' + opts.tabLabel(s.tab), onclick: () => opts.showTab(s.tab) }) : null))),
        quiz(l),
      );
    }

    function quiz(l) {
      const form = el('form.ls-quiz', { onsubmit: e => { e.preventDefault(); check(); } });
      form.append(el('h4', { text: 'Check yourself' }));
      l.quiz.forEach((q, i) => {
        form.append(el('fieldset', { 'data-q': String(i) },
          el('legend', { text: (i + 1) + '. ' + q.q }),
          ...order(q.options.length, i + l.id.length).map(j => el('label.ls-opt', null, el('input', { type: 'radio', name: 'q' + i, value: String(j) }), el('span', { text: ' ' + q.options[j] }))),
          el('p.ls-why', { hidden: true })));
      });
      const result = el('p.ls-result', { 'aria-live': 'polite' });
      form.append(el('div.row', null, el('button.primary', { type: 'submit', text: 'Check answers' }),
        el('button', { type: 'button', text: 'Clear', onclick: () => { form.reset(); form.querySelectorAll('.ls-why').forEach(p => { p.hidden = true; }); result.textContent = ''; } })), result);

      function check() {
        const answers = l.quiz.map((_, i) => { const r = form.querySelector('input[name="q' + i + '"]:checked'); return r ? Number(r.value) : null; });
        const g = L.grade(l.id, answers);
        g.items.forEach((it, i) => {
          const p = form.querySelector('fieldset[data-q="' + i + '"] .ls-why');
          p.hidden = !it.answered;
          p.className = 'ls-why ' + (it.ok ? 'ok' : 'bad');
          p.textContent = (it.ok ? 'Correct. ' : 'Not quite: the answer is "' + l.quiz[i].options[it.correct] + '". ') + it.why;
        });
        result.textContent = g.score + ' of ' + g.total + ' correct' + (g.complete ? '.' : ' (some questions unanswered).');
        if (g.complete && (!scores[l.id] || g.score > scores[l.id].score)) {
          scores[l.id] = { score: g.score, total: g.total };
          saveScores(scores); renderList();
        }
      }
      return form;
    }

    renderList();
    open(L.LESSONS[0].id);
    return { open };
  }

  root.PM.lessonsPanel = { init };
})(this);
