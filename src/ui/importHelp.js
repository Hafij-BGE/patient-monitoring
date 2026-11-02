/* Help blocks of the Data tab: how to import a file and what it may contain,
 * downloadable sample files (src/data/samples.js), and the ways to bring in data
 * from a device. The column names, units, ranges and missing-value words are read
 * from the importer and PM.units, so this help cannot drift from what the code
 * accepts. All text goes in through textContent. Browser only. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, download } = PM.dom;
  const DISCLAIMER = 'Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.';

  const list = items => el('ul', null, ...items.map(t => el('li', { text: t })));
  const quoted = a => a.map(s => '"' + s + '"').join(', ');

  function paramTable() {
    const I = PM.importer, U = PM.units;
    return el('div.table-wrap', null, el('table.imp-params', null,
      el('thead', null, el('tr', null, ...['Parameter', 'Column or type names', 'Units (first = stored unit)', 'Accepted range'].map(t => el('th', { text: t })))),
      el('tbody', null, ...Object.keys(U.PARAMS).map(p => {
        const P = U.PARAMS[p];
        const names = [p].concat((I.SYNONYMS[p] || []).filter(n => n !== p));
        return el('tr', null, el('td', { text: P.label }), el('td', { text: names.join(', ') }),
          el('td', { text: U.acceptedUnits(p).join(', ') }), el('td', { text: P.min + '–' + P.max + ' ' + P.unit }));
      }))));
  }

  function howTo() {
    const N = PM.importer.NAMES;
    return el('details.imp-help', null,
      el('summary', { text: 'How to import a file, and what it can contain' }),
      el('h4', { text: 'Steps' }),
      el('ol', null, ...[
        'Download a sample file below, or save your own table as CSV (comma, semicolon or tab) or JSON. Save spreadsheets (.xlsx, .ods) as CSV first.',
        'Edit it in a spreadsheet or a text editor: keep the header row, one time column, and one column per value (wide) or one row per value (long).',
        'Set the time zone for times written without one, and the date order if dates look like 03/04/2026.',
        'Drop the file on the box or use "choose files". Several files at once are fine.',
        'Read the import report: how many values were imported, which rows were rejected and why (with the line number), how each column was understood.',
        'Imported values appear in the trends and the stored observations with source "imported". "Remove imported data" removes them again.'
      ].map(t => el('li', { text: t }))),
      el('h4', { text: 'What can be imported' }),
      list([
        'File types: .csv, .tsv, .txt (comma, semicolon or tab, detected from the first line) and .json. At most 20 MB and ' + PM.importer.MAX_ENTRIES.toLocaleString('en-US') + ' values per file.',
        'Wide table: a time column plus one column per parameter. The unit can be in the header, as in "Temp (°F)" or "weight_lb".',
        'Long table: columns for time, parameter (' + quoted(N.param) + '), value (' + quoted(N.value) + ') and optionally unit (' + quoted(N.unit) + ').',
        'JSON: an array of records, or an object with "records", "observations", "data" or "measurements". A value can be a number, null, or {"value": 98.6, "unit": "°F"}. A JSON export of this app can be imported again.',
        'Time column names: ' + quoted(N.time) + '. A "date" column and a "time" column are joined.',
        'Times: ISO 8601 (2026-01-15T08:00:00+03:00, with or without zone), Unix time in seconds or milliseconds, DD.MM.YYYY, DD/MM/YYYY or MM/DD/YYYY with an optional time.',
        'Missing values: ' + quoted(N.missing) + ' and an empty quoted cell are stored as missing (a gap). An empty cell in a wide table means "not measured at this time" and is skipped.',
        'Decimal comma ("36,8") is read when the delimiter is not a comma.'
      ]),
      el('h4', { text: 'Parameters, names and units' }),
      el('p.hint', { text: 'Names are matched without case, spaces, "-" or "_". Values are converted to the stored unit. A value outside the accepted range is rejected with its line number, never clamped. A header with no unit uses the stored unit ("assumed" in the report).' }),
      paramTable(),
      el('h4', { text: 'What is not imported' }),
      list([
        'Columns with other names: listed under "Columns ignored" in the CSV report. Unknown keys in JSON records are skipped.',
        'Waveforms (ECG, pleth), HL7, FHIR, PDF, images and spreadsheet files (.xlsx, .ods).',
        'The same parameter at the same time twice: an equal value is dropped as a duplicate; a different value is a conflict, solved by the "Duplicates" setting and listed in the report.'
      ]),
      el('p.hint', { text: 'Files are read in this browser tab or app only. Nothing is uploaded. For coursework, use made-up values or your own readings.' }));
  }

  function samples() {
    const S = PM.samples.SAMPLES;
    return el('details.imp-help', null,
      el('summary', { text: 'Sample files to download and edit (' + S.length + ')' }),
      el('p.hint', { text: 'All values are made up. Download a file, change or add rows, keep the header, and import it. Each one imports with no rejected value.' }),
      el('ul.imp-samples', null, ...S.map(s => el('li', null,
        el('button', { type: 'button', text: 'Download ' + s.file, onclick: () => download(s.file, s.text, s.type) }),
        el('div', null, el('b', { text: s.title }), ' ', el('span.hint', { text: s.desc }))))));
  }

  function devices() {
    return el('details.imp-help', null,
      el('summary', { text: 'Data from a device: watch, sensor, cuff, oximeter' }),
      el('ol', null,
        el('li', null, el('b', { text: 'Any device or app that exports CSV or JSON. ' }),
          'Export the readings from the device\'s own app, compare the column names with the table above, rename a header if needed, and import the file.'),
        el('li', null, el('b', { text: 'Manual entry. ' }),
          'Type a reading from a home blood pressure cuff, thermometer, pulse oximeter or scale in the manual entry form, with the device name under "Device / method".')),
      el('p', { text: 'The page does not connect to a watch or sensor directly. The "On this phone" panel (Health Connect and Bluetooth heart-rate sensor in the Android app) was removed on 2026-11-03.' }),
      el('p.hint', { text: 'The page does not sign in to vendor cloud accounts, read other apps\' files, or connect to hospital monitors. ' + DISCLAIMER }));
  }

  function init() {
    const box = $('#importHelp');
    if (!box || !PM.importer || !PM.importer.NAMES || !PM.samples) return;
    box.textContent = '';
    box.append(howTo(), samples(), devices());
  }

  PM.importHelp = { init };
})(this);
