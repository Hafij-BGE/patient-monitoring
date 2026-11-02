# Change log

Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.

## v1.7.0 (2026-11-03)

### Glucose and Lessons tabs removed, 2026-11-03

- **Watch panel removed.** The "On this phone" panel (Health Connect and Bluetooth heart-rate sensor, Android app only) is no longer in the Data tab, and the "Data from a device" help now lists only export files and manual entry. The bridge code (`androidBridge.js`, `gatt.js`) and its unit tests remain.
- **Glucose tab removed.** Glucose is not part of a standard bedside monitor. The glucose model, the GLU tile, glucose alarms, the diabetes scenarios and the glucose settings in Controls remain. Meals, boluses and the 2–4 h projection are no longer in the page.
- **Lessons tab removed.** The page no longer loads the lessons or saves quiz scores (`pmsim.lessons.v1`). The source files stay in the tree.
- Checked: 155 unit tests pass; the page loads in the browser with the remaining tabs and no console errors.

### Import help and sample files, 2026-11-03

- **Data tab help:** how to import a file and what it may contain, with a table of every parameter, its accepted column names, units and range, read from the importer so it cannot drift (`src/ui/importHelp.js`).
- **Sample files:** four synthetic files to download, edit and import again: wide CSV, long CSV with unit conversions, semicolon CSV with decimal commas, JSON records (`src/data/samples.js`).
- **Data from a device:** the routes (Health Connect and Bluetooth heart-rate sensor in the Android app, export files, manual entry), with the note that the device routes are not tested with real hardware.
- **Fix:** the JSON import report showed "(undefined table)" and "Timestamp column: ?".
- **Tests:** `tests/unit/samples.test.js`; 155 unit tests pass; browser self-test 16 pass, 0 fail, 1 not run.

### Scenario details tab, 2026-11-03

- **New tab: Scenario details** (next to Controls; the scenario summary has a button that opens it). For the selected scenario it says what the condition is, what happens in the body, what the scenario shows on the monitor and what it cannot show, then lists the changed values, the teaching note and the references. Basic and sensor scenarios are marked as a vital-sign pattern or a technical problem, not a disease. It follows the toolbar list, the bedside list and Reset (`src/sim/scenarioDetails.js`, `src/ui/scenarioSummary.js`).
- **Text sources:** plain-language background from the cited references; specific numbers only where a reference's "Supports" line gives them.
- **Tests:** `tests/unit/scenarioDetails.test.js` checks coverage and that numbers quoted in the text match the scenario settings. 152 unit tests pass; browser self-test 16 pass, 0 fail, 1 not run.

### Disease and condition scenarios, 2026-11-03

- **Scenario groups.** Every scenario has a `group`; `SCENARIO_GROUPS` in `src/sim/params.js` lists 12 groups (single vital-sign changes, sensor and signal artefacts, heart rhythm, heart and circulation, bleeding, shock and sepsis, lungs and airway, brain and nerves, metabolic, endocrine and electrolytes, temperature, drugs and poisoning, anaesthesia and after surgery, pregnancy and birth, deterioration and cardiac arrest). The scenario list in the toolbar and in the bedside view shows them as headings (`src/ui/app.js`, `src/ui/bedside.js`).
- **46 new sourced scenarios**, from athlete bradycardia to post-ROSC (list in `TECHNICAL_REPORT.md` §3.12). That made 96 scenarios, 73 of them with sources (95, all with sources, after the review below). Each has a teaching note that says what the monitor cannot show.
- **References:** entries 96–135 in `REFERENCES.md`, each checked against its PubMed record; figures that are not in the abstract are marked "(full text)".
- **Bedside view:** a playback-speed list and an **Edit values** softkey. Edit values opens the normal Controls panel as a drawer between the notice and the softkeys (Esc closes it). On screens 1200 px and wider the monitor moves aside; on narrower screens the drawer covers the right side. The softkeys now wrap to a second row instead of scrolling sideways (`src/ui/bedside.js`, `css/bedside.css`).
- **Tests:** a unit test checks that every scenario is in one listed group, no group is empty and no id is repeated. 146 unit tests pass.

### Scenario sources and scenario summary, 2026-11-03

- **Every scenario now cites literature.** The 23 simple scenarios that had no sources now cite entries 136–148 of `REFERENCES.md` (and earlier entries where they apply). Each was checked against its PubMed record; each "Supports" line says what the source is cited for.
- **Scenario review.** All scenarios were re-checked against their sources. Notes that claimed more than the source says were reworded. Changed values: ATLS class IV heart rate 145 (inside the 10th-edition range), neuromuscular failure breath impedance 0.6 Ω (so breaths stay above the apnea detector), CO₂ rebreathing EtCO₂ set point 46 mmHg. "Compensatory hyperventilation (low EtCO₂)" was removed: it had the same values as the DKA-type scenario without the glucose. There are now 95 scenarios.
- **Scenario summary** below the controls (`src/ui/scenarioSummary.js`): name and group, teaching note, a table of the changed values next to the defaults, and each cited reference with its Supports line and DOI link. It follows the toolbar list, the bedside list and Reset, and shows a notice when the settings are edited by hand. The long note message on load was replaced by a pointer to the summary.
- **References in the page:** `tools/gen-references.js` builds `src/sim/references.js` from `REFERENCES.md`; a unit test fails if the generated file is out of date.
- **NIBP:** when the cuff does not occlude, it re-inflates in steps of 50 mmHg up to 280 mmHg, so a systolic pressure of 220–230 mmHg now reads on the first measurement (`src/sim/nibp.js`).
- **Tests:** 148 unit tests pass; browser self-test 16 pass, 0 fail, 1 not run.

