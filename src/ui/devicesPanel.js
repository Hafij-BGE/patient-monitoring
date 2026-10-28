/* Devices tab: device-type picker, bed setting and the connection routes for
 * hospital and home devices (HL7 v2 over MLLP or serial, Bluetooth LE standard
 * profiles, HL7 / FHIR / SDC files, synthetic feed). Browser only; the parsing
 * itself lives in src/devices and is shared with the Node tests. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, $$, el } = PM.dom;

  /** Short human-readable form of a parsed GATT packet. */
  function describe(p) {
    if (!p) return '';
    const skip = new Set(['kind', 'flags', 'raw']);
    const parts = [];
    for (const [k, v] of Object.entries(p)) {
      if (skip.has(k) || v === undefined) continue;
      if (v === null) { parts.push(k + '=missing'); continue; }
      if (Array.isArray(v)) { if (v.length) parts.push(k + '=[' + v.map(x => typeof x === 'number' ? +x.toFixed(3) : x).join(', ') + ']'); continue; }
      if (typeof v === 'object') { if (Object.keys(v).length) parts.push(k + '=' + JSON.stringify(v)); continue; }
      parts.push(k + '=' + (typeof v === 'number' ? +v.toFixed(2) : v));
    }
    return p.kind + ': ' + parts.join(', ');
  }

  /** Short form of a list of observations, e.g. "hr 78 /min, rr missing". */
  function describeObs(list) {
    return list.map(o => {
      const u = PM.units.PARAMS[o.param] ? PM.units.PARAMS[o.param].unit : '';
      if (o.value === null) return o.param + ' missing';
      return o.param + ' ' + PM.dom.fmt(o.value, 1) + (u ? ' ' + u : '') + (o.quality !== 'ok' ? ' (' + o.quality + ')' : '');
    }).join(', ');
  }

  const S = PM.samples;
  const FILE_ROUTES = {
    'hl7-file':  { title: 'HL7 v2 message file', name: 'example_oru.hl7', example: () => S.hl7(Date.now(), bedValue()),
      hint: 'ORU^R01 messages, one or more per file (MLLP framing bytes are removed). OBX-3 codes are matched by MDC reference ID, MDC number or LOINC; OBX-6 units are converted; PID/NK1 identity segments are ignored and not stored.' },
    'fhir-file': { title: 'FHIR R4 Observation or Bundle', name: 'example_vitals.json', example: () => S.fhirBundle(Date.now()),
      hint: 'JSON with Observation resources (single, array or Bundle). LOINC or MDC codes; components are split; dataAbsentReason is stored as missing. Patient resources and subject references are ignored.' },
    'sdc-file':  { title: 'SDC MDIB XML', name: 'example_mdib.xml', example: () => S.sdcMdib(Date.now()),
      hint: 'A saved GetMdibResponse or EpisodicMetricReport (IEEE 11073-10207). Numeric metric states are read with their descriptors; MetricQuality validity sets the quality flag. DOCTYPE and entity declarations are refused.' },
  };

  let bedValue = () => 'ICU^01^01';

  const store_ = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  function init(o) {
    const store = o.store, C = PM.catalog, H = PM.hl7v2;
    const changed = () => { if (o.onChange) o.onChange(); };

    // ---------------------------------------------------------- bed setting
    const bed = $('#devBed'), bedOnly = $('#devBedOnly');
    bed.value = store_.get('pmsim.bed') || 'ICU^01^01';
    bed.addEventListener('change', () => store_.set('pmsim.bed', bed.value.trim()));
    bedValue = () => bed.value.trim() || 'ICU^01^01';
    const acceptLocation = () => bedOnly.checked && bed.value.trim() ? bed.value.trim() : undefined;

    // ---------------------------------------------------------- message log
    const pktBody = $('#pktTable tbody');
    function addRow(r) {
      pktBody.prepend(el('tr', null,
        el('td', { text: new Date(r.t || Date.now()).toLocaleTimeString() }),
        el('td', null, r.from || '', r.synthetic ? ' ' : '', r.synthetic ? el('span.badge.replay', { text: 'SYNTHETIC' }) : null),
        el('td', { text: r.channel || '' }),
        el('td', null, el('code', { text: String(r.raw || '').slice(0, 160) })),
        el('td', { class: r.err ? 'err' : r.warn ? 'warn' : '', text: r.err ? 'error: ' + r.err : r.decoded || '' })));
      while (pktBody.rows.length > 400) pktBody.deleteRow(-1);
    }

    /** Shared path for every live HL7 route (MLLP, serial, synthetic feed). */
    function onHL7(text, meta) {
      meta = meta || {};
      const receivedAt = meta.receivedAt || Date.now();
      const raw = String(text).replace(/\r/g, ' ⏎ ');
      const p = H.parseMessage(text);
      if (p.error) { addRow({ t: receivedAt, from: meta.peer || '?', channel: meta.route, raw, err: p.error }); return { observations: [], error: p.error }; }
      const r = H.toObservations(p, Object.assign({ source: 'device', receivedAt, acceptLocation: acceptLocation() }, meta));
      if (r.observations.length) { store.addMany(r.observations); changed(); }
      const app = p.header.sendingAppName || p.header.sendingApp;
      const from = [app, meta.peer !== app ? meta.peer : null].filter(Boolean).join(' @ ');
      const synthetic = r.observations.some(x => x.provenance && x.provenance.replay) || /^[TD]/.test(p.header.processingId || '');
      addRow({ t: receivedAt, from, channel: (meta.route || 'HL7') + (p.location ? ' · ' + p.location : ''), raw, synthetic,
        warn: !!r.rejected, decoded: r.rejected ? 'dropped: ' + r.rejected : describeObs(r.observations) || 'no mapped OBX values' });
      return r;
    }

    // ---------------------------------------------------------- picker
    const classSel = $('#devClass');
    for (const c of C.CLASSES) classSel.append(el('option', { value: c.id, text: c.label }));
    classSel.value = C.CLASSES.some(c => c.id === store_.get('pmsim.class')) ? store_.get('pmsim.class') : 'bedside';
    classSel.addEventListener('change', () => { store_.set('pmsim.class', classSel.value); renderClass(); });
    let current = null;

    const panelFor = r => FILE_ROUTES[r] ? 'file' : (r === 'csv-file' || r === 'manual') ? 'table' : r;

    function renderClass() {
      const c = C.CLASSES.find(x => x.id === classSel.value) || C.CLASSES[0];
      $('#devClassInfo').textContent = 'Typical parameters: ' + c.params + '. Routes listed are interfaces such devices commonly offer; check the interface documentation of your model.';
      const box = $('#devRoutes'); box.textContent = '';
      for (const r of c.routes) {
        const R = C.ROUTES[r], av = C.availability(r, root);
        const b = el('button.route', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-route': r, onclick: () => selectRoute(r) },
          el('b', { text: R.label }), ' ', el('span.st.' + (av.ok ? 'yes' : 'no'), { text: av.ok ? 'available' : 'unavailable' }),
          el('small', { text: R.std }), el('small.muted', { text: av.ok ? R.note : av.reason }));
        box.append(b);
      }
      selectRoute(c.routes.includes(current) ? current : c.routes[0]);
    }

    function selectRoute(r) {
      current = r;
      $$('#devRoutes .route').forEach(b => b.setAttribute('aria-checked', String(b.dataset.route === r)));
      const pan = panelFor(r);
      $$('#routePanels .rpanel').forEach(p => { p.hidden = p.dataset.route !== pan; });
      if (FILE_ROUTES[r]) {
        const f = FILE_ROUTES[r];
        $('#fileTitle').textContent = f.title; $('#fileHint').textContent = f.hint;
      }
      if (pan === 'table') $('#tableTitle').textContent = r === 'manual' ? 'Manual entry' : 'CSV / JSON table import';
    }

    // ---------------------------------------------------------- BLE
    const gatt = PM.gatt, WB = PM.webBluetooth;
    const av = WB.availability(root);
    $('#bleAvail').append(av.ok ? el('div.ok', { text: 'Web Bluetooth is available.' }) : el('div.warn', { text: av.reason }));
    const kindsBox = $('#bleKinds'), checks = {};
    for (const [k, s] of Object.entries(gatt.SERVICES)) {
      checks[k] = el('input', { type: 'checkbox', checked: true });
      kindsBox.append(el('label.inline', null, checks[k], ' ' + s.label + ' (' + gatt.uuidName(s.service) + ')'));
    }
    const bleBtn = $('#btnBle');
    if (!av.ok) bleBtn.disabled = true;
    bleBtn.addEventListener('click', () => {
      const kinds = Object.keys(checks).filter(k => checks[k].checked);
      if (!kinds.length) { $('#bleAvail').textContent = ''; $('#bleAvail').append(el('div.err', { text: 'Tick at least one device type.' })); return; }
      const card = el('div.devcard'), head = el('div'), stEl = el('div.state'), live = el('div.muted', { text: 'No packets yet' });
      const dis = el('button', { text: 'Disconnect' });
      card.append(head, stEl, live, el('div.row', null, dis));
      $('#bleList').prepend(card);
      const dev = new WB.BleDevice({
        bluetooth: navigator.bluetooth, kinds,
        onObservations: list => { store.addMany(list); changed(); },
        onLive: pkt => {
          live.textContent = new Date(pkt.receivedAt).toLocaleTimeString() + '  ' + describe(pkt.parsed);
          addRow({ t: pkt.receivedAt, from: pkt.deviceName, channel: 'BLE ' + (pkt.characteristic || ''), raw: pkt.rawHex, decoded: describe(pkt.parsed) });
        },
        onStatus: s => {
          head.textContent = '';
          head.append(el('b', { text: s.name || 'Bluetooth device' }), ' ', el('span.badge.device', { text: 'device' }),
            s.manufacturer || s.model ? el('span.muted', { text: ' ' + [s.manufacturer, s.model].filter(Boolean).join(' ') }) : null,
            s.battery !== undefined && s.battery !== null ? el('span.muted', { text: ' · battery ' + s.battery + ' %' }) : null);
          stEl.className = 'state ' + s.state;
          stEl.textContent = s.state + ': ' + s.message + (s.packets ? ' · packets ' + s.packets : '') + (s.errors ? ' · malformed ' + s.errors : '');
          dis.disabled = ['idle', 'disconnected', 'failed'].includes(s.state);
        },
      });
      dis.addEventListener('click', () => dev.disconnect());
      dev.request(); // must run inside the click handler (user gesture)
    });

    // BLE replay (synthetic GATT packets)
    let timers = [], running = false;
    const rBtn = $('#btnReplay'), rState = $('#replayState');
    function stopReplay(msg) {
      timers.forEach(clearTimeout); timers = []; running = false;
      rBtn.textContent = 'Start BLE replay'; rState.textContent = msg || '';
    }
    rBtn.addEventListener('click', () => {
      if (running) { stopReplay('Stopped.'); return; }
      const items = PM.replay.script();
      running = true; rBtn.textContent = 'Stop replay';
      let done = 0;
      const total = items[items.length - 1].at;
      rState.textContent = 'Playing 0 / ' + items.length + ' packets';
      for (const it of items) {
        timers.push(setTimeout(() => {
          const r = PM.replay.decode(it, Date.now());
          addRow({ t: r.meta.receivedAt, from: r.meta.deviceName, channel: 'BLE ' + (r.meta.characteristic || ''), raw: r.meta.rawHex,
            synthetic: true, err: r.error, decoded: describe(r.parsed) });
          if (r.observations.length) { store.addMany(r.observations); changed(); }
          done++;
          rState.textContent = 'Playing ' + done + ' / ' + items.length + ' packets';
          if (done === items.length) stopReplay('Finished: ' + items.length + ' packets in ' + Math.round(total) + ' s. Values stored as device + SYNTHETIC.');
        }, it.at * 1000));
      }
    });

    // ---------------------------------------------------------- HL7 over MLLP (desktop app)
    const desk = root.PMDesktop && root.PMDesktop.mllp;
    const mllpBtn = $('#btnMllp'), mllpState = $('#mllpState'), mllpHost = $('#mllpHost');
    const mav = C.availability('hl7-mllp', root);
    $('#mllpAvail').append(mav.ok ? el('div.ok', { text: 'Desktop app: the TCP listener is available.' }) : el('div.warn', { text: 'Not available: ' + mav.reason + '.' }));
    mllpHost.addEventListener('change', () => { $('#mllpWarn').hidden = mllpHost.value !== '0.0.0.0'; });
    let listening = false;
    if (!desk) mllpBtn.disabled = true;
    else {
      desk.onMessage(m => onHL7(m.text, { route: 'HL7 MLLP', peer: m.peer, receivedAt: m.receivedAt }));
      desk.onStatus(s => {
        listening = s.state === 'listening';
        mllpBtn.textContent = listening ? 'Stop listener' : 'Start listener';
        mllpState.textContent = s.state + (s.message ? ': ' + s.message : '') + (s.connections !== undefined ? ' · connections ' + s.connections : '') + (s.messages ? ' · messages ' + s.messages : '');
      });
      mllpBtn.addEventListener('click', async () => {
        if (listening) { await desk.stop(); return; }
        const port = Number($('#mllpPort').value);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) { mllpState.textContent = 'Port must be a whole number from 1024 to 65535.'; return; }
        const r = await desk.start({ host: mllpHost.value, port });
        if (!r.ok) mllpState.textContent = 'failed: ' + r.error;
      });
    }

    // ---------------------------------------------------------- HL7 over serial
    const WS = PM.webSerial;
    const sav = WS.availability(root);
    $('#serialAvail').append(sav.ok ? el('div.ok', { text: 'Web Serial is available.' }) : el('div.warn', { text: sav.reason }));
    const serBtn = $('#btnSerial'), serState = $('#serialState');
    let serial = null;
    if (!sav.ok) serBtn.disabled = true;
    serBtn.addEventListener('click', () => {
      if (serial) { serial.disconnect(); serial = null; serBtn.textContent = 'Connect a port…'; return; }
      const fmt = $('#serialFmt').value;
      serial = new WS.SerialSource({ serial: navigator.serial, baudRate: Number($('#serialBaud').value),
        dataBits: fmt === '7E1' ? 7 : 8, parity: fmt === '7E1' ? 'even' : 'none', stopBits: 1,
        onMessage: (text, framing) => onHL7(text, { route: 'HL7 serial (' + framing + ')' }),
        onStatus: s => {
          serState.textContent = s.state + ': ' + s.message + (s.bytes ? ' · bytes ' + s.bytes : '') + (s.messages ? ' · messages ' + s.messages : '');
          if (s.state === 'failed') { serial = null; serBtn.textContent = 'Connect a port…'; }
        } });
      serBtn.textContent = 'Disconnect';
      serial.connect(); // user gesture
    });

    // ---------------------------------------------------------- files
    const report = $('#devReport');
    function importText(text, name) {
      const r = o.importOne(text, name, { acceptLocation: acceptLocation(), box: report });
      const rep = r.report;
      addRow({ from: name, channel: rep.format || 'file', raw: String(text).slice(0, 160).replace(/\r/g, ' ⏎ '),
        synthetic: r.observations.some(x => x.provenance && x.provenance.replay),
        err: rep.errors && rep.errors.length ? rep.errors[0] : '', decoded: rep.accepted + ' values imported' + (rep.missing ? ', ' + rep.missing + ' missing' : '') });
    }
    $('#devFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) { report.textContent = 'File larger than 20 MB; not read.'; return; }
      const fr = new FileReader();
      fr.onload = () => importText(String(fr.result), f.name);
      fr.readAsText(f);
      e.target.value = '';
    });
    $('#btnExample').addEventListener('click', () => {
      const f = FILE_ROUTES[current] || FILE_ROUTES['hl7-file'];
      const text = f.example();
      $('#devPaste').value = text;
      importText(text, f.name);
    });
    $('#btnPaste').addEventListener('click', () => {
      const text = $('#devPaste').value;
      if (!text.trim()) { report.textContent = 'Nothing to import.'; return; }
      importText(text, 'pasted text');
    });
    $('#btnGoData').addEventListener('click', () => { const t = $('#tabs [data-tab="data"]'); if (t) t.click(); });

    // ---------------------------------------------------------- synthetic HL7 feed
    let feedTimers = [];
    const fBtn = $('#btnFeed'), fState = $('#feedState');
    function stopFeed(msg) { feedTimers.forEach(clearTimeout); feedTimers = []; fBtn.textContent = 'Start feed'; fState.textContent = msg || ''; }
    fBtn.addEventListener('click', () => {
      if (feedTimers.length) { stopFeed('Stopped.'); return; }
      const mine = bedValue(), other = mine === 'ICU^01^02' ? 'ICU^01^03' : 'ICU^01^02';
      const items = S.feed({ location: mine, otherLocation: other });
      let done = 0, dropped = 0;
      fBtn.textContent = 'Stop feed';
      fState.textContent = 'Playing 0 / ' + items.length + ' messages';
      for (const it of items) {
        feedTimers.push(setTimeout(() => {
          const r = onHL7(it.text, { route: 'synthetic feed', peer: 'SIM-CENTRAL' });
          if (r.rejected) dropped++;
          done++;
          fState.textContent = 'Playing ' + done + ' / ' + items.length + ' messages' + (dropped ? ', ' + dropped + ' for another bed dropped' : '');
          if (done === items.length) stopFeed('Finished: ' + items.length + ' messages, ' + dropped + ' dropped by the bed filter' + (bedOnly.checked ? '' : ' (bed filter is off, so messages for ' + other + ' were stored too)') + '.');
        }, it.at * 1000));
      }
    });

    renderClass();
    return { describe, onHL7 };
  }

  PM.devicesPanel = { init, describe, describeObs };
})(this);
