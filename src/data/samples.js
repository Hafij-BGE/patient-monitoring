/* Sample import files offered for download in the Data tab. All values are synthetic
 * (made up for the template, not from a person or a device). Each file is a starting
 * point: download it, replace or add rows in a spreadsheet or text editor, keep the
 * header, and import it again. tests/unit/samples.test.js checks that every sample
 * imports with no invalid value and no error. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).samples = factory();
})(this, function () {
  'use strict';

  const WIDE = [
    'timestamp,hr,spo2,sbp,dbp,rr,temp (°C),etco2,glucose (mg/dL),weight (kg)',
    '2026-01-15T08:00:00+03:00,72,98,118,76,14,36.8,38,95,70.5',
    '2026-01-15T08:05:00+03:00,74,97,,,15,36.9,39,,',
    '2026-01-15T08:10:00+03:00,76,97,121,78,15,NA,38,,',
    '2026-01-15T08:15:00+03:00,73,98,,,14,37.0,37,,',
    '2026-01-15T08:20:00+03:00,71,98,119,77,14,36.9,38,102,',
  ].join('\r\n') + '\r\n';

  const LONG = [
    'timestamp,parameter,value,unit',
    '2026-01-15T05:00:00Z,hr,72,bpm',
    '2026-01-15T05:00:00Z,spo2,98,%',
    '2026-01-15T05:00:00Z,sbp,118,mmHg',
    '2026-01-15T05:00:00Z,dbp,76,mmHg',
    '2026-01-15T05:00:00Z,rr,14,br/min',
    '2026-01-15T05:00:00Z,temp,98.4,°F',
    '2026-01-15T05:00:00Z,weight,155.4,lb',
    '2026-01-15T05:00:00Z,glucose,5.3,mmol/L',
    '2026-01-15T05:10:00Z,hr,75,bpm',
    '2026-01-15T05:10:00Z,sbp,16.1,kPa',
    '2026-01-15T05:10:00Z,dbp,10.3,kPa',
    '2026-01-15T05:10:00Z,spo2,N/A,%',
  ].join('\r\n') + '\r\n';

  const SEMICOLON = [
    'date;time;pulse rate;SpO2;Temperature (°C);Weight (kg)',
    '15.01.2026;08:00;72;98;36,8;70,5',
    '15.01.2026;20:00;78;97;37,1;',
    '16.01.2026;08:00;70;98;36,7;70,3',
    '16.01.2026;20:00;76;97;36,9;',
  ].join('\r\n') + '\r\n';

  const RECORDS = JSON.stringify({
    description: 'Synthetic wearable-style records for the VitalsLab importer. Edit freely; keep one object per time point.',
    records: [
      { time: '2026-01-15T08:00:00+03:00', heartRate: 72, spo2: 98, steps: 0 },
      { time: '2026-01-15T09:00:00+03:00', heartRate: 88, spo2: 97, steps: 1450 },
      { time: '2026-01-15T10:00:00+03:00', heartRate: 79, spo2: null, steps: 2210 },
      { time: '2026-01-15T11:00:00+03:00', heartRate: 74, temperature: { value: 98.6, unit: '°F' } },
      { time: '2026-01-15T12:00:00+03:00', systolic: 121, diastolic: 79, weight: { value: 70.4, unit: 'kg' } },
    ],
  }, null, 2) + '\n';

  const SAMPLES = [
    { file: 'vitals_wide_template.csv', type: 'text/csv', title: 'Wide table (CSV)',
      text: WIDE, desc: 'One row per time point, one column per value. Units in brackets. Empty cell = not measured then; NA = measured but missing.' },
    { file: 'vitals_long_template.csv', type: 'text/csv', title: 'Long table (CSV)',
      text: LONG, desc: 'One row per value: timestamp, parameter, value, unit. Mixes kPa, °F, lb and mmol/L to show the conversion.' },
    { file: 'vitals_semicolon_decimal_comma.csv', type: 'text/csv', title: 'Semicolon and decimal comma (CSV)',
      text: SEMICOLON, desc: 'European spreadsheet style: ";" between fields, "36,8" decimals, separate date (DD.MM.YYYY) and time columns.' },
    { file: 'wearable_records_template.json', type: 'application/json', title: 'Wearable-style records (JSON)',
      text: RECORDS, desc: '{"records": [...]} with one object per time point; a value can be a number, null, or {"value", "unit"}.' },
  ];

  return { SAMPLES };
});
