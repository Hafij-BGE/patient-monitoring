'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../../src/core/profile.js');

test('predicted body weight follows the ARDS Network formula and needs sex', () => {
  assert.equal(profile.predictedBodyWeight(180, 'male').toFixed(2), '75.12');
  assert.equal(profile.predictedBodyWeight(165, 'female').toFixed(2), '56.97');
  assert.equal(profile.predictedBodyWeight(152.4, 'male'), 50);
  assert.equal(profile.predictedBodyWeight(172, 'unspecified'), null);
  assert.equal(profile.predictedBodyWeight(NaN, 'male'), null);
});

test('weight-based volumes and tidal volume', () => {
  assert.equal(profile.tidalVolume(profile.predictedBodyWeight(180, 'male'), 6).toFixed(0), '451');
  assert.equal(profile.tidalVolume(null, 6), null);
  assert.equal(profile.weightDose(70, 30), 2100);   // sepsis crystalloid bolus
  assert.equal(profile.weightDose(70, 0.5), 35);    // urine output threshold, mL/h
  assert.equal(profile.weightDose(0, 30), null);
});

test('age-predicted maximal heart rate (Tanaka)', () => {
  assert.equal(profile.hrMaxTanaka(40), 180);
  assert.equal(profile.hrMaxTanaka(70), 159);
  assert.equal(profile.hrMaxTanaka(undefined), null);
});

test('shock index and age x shock index', () => {
  assert.equal(profile.shockIndex(72, 120), 0.6);
  assert.equal(profile.ageShockIndex(40, 72, 120), 24);
  assert.equal(profile.shockIndex(72, 0), null);
  assert.equal(profile.shockIndex(null, 120), null);
  assert.equal(profile.ageShockIndex(NaN, 72, 120), null);
  assert.deepEqual({ ...profile.SI_NORMAL }, { lo: 0.5, hi: 0.7 });
});

test('age-typical blood pressure interpolates the NHANES group means', () => {
  assert.deepEqual(profile.bpForAge(20, 'male'), { sbp: 119, dbp: 70 });       // below first centre: held flat
  assert.deepEqual(profile.bpForAge(28.5, 'unspecified'), { sbp: 115, dbp: 69 });
  assert.deepEqual(profile.bpForAge(49.5, 'female'), { sbp: 122, dbp: 74 });
  assert.deepEqual(profile.bpForAge(60, 'male'), { sbp: 129, dbp: 73 });        // between centres
  assert.deepEqual(profile.bpForAge(90, 'female'), { sbp: 139, dbp: 68 });      // above last centre: held flat
  assert.equal(profile.bpForAge(17, 'male'), null);
  // SBP rises with age while DBP falls after middle age (Franklin et al. 1997).
  for (const sex of ['male', 'female', 'unspecified']) {
    const a = profile.bpForAge(30, sex), b = profile.bpForAge(50, sex), c = profile.bpForAge(75, sex);
    assert.ok(a.sbp < b.sbp && b.sbp < c.sbp, sex + ' SBP rises');
    assert.ok(c.dbp < b.dbp, sex + ' DBP falls after 50');
    assert.ok(c.sbp - c.dbp > a.sbp - a.dbp, sex + ' pulse pressure widens');
  }
});
