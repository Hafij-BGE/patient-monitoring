/* "Share as community scenario" dialog. Turns the current patient and sensor
 * settings into a submission, shows exactly what would be sent, checks it with the
 * same rules as the GitHub Action (core/community.js), and opens a prefilled GitHub
 * issue only when the user clicks the link. Nothing is sent from the page itself. */
(function (root) {
  'use strict';
  const { el } = root.PM.dom;
  const C = root.PM.community;

  let dlg, fName, fNote, fSource, fProfile, preview, msgs, issueLink, copyBtn, getParams = null, current = null;

  function field(label, input, hint) {
    return el('label.share-field', null, el('span', { text: label }), input, hint ? el('small', { text: hint }) : null);
  }

  function build() {
    fName = el('input', { type: 'text', maxlength: String(C.LIMITS.name[1]), autocomplete: 'off', placeholder: 'e.g. Dehydrated older adult with tachycardia' });
    fNote = el('textarea', { rows: '3', maxlength: String(C.LIMITS.note[1]), placeholder: 'What the scenario shows and what a learner should notice.' });
    fSource = el('input', { type: 'text', maxlength: String(C.LIMITS.source[1]), autocomplete: 'off', placeholder: 'e.g. guideline, textbook chapter, DOI or PubMed ID' });
    fProfile = el('input', { type: 'checkbox' });
    preview = el('pre.share-preview', { 'aria-label': 'Data that will be sent' });
    msgs = el('div.msgs', { 'aria-live': 'polite' });
    copyBtn = el('button', { type: 'button', text: 'Copy JSON', onclick: copy });
    issueLink = el('a.button.primary', { target: '_blank', rel: 'noopener', text: 'Open GitHub issue…' });
    for (const f of [fName, fNote, fSource, fProfile]) f.addEventListener('input', refresh);
    fProfile.addEventListener('change', refresh);

    dlg = el('dialog.share', { id: 'dlgShare', 'aria-labelledby': 'dlgShareTitle' },
      el('h2', { id: 'dlgShareTitle', text: 'Share as community scenario' }),
      el('p', { text: 'This turns the current patient and sensor settings into a scenario that other people can load. ' +
        'It is sent as a public GitHub issue. A maintainer reviews it; once approved it appears under "Community scenarios" ' +
        'in the scenario list of the website and of later app builds.' }),
      el('div.warn', { text: 'Everything you send is public and permanent on GitHub and is linked to your GitHub account. ' +
        'Use invented values only. Never enter real patient data, names, dates or other identifying details.' }),
      field('Name', fName, C.LIMITS.name[0] + '–' + C.LIMITS.name[1] + ' characters, plain text.'),
      field('Teaching note (optional)', fNote, 'Up to ' + C.LIMITS.note[1] + ' characters.'),
      field('Source for the values', fSource, 'Required: where the numbers come from. Up to ' + C.LIMITS.source[1] + ' characters.'),
      el('label.share-check', null, fProfile,
        el('span', { text: ' Include the patient profile (age, sex, height, weight, diabetes). Leave it off unless the scenario needs it, and use invented values.' })),
      el('h3', { text: 'Exactly what will be sent' }),
      preview,
      msgs,
      el('p.hint', { text: 'Display and processing settings (sweep speed, gains, filters, averaging) are never included. ' +
        'You need a GitHub account. Nothing is sent until you press "Create" on the GitHub page.' }),
      el('div.share-btns', null, copyBtn, issueLink,
        el('button', { type: 'button', text: 'Close', onclick: () => dlg.close() })));
    document.body.append(dlg);
  }

  function submission() {
    const sub = { name: fName.value, note: fNote.value, source: fSource.value, changes: C.changesFrom(getParams(), fProfile.checked) };
    if (!sub.note.trim()) delete sub.note;
    return sub;
  }

  function refresh() {
    const sub = submission();
    const r = C.validateSubmission(sub);
    const shown = { name: r.scenario.name, note: r.scenario.note || undefined, source: r.scenario.source, changes: r.scenario.changes };
    current = r.ok ? shown : null;
    preview.textContent = JSON.stringify(shown, null, 2);
    msgs.textContent = '';
    if (!Object.keys(sub.changes).length) msgs.append(el('div.err', { text: 'Nothing to share yet: change patient or sensor settings in Controls first, or pick a scenario and edit it.' }));
    else for (const e of r.errors) msgs.append(el('div.err', { text: e }));
    if (r.ok) {
      issueLink.href = C.issueUrl(shown);
      issueLink.removeAttribute('aria-disabled');
    } else {
      issueLink.removeAttribute('href');
      issueLink.setAttribute('aria-disabled', 'true');
    }
    copyBtn.disabled = !r.ok;
  }

  function copy() {
    if (!current) return;
    const text = JSON.stringify(current, null, 2);
    const done = () => msgs.replaceChildren(el('div.ok', { text: 'JSON copied. Paste it into the "Scenario" field of a new issue with the "Community scenario" template.' }));
    const fallback = () => {
      const t = el('textarea', { readonly: true, value: text });
      t.style.position = 'fixed'; t.style.opacity = '0';
      dlg.append(t); t.select();
      const ok = document.execCommand && document.execCommand('copy');
      t.remove();
      if (ok) done(); else msgs.replaceChildren(el('div.err', { text: 'Copy is blocked here; select the text above and copy it by hand.' }));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function open() {
    if (!dlg) build();
    refresh();
    if (!dlg.open) dlg.showModal();
  }

  /** button: element that opens the dialog; params: function returning the current parameters. */
  function attach(button, params) {
    getParams = params;
    button.addEventListener('click', open);
  }

  root.PM.sharePanel = { attach, open };
})(this);