## v1.6.0 (2026-11-02)

### VitalsLab and community scenarios, 2026-10-29

- **Renamed PM-SIM to VitalsLab** in the page, the docs, the Linux desktop app, the Windows build and the Android app label. Release files are now `VitalsLab-<version>-…`; exported files start with `vitalslab-`. The Android package id (`edu.deu.pmsim`) and the `localStorage` keys (`pmsim.*`) stay the same, so installs update in place and saved settings are kept.
- **Author and repository** in the page header ("by Md. Hafijur Rahman · github.com/Hafij-BGE/patient-monitoring") and the footer.
- **Community scenarios.** *Share as community scenario…* in Controls turns the current settings into a submission, shows the exact JSON and opens a prefilled GitHub issue (`.github/ISSUE_TEMPLATE/scenario.yml`). The workflow `.github/workflows/community-scenarios.yml` checks it; when a maintainer with write access adds the `approved` label it appends the entry to `community/scenarios.json`, regenerates `community/scenarios.js`, runs the tests, commits and redeploys the website. Approved entries appear for everyone under "Community scenarios" in the scenario list. Checks: scenario parameters only, no clamping, no baseline values, no duplicate settings or names, plain text of limited length. Not checked: clinical plausibility (`src/core/community.js`, `src/ui/sharePanel.js`, `tools/community-scenario.js`).
- **Android:** links to this repository on github.com open in the system browser; all other external links stay blocked. `community/` is bundled with the web assets, also in the Linux and Windows builds and on GitHub Pages.
- **Tests:** `tests/unit/community.test.js` (12 tests); 145 unit tests pass. The GitHub workflow has not run on GitHub yet.

## v1.5.0 (2026-10-29)

### Shock index, 2026-10-29

- **Removed Age × SI** from the patient banner, `src/core/profile.js` and the docs. It was studied only for 48-h mortality in injured patients over 55 (Zarzaur 2008) and has no validated cut-off, so the number could not be judged. The shock index (healthy adult range 0.5–0.7, highlighted above 0.7) stays.

### Waveform audit, 2026-10-29 (`SIMULATION_AUDIT.md` §9a)

- **Arterial line:** changing HR, SBP or DBP no longer makes the pressure jump. Beats already ejected keep the gain of their own fit (`src/sim/pulse.js`). Before: about 75 mmHg within 24 ms at HR 72 → 40 bpm; after: no step larger than in steady state.
- **Arterial line:** "optimum" display scale with 3 mmHg hysteresis instead of a fixed 0–200 mmHg range, so the pulse and the dicrotic notch are readable (`src/ui/waveforms.js`).
- **Pulse arrival time:** new parameter `pat_ms` (100–400 ms, default 200 ms) for the delay from the R peak to the arterial and pleth pulse foot (`src/sim/params.js`, `src/sim/engine.js`).
- **Capnography:** EtCO₂ is read on a 100 ms moving average, which removes a +0.3–0.4 mmHg noise bias (`src/sim/detectors.js`).
- **NIBP:** stopping a running measurement is recorded as "cancelled by user". It no longer raises the NIBP-failed alarm or replaces the last valid reading (`src/sim/nibp.js`, `src/ui/panels.js`, `src/ui/app.js`).
- **Layout:** on a 375 px phone screen no tab is wider than the screen; the scenario list, the alarm limit table and the trend source badges were fixed in `css/monitor.css`.
- **Tests:** `tests/unit/channels.test.js` (14 tests) adds fixtures for every waveform channel and the renderer. 130 unit tests pass.
- **NIBP cuff strip:** between measurements the strip shows the last cycle with mmHg and time axes, SYS/MAP/DIA markers, the oscillation magnified in its own band with a mmHg scale bar, and the reading set against the arterial line and the set values. During a measurement the live sweep has labelled ticks. The strip is taller, also in the bedside view (`src/sim/nibp.js`, `src/ui/trends.js`, `src/ui/app.js`, `css/monitor.css`, `css/bedside.css`). `tests/unit/cuffcycle.test.js` (3 tests); 133 unit tests pass.

### Simulation audit, 2026-10-29 (`SIMULATION_AUDIT.md` §1–§18)

Model and documentation fixes across ECG, arterial pressure, NIBP, pulse oximetry, temperature, capnography, glucose, scenarios, lessons and the patient profile.
