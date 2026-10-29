/* Glucose–insulin teaching model (TECHNICAL_REPORT.md section 3.13). Pure, no DOM.
 * Time unit is the minute. Numbers in [n] are entries in REFERENCES.md.
 *
 *   Glucose (Bergman minimal model [45]):
 *     dG/dt = −(SG + X)·G + SG·Gb + Ra                 G mg/dL
 *     SG = 0.026 [46] (no diabetes, type 2); type 1: SG = GEZI + SI·Ib, the form of [47]
 *     dX/dt = −p2·X + p2·SI·(I − Ib)                    X min⁻¹ (insulin action, Kanderian form [47])
 *   Meal absorption (Hovorka 2004 [48], two-compartment gut):
 *     dD1/dt = −D1/tG   dD2/dt = (D1 − D2)/tG   Ra = D2/tG · MW/VG      a meal adds AG·carbs to D1
 *   Subcutaneous insulin (Hovorka 2004 [48]):
 *     dS1/dt = u − S1/tI   dS2/dt = (S1 − S2)/tI   dI/dt = S2/(tI·VI) − ke·I + secretion
 *   Endogenous secretion (no diabetes, type 2 only; illustrative, see SECRETION):
 *     secretion = ke·Ifast + σ·max(0, G − Gb)
 *
 * The patient starts in steady state at the set fasting glucose Gb with insulin Ib.
 * Only I − Ib acts on glucose, so the fasting insulin value sets the level shown,
 * not the glucose response. Output is a model projection, not a clinical prediction. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).glucose = factory();
})(this, function () {
  'use strict';

  const MW = 180.16;            // mg/mmol, molar mass of glucose (unit arithmetic)
  const MGDL_PER_MMOLL = MW / 10; // 1 mmol/L = 18.016 mg/dL
  const toMmol = mgdl => mgdl / MGDL_PER_MMOLL;
  const toMgdl = mmol => mmol * MGDL_PER_MMOLL;

  /** Population parameters with their sources (see REFERENCES.md). */
  const POP = {
    VG: 1.6,     // dL/kg, glucose distribution volume 0.16 L/kg [48]
    VI: 0.12,    // L/kg, insulin distribution volume [48]
    ke: 0.138,   // min⁻¹, plasma insulin elimination [48]
    tI: 55,      // min, time-to-maximum of subcutaneous insulin absorption [48]
    AG: 0.8,     // carbohydrate bioavailability [48]
    tG: 40,      // min, time-to-maximum of meal glucose appearance [48]
    p2: 0.0113,  // min⁻¹, insulin action rate; mean of the 10 subject values in Table 1 of [47] (mean calculated here)
    SG: 0.026,   // min⁻¹, glucose effectiveness of normal subjects, regular FSIGT [46]
  };

  /** Insulin sensitivity per diabetes status, min⁻¹ per µU/mL. */
  const TYPES = {
    none:  { label: 'no diabetes', SI: 4.1e-4, secretion: 1,
      note: 'SI of normal subjects, 4.1 × 10⁻⁴ [49].' },
    type2: { label: 'type 2 diabetes', SI: 0.61e-4, secretion: 0.5,
      note: 'SI of type 2 subjects, 0.61 × 10⁻⁴ (about 85 % lower) [49]. Secretion gain halved (illustrative; reduced β-cell compensation [50]).' },
    type1: { label: 'type 1 diabetes', SI: 4.4e-4, GEZI: 2.5e-3, secretion: 0,
      note: 'No endogenous secretion (structural choice, as in [47]); insulin comes only from the basal rate and boluses. SI 4.4 × 10⁻⁴ and glucose effectiveness at zero insulin (GEZI) 2.5 × 10⁻³ min⁻¹ are the means of the 10 subjects in Table 1 of [47] (calculated here). Without insulin, glucose falls back only slowly.' },
  };

  /** Secretion gain σ above fasting glucose, µU/mL per min per mg/dL. Illustrative:
   *  chosen so the "no diabetes" model returns close to fasting within about 3 h
   *  after a 50 g meal. It is not a fitted or published value. */
  const SECRETION = 0.1;

  /** Basal rate U/h → mU/kg/min. */
  const basalRate = (uh, kg) => uh * 1000 / 60 / kg;

  class GlucoseModel {
    constructor(p) { this.reset(p); }

    /** Start in steady state at fasting glucose with the current basal rate. */
    reset(p) {
      this.setParams(p);
      const k = this.k;
      const S = k.u * POP.tI;                        // S1 = S2 = u·tI at steady state
      const iExo = S / (POP.tI * POP.VI) / POP.ke;   // µU/mL from the basal rate
      this.Ib = iExo + (k.type.secretion > 0 ? k.Ifast : 0);
      // Type 1: [47] writes dG/dt = −(GEZI + SI·I)·G + EGP + Ra with GEZI and EGP at zero insulin.
      // With X = SI·(I − Ib) this is the same equation with SG = GEZI + SI·Ib and EGP = SG·Gb.
      k.SG = k.type.GEZI !== undefined ? k.type.GEZI + k.SI * this.Ib : POP.SG;
      this.s = { G: k.Gb, X: 0, I: this.Ib, D1: 0, D2: 0, S1: S, S2: S };
      this.t = 0;
    }

    /** Updates rates and patient constants; keeps the state (a reset is the caller's choice). */
    setParams(p) {
      const type = TYPES[p.diabetes] || TYPES.none;
      this.k = { type, SG: this.k ? this.k.SG : POP.SG, kg: p.weight_kg, Gb: p.fasting_glucose, Ifast: p.fasting_insulin,
        SI: type.SI, sigma: SECRETION * type.secretion, u: basalRate(p.basal_insulin, p.weight_kg) };
    }

    meal(grams) { this.s.D1 += POP.AG * grams * 1000 / MW / this.k.kg; }  // mmol/kg
    bolus(units) { this.s.S1 += units * 1000 / this.k.kg; }               // mU/kg

    /** Glucose appearance from the gut, mg/dL/min. */
    ra(s) { return s.D2 / POP.tG * MW / POP.VG; }

    deriv(s) {
      const k = this.k;
      const secr = k.type.secretion > 0 ? POP.ke * k.Ifast + k.sigma * Math.max(0, s.G - k.Gb) : 0;
      const uptake = Math.max(0, k.SG + s.X); // keeps the system bounded (see section 3.13)
      return {
        G: -uptake * s.G + k.SG * k.Gb + this.ra(s),
        X: -POP.p2 * s.X + POP.p2 * k.SI * (s.I - this.Ib),
        I: s.S2 / (POP.tI * POP.VI) - POP.ke * s.I + secr,
        D1: -s.D1 / POP.tG,
        D2: (s.D1 - s.D2) / POP.tG,
        S1: k.u - s.S1 / POP.tI,
        S2: (s.S1 - s.S2) / POP.tI,
      };
    }

    /** Advances by `min` minutes (forward Euler, steps of at most 0.5 min). */
    advance(min) {
      let left = min;
      while (left > 1e-9) {
        const h = Math.min(0.5, left), d = this.deriv(this.s), s = this.s;
        for (const key in d) s[key] += h * d[key];
        s.G = Math.min(1000, Math.max(1, s.G));
        s.I = Math.max(0, s.I);
        this.t += h; left -= h;
      }
    }

    values() { return { glucose: this.s.G, insulin: this.s.I, ra: this.ra(this.s), action: this.s.X }; }

    clone() {
      const c = Object.create(GlucoseModel.prototype);
      c.k = Object.assign({}, this.k); c.s = Object.assign({}, this.s); c.Ib = this.Ib; c.t = this.t;
      return c;
    }

    /** Runs a copy forward `horizon` minutes with planned events [{at (min from now), carbs (g), units (U)}].
     *  Returns the curve and the first time each threshold [51, 52] is crossed. */
    forecast(horizon, events) {
      const m = this.clone(), ev = (events || []).slice().sort((a, b) => a.at - b.at);
      const t = [0], G = [m.s.G], I = [m.s.I];
      const cross = { below70: null, below54: null, above180: null, above250: null };
      const check = (tm, g) => {
        if (cross.below70 === null && g < 70) cross.below70 = tm;
        if (cross.below54 === null && g < 54) cross.below54 = tm;
        if (cross.above180 === null && g > 180) cross.above180 = tm;
        if (cross.above250 === null && g > 250) cross.above250 = tm;
      };
      let inRange = 0, i = 0;
      for (let tm = 0; tm < horizon; tm += 1) {
        while (i < ev.length && ev[i].at <= tm) { if (ev[i].carbs) m.meal(ev[i].carbs); if (ev[i].units) m.bolus(ev[i].units); i++; }
        m.advance(1);
        t.push(tm + 1); G.push(m.s.G); I.push(m.s.I);
        check(tm + 1, m.s.G);
        if (m.s.G >= 70 && m.s.G <= 180) inRange++;
      }
      const minG = Math.min(...G), maxG = Math.max(...G);
      return { t, G, I, cross, minG, maxG, tir: 100 * inRange / horizon };
    }
  }

  const NOTICE = 'Model projection, not a clinical prediction. Population parameters; no individual is fitted.';

  return { GlucoseModel, POP, TYPES, SECRETION, MGDL_PER_MMOLL, toMmol, toMgdl, basalRate, NOTICE };
});
