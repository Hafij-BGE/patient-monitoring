# Test fixtures

All files here are **synthetic**. They were written by hand to exercise the importer and contain no real
patient or user data. Expected results for each file are checked in `tests/unit/data.test.js`.

| File | Purpose |
|---|---|
| `vitals_wide_valid.csv` | Wide table, header synonyms (`heart_rate`, `SpO2 (%)`, `resp rate`), units in brackets, empty cells (NIBP every 10 min), `+03:00` offsets |
| `vitals_long_valid.csv` | Long table (`timestamp,parameter,value,unit`) with kPa, °F and lb that must be converted |
| `vitals_semicolon_decimal_comma.csv` | `;` delimiter, decimal comma, separate `date`/`time` columns, `DD.MM.YYYY` dates |
| `vitals_units_fahrenheit_lb_kpa.csv` | Units encoded in column names (`temp_f`, `weight_lb`, `height_in`, `SBP (kPa)`), naive timestamps |
| `vitals_missing_duplicates.csv` | Missing tokens (`NA`, `N/A`, `--`, `null`), an exact duplicate row and a conflicting duplicate |
| `vitals_timezones.csv` | Same instant written as `Z`, `+03:00`, naive, epoch seconds, epoch ms and `DD.MM.YYYY` |
| `vitals_malformed.csv` | Non-numeric value, impossible date, unparseable timestamp, out-of-range HR, extra field, unterminated quote |
| `vitals_records.json` | `{records:[...]}` wide JSON with nested `{value, unit}` objects and `null` |
| `vitals_long.json` | Array of long records including an unsupported parameter (glucose) |
| `vitals_malformed.json` | Truncated JSON (fatal error, nothing imported) |
| `gatt/*.hex` | BLE characteristic payloads for the packet-replay demo (see `src/devices/gatt.js`) |

Hospital-format fixtures, generated once from `src/devices/samples.js` (fixed time 2026-10-28 09:00 UTC) and checked
in `tests/unit/hospital.test.js`. Every message is marked as test data (HL7 processing ID `T`, FHIR `HTEST`,
SDC `MetricQuality Mode="Demo"`), so the app shows the values as SYNTHETIC.

| File | Purpose |
|---|---|
| `hl7_oru_pcd01.hl7` | Two HL7 v2.6 ORU^R01 messages in IHE PCD-01 style (CRLF line ends): MDC-coded OBX, a dummy PID that must not be stored, kPa and °F values, an empty RR value, invasive pressure and EtCO₂ |
| `fhir_vitals_bundle.json` | FHIR R4 Bundle: LOINC + MDC codes, a blood-pressure panel with components, a `dataAbsentReason`, a Device resource |
| `sdc_mdib.xml` | IEEE 11073-10207 MDIB: numeric metric descriptors and states, one `Qst` (questionable) value, one metric without a value |
