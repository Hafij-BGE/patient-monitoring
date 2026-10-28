/* Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, CR/LF line ends,
 * UTF-8 BOM, and delimiter detection (comma, semicolon, tab). Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).csv = factory();
})(this, function () {
  'use strict';

  /** Pick the delimiter that splits the first non-empty line into the most fields (outside quotes). */
  function detectDelimiter(text) {
    const line = (text.split(/\r?\n/).find(l => l.trim() !== '') || '');
    let best = ',', bestN = 0;
    for (const d of [',', ';', '\t']) {
      let n = 0, q = false;
      for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
      if (n > bestN) { best = d; bestN = n; }
    }
    return best;
  }

  /**
   * @returns {{delimiter, header: string[], rows: string[][], lineOf: number[], errors: {line, msg}[]}}
   * lineOf[i] = 1-based source line of rows[i] (header is line 1 when present).
   */
  function parse(text, opts) {
    opts = opts || {};
    if (typeof text !== 'string') return { delimiter: ',', header: [], rows: [], lineOf: [], errors: [{ line: 0, msg: 'input is not text' }] };
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const d = opts.delimiter || detectDelimiter(text);
    const records = [], lines = [], errors = [];
    let field = '', rec = [], q = false, line = 1, recLine = 1, i = 0, wasQuoted = false;
    const endField = () => { rec.push(wasQuoted ? field : field.trim()); field = ''; wasQuoted = false; };
    const endRec = () => {
      endField();
      if (!(rec.length === 1 && rec[0] === '')) { records.push(rec); lines.push(recLine); }
      rec = []; recLine = line;
    };
    for (; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else { if (ch === '\n') line++; field += ch; }
      } else if (ch === '"') {
        if (field.trim() === '') { q = true; wasQuoted = true; field = ''; }
        else field += ch; // stray quote inside an unquoted field: keep literally
      } else if (ch === d) endField();
      else if (ch === '\r') { /* handled by \n */ }
      else if (ch === '\n') { line++; endRec(); }
      else field += ch;
    }
    if (q) errors.push({ line: recLine, msg: 'unterminated quoted field' });
    if (field !== '' || rec.length) endRec();
    const hasHeader = opts.header !== false;
    const header = hasHeader && records.length ? records.shift().map(h => h.trim()) : [];
    if (hasHeader) lines.shift();
    records.forEach((r, k) => {
      if (header.length && r.length !== header.length)
        errors.push({ line: lines[k], msg: 'expected ' + header.length + ' fields, found ' + r.length });
    });
    return { delimiter: d, header, rows: records, lineOf: lines, errors };
  }

  return { parse, detectDelimiter };
});
