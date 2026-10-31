/**
 * Automated Verification Suite for GridSync 3-Phase Smart Microgrid & APFC Engine
 */
const assert = require('assert');
const { MicrogridEngine } = require('../js/engine/microgrid.js');

console.log('--- RUNNING GRIDSYNC MICROGRID & APFC TESTS ---');

const eng = new MicrogridEngine();

// 1. Test Heavy Lagging Scenario
const lag = eng.loadScenario('heavy_lagging');
assert.ok(lag.powerFactor < 0.72, `Expected low lagging PF < 0.72, got ${lag.powerFactor}`);
assert.strictEqual(lag.statusLevel, 'penalty');
console.log(`✓ Heavy Lagging Scenario: P=${lag.loadKw}kW, Q=${lag.QNetKvar}kVAR, PF=${lag.powerFactor}, I=${lag.lineCurrentAmp}A`);

// 2. Test Optimal Auto-APFC Compensation
const opt = eng.loadScenario('optimal_apfc');
assert.ok(opt.powerFactor >= 0.98, `Expected compensated PF >= 0.98, got ${opt.powerFactor}`);
assert.strictEqual(opt.statusLevel, 'optimal');
assert.ok(opt.lineCurrentAmp < lag.lineCurrentAmp * 0.72, 'Expected >28% reduction in line current after APFC');
console.log(`✓ Optimal APFC Compensation: Stages=${eng.activeCapStages}/6, PF=${opt.powerFactor}, I=${opt.lineCurrentAmp}A (↓${opt.currentReductionPct}%)`);

// 3. Test Over-Compensation Leading Scenario
const lead = eng.loadScenario('over_compensated');
assert.strictEqual(lead.isLeading, true, 'Expected leading power factor when over-compensated');
console.log(`✓ Over-Compensated Leading Scenario: Q_net=${lead.QNetKvar}kVAR, PF=${lead.powerFactor} Leading`);

console.log('--- ALL GRIDSYNC MICROGRID TESTS PASSED! ---');
