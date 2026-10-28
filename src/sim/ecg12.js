/* Derived 12-lead ECG from a single moving cardiac dipole.
 * Each of the five McSharry events (P, Q, R, S, T) of a beat is given a fixed
 * spatial direction d_i in Frank XYZ coordinates (X towards the patient's left,
 * Y towards the feet, Z towards the back). The event's scalar contribution z_i(t)
 * from ecg.js is placed along d_i and scaled by 1/(h_II · d_i), so the dipole
 * projected on lead II gives back exactly the single-lead monitor ECG:
 *   VCG(t) = Σ_i g·z_i(t)·d_i / (h_II · d_i)
 * The eight independent leads come from the Dower transform s = D·VCG
 * (Dower, Machado & Osborne, Clin Cardiol 1980;3:87–95; matrix as tabulated by
 * Edenbrandt & Pahlm, J Electrocardiol 1988;21:361–7) and the four remaining limb
 * leads from Einthoven's and Goldberger's relations:
 *   III = II − I   aVR = −(I + II)/2   aVL = I − II/2   aVF = II − I/2
 * The event directions are illustrative teaching values chosen to give a normal
 * adult pattern (frontal QRS axis about +50°, rS in V1, transition V3–V4, qR in
 * V5–V6, upright T in I, II, V2–V6) and a wide-complex ventricular beat with a
 * left-bundle-branch-block-like shape and inferior axis (outflow-tract type).
 * One dipole cannot reproduce every real ECG feature (for example a biphasic P
 * in V1, or regional ST changes). Not a diagnostic ECG. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).ecg12 = factory();
})(this, function () {
  'use strict';

  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  // Dower matrix rows: lead = [cX, cY, cZ] · [X, Y, Z].
  const DOWER = {
    I: [0.632, -0.235, 0.059], II: [0.235, 1.066, -0.132],
    V1: [-0.515, 0.157, -0.917], V2: [0.044, 0.164, -1.387], V3: [0.882, 0.098, -1.277],
    V4: [1.213, 0.127, -0.601], V5: [1.125, 0.127, -0.086], V6: [0.831, 0.076, 0.230],
  };
  const H_II = DOWER.II;

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = v => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // Spatial direction of each event (P, Q, R, S, T), the way the dipole points
  // while that event is positive in lead II (the sign of h_II · d must match the
  // sign of the event amplitude in ecg.js; tests check this).
  const DIRS = {
    // Supraventricular beat: P left-inferior; septal Q rightward-anterior;
    // main R left-inferior-posterior; terminal S rightward-superior-posterior;
    // T left-inferior-anterior.
    normal: [[0.85, 0.5, -0.1], [-0.5, -0.6, -0.4], [0.8, 0.5, 0.3], [-0.6, -0.2, 0.8], [0.85, 0.45, -0.3]],
    // Ventricular beat (PVC, VT): broad R leftward-inferior-posterior (V1 negative,
    // inferior axis), small Q and T opposite to it (discordant T), S rightward-superior.
    ventricular: [[0.85, 0.5, -0.1], [-0.4, -0.8, -0.45], [0.4, 0.8, 0.45], [-0.3, -0.5, 0.4], [-0.4, -0.8, -0.45]],
  };
  const BASIS = {};
  for (const k of Object.keys(DIRS)) BASIS[k] = DIRS[k].map(d => { const u = unit(d), s = dot(H_II, u); return u.map(c => c / s); });

  // Fibrillatory activity: AF f-waves along an atrial direction that is large in
  // V1; VF along the ventricular axis plus a component that lead II cannot see
  // (h_II · n = 0), so the chest leads differ from lead II.
  const F_AF = (() => { const u = unit([0.2, 0.5, -0.8]), s = dot(H_II, u); return u.map(c => c / s); })();
  const N_II = unit(cross(H_II, [0, 0, 1]));

  /** The 12 leads (mV) for one dipole sample v = [X, Y, Z]; writes into out if given. */
  function leads(v, out) {
    out = out || new Array(12);
    const I = dot(DOWER.I, v), II = dot(DOWER.II, v);
    out[0] = I; out[1] = II; out[2] = II - I;
    out[3] = -(I + II) / 2; out[4] = I - II / 2; out[5] = II - I / 2;
    out[6] = dot(DOWER.V1, v); out[7] = dot(DOWER.V2, v); out[8] = dot(DOWER.V3, v);
    out[9] = dot(DOWER.V4, v); out[10] = dot(DOWER.V5, v); out[11] = dot(DOWER.V6, v);
    return out;
  }

  /** Frontal-plane axis (degrees, −180..180) from net amplitudes in leads I and aVF. */
  const frontalAxis = (netI, netAVF) => Math.atan2(2 * netAVF / Math.sqrt(3), netI) * 180 / Math.PI;

  return { LEADS, DOWER, DIRS, BASIS, F_AF, N_II, leads, frontalAxis, dot };
});
