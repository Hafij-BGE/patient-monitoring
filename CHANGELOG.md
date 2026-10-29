# Change log

Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.

## Unreleased

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
