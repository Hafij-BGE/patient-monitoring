/* "On this phone" section of the Data tab. Only shown inside the Android app,
 * where window.PMAndroid exists. Reads Health Connect records and live BLE Heart
 * Rate Service notifications after the user starts each one, stores them as
 * source "device". File exports go through the native save dialog (see
 * PM.dom.download). Nothing is uploaded. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt } = PM.dom;

  /** opts: { store, onChange() } */
  function init(opts) {
    const A = root.PMAndroid, box = $('#androidPanel');
    if (!A || !box) return null;
    const B = PM.androidBridge;
    let info = {};
    try { info = JSON.parse(A.info()) || {}; } catch (e) { info = {}; }

    const hcStatus = el('span', { text: info.healthConnect || 'unknown' });
    const hcMsg = el('p.msgs', { 'aria-live': 'polite' });
    const hcReport = el('div');
    const days = el('select', { 'aria-label': 'Days to read' }, ...[1, 7, 30].map(d => el('option', { value: String(d), text: d + (d === 1 ? ' day' : ' days') })));
    days.value = '7';

    const bleState = el('span', { text: info.ble || 'unknown' });
    const bleDevices = el('ul.ble-devices');
    const bleLast = el('p.t-sub');
    const seenDevices = new Map();

    box.append(
      el('h3', { text: 'On this phone' }),
      el('p.hint', { text: 'Readings from your own watch or sensor. They are stored in this app only, shown with source "device", and never sent anywhere. ' +
        'Consumer wearable readings are not validated for clinical use.' }),
      el('div.split', null,
        el('div', null,
          el('h4', { text: 'Health Connect' }),
          el('p.hint', null, 'Status: ', hcStatus, '. Watch apps (for example a vendor health app) can write heart rate, SpO₂, blood pressure, temperature and steps to Health Connect. This app only reads them, after you allow it.'),
          el('div.row.wrap', null,
            el('button', { type: 'button', text: 'Allow reading…', onclick: () => A.hcRequestPermissions() }),
            el('label.inline', null, 'Last ', days),
            el('button.primary', { type: 'button', text: 'Read records', onclick: () => { hcMsg.textContent = 'Reading…'; A.hcRead(Number(days.value)); } }),
            el('button', { type: 'button', text: 'Install / update Health Connect', onclick: () => A.hcOpenInstall() })),
          hcMsg, hcReport),
        el('div', null,
          el('h4', { text: 'Bluetooth heart-rate sensor' }),
          el('p.hint', null, 'State: ', bleState, '. Works with sensors that use the standard Bluetooth Heart Rate Service (0x180D), for example chest straps or a watch in heart-rate broadcast mode.'),
          el('div.row.wrap', null,
            el('button', { type: 'button', text: 'Scan', onclick: () => { seenDevices.clear(); bleDevices.textContent = ''; A.bleScan(); } }),
            el('button', { type: 'button', text: 'Stop scan', onclick: () => A.bleStop() }),
            el('button', { type: 'button', text: 'Disconnect', onclick: () => A.bleDisconnect() })),
          bleDevices, bleLast)));
    box.hidden = false;

    function store(list) { if (list.length) { opts.store.addMany(list); if (opts.onChange) opts.onChange(); } }

    function onHcRecords(d) {
      const r = B.healthConnectToObservations(d);
      store(r.observations);
      const counts = {};
      for (const o of r.observations) counts[o.param] = (counts[o.param] || 0) + 1;
      hcMsg.textContent = r.observations.length + (r.observations.length === 1 ? ' value' : ' values') + ' stored from the last ' + d.days + ' days' +
        (Object.keys(counts).length ? ' (' + Object.entries(counts).map(([p, n]) => p + ' ' + n).join(', ') + ')' : '') + '.';
      hcReport.textContent = '';
      const problems = r.errors.map(e => e.type + ': ' + e.error)
        .concat(r.rejected.map(x => x.param + ' ' + x.value + ' ' + (x.unit || '') + ': ' + x.reason));
      if (problems.length) hcReport.append(el('details.report', null, el('summary', { text: problems.length + ' notes' }), el('ul', null, ...problems.slice(0, 50).map(t => el('li', { text: t })))));
    }

    function onBleDevice(d) {
      if (seenDevices.has(d.address)) return;
      seenDevices.set(d.address, d);
      bleDevices.append(el('li', null, el('button', { type: 'button', text: 'Connect', onclick: () => A.bleConnect(d.address) }),
        el('span', { text: ' ' + (d.name || 'unnamed') + ' · ' + d.address + ' · ' + d.rssi + ' dBm' })));
    }

    function onBleHr(d) {
      let r;
      try { r = B.bleHeartRateToObservations(d); } catch (e) { bleLast.textContent = 'Malformed packet ignored: ' + e.message; return; }
      store(r.observations);
      const p = r.parsed;
      bleLast.textContent = (d.device || 'sensor') + ': HR ' + (p.hr || '--') + ' bpm · contact ' + p.contact +
        (p.rrIntervals.length ? ' · RR ' + p.rrIntervals.map(x => fmt(x * 1000)).join(', ') + ' ms' : '');
    }

    root.addEventListener('pmandroid', ev => {
      const d = ev.detail || {};
      switch (d.type) {
        case 'hc-status': hcStatus.textContent = d.status; break;
        case 'hc-permissions':
          hcMsg.textContent = 'Allowed: ' + ((d.granted || []).join(', ') || 'none') + '.' + (d.denied && d.denied.length ? ' Not allowed: ' + d.denied.join(', ') + '.' : '') + (d.error ? ' ' + d.error : '');
          break;
        case 'hc-records': onHcRecords(d); break;
        case 'ble-state': bleState.textContent = d.state + (d.detail ? ' (' + d.detail + ')' : ''); break;
        case 'ble-device': onBleDevice(d); break;
        case 'ble-info': bleLast.textContent = 'Sensor location: ' + (PM.gatt.BODY_SENSOR_LOCATION[d.bodySensorLocation] || 'unknown'); break;
        case 'ble-hr': onBleHr(d); break;
        case 'save': hcMsg.textContent = d.ok ? 'Saved ' + d.name + '.' : 'Not saved: ' + (d.error || d.name); break;
        case 'download-unsupported': hcMsg.textContent = 'Use the export buttons; links that download files are not supported in the app.'; break;
      }
    });
    return { info };
  }

  root.PM.androidPanel = { init };
})(this);
