/**
 * GridSync — 3-Phase Industrial Smart Microgrid & Power Factor (cos φ) Correction Engine
 * Models 400V 50Hz 3-Phase busbar, inductive industrial loads, Solar PV inverter,
 * 6-stage Automatic Power Factor Correction (APFC) capacitor bank, and utility penalty metrics.
 */

const INDUSTRIAL_LOAD_CATALOG = [
  { id: 'ind_motor_1', name: 'Main Extruder Induction Motor (75 kW)', kw: 75, pfLag: 0.68, defaultOn: true },
  { id: 'ind_motor_2', name: 'Hydraulic Stamping Press Pump (45 kW)', kw: 45, pfLag: 0.62, defaultOn: true },
  { id: 'arc_welder',  name: 'Robotic Spot Welder Bank (35 kW)',       kw: 35, pfLag: 0.58, defaultOn: false },
  { id: 'hvac_chiller',name: 'Centrifugal HVAC Chiller (30 kW)',       kw: 30, pfLag: 0.78, defaultOn: true },
  { id: 'lighting_res',name: 'LED & Resistive Oven Bank (20 kW)',      kw: 20, pfLag: 0.98, defaultOn: false }
];

class MicrogridEngine {
  constructor() {
    this.nominalVoltageLL = 400; // 400V Line-to-Line 3-Phase
    this.frequencyHz = 50;
    this.lineResistanceOhm = 0.045; // Feeder cable resistance per phase

    // Active states of industrial loads
    this.loadStates = {};
    INDUSTRIAL_LOAD_CATALOG.forEach(l => {
      this.loadStates[l.id] = l.defaultOn;
    });

    // Solar PV Active Power injection (0 to 120 kW)
    this.solarIrradiancePct = 35; // % of 100 kW peak array
    this.solarPeakKw = 100;

    // 6-Stage Detuned Capacitor Bank (6 x 30 kVAR = 180 kVAR max)
    this.capStageKvar = 30;
    this.maxCapStages = 6;
    this.activeCapStages = 0; // Initially 0 stages (uncompensated lagging PF!)

    // APFC Controller Mode
    this.autoApfcEnabled = false;
    this.targetPowerFactor = 0.98;
    this.apfcCooldownMs = 0;

    // Computed electrical telemetry
    this.telemetry = {};
    this.computeTelemetry();
  }

  setLoadState(loadId, isOn) {
    if (loadId in this.loadStates) {
      this.loadStates[loadId] = Boolean(isOn);
      this.computeTelemetry();
    }
  }

  setSolarIrradiance(pct) {
    this.solarIrradiancePct = Math.max(0, Math.min(100, Number(pct)));
    this.computeTelemetry();
  }

  setCapStages(stages) {
    this.activeCapStages = Math.max(0, Math.min(this.maxCapStages, Math.round(Number(stages))));
    this.computeTelemetry();
  }

  setAutoApfc(enabled) {
    this.autoApfcEnabled = Boolean(enabled);
    if (this.autoApfcEnabled) {
      this.runAutoApfcInstant();
    }
    this.computeTelemetry();
  }

  /**
   * Immediately calculate optimal number of 25 kVAR capacitor steps
   * to bring cos(phi) >= 0.98 without over-compensating into heavy leading PF
   */
  runAutoApfcInstant() {
    let totalLoadKw = 0;
    let totalLoadKvar = 0;
    INDUSTRIAL_LOAD_CATALOG.forEach(l => {
      if (this.loadStates[l.id]) {
        const phi = Math.acos(l.pfLag);
        const q = l.kw * Math.tan(phi);
        totalLoadKw += l.kw;
        totalLoadKvar += q;
      }
    });

    if (totalLoadKw <= 1) {
      this.activeCapStages = 0;
      return;
    }

    // Target Q_net for targetPF = 0.985 lagging
    const targetPhi = Math.acos(0.985);
    const desiredQNet = totalLoadKw * Math.tan(targetPhi);
    const neededQCap = Math.max(0, totalLoadKvar - desiredQNet);
    const bestStages = Math.min(this.maxCapStages, Math.round(neededQCap / this.capStageKvar));
    this.activeCapStages = bestStages;
  }

  /**
   * Step dynamic APFC relay controller
   */
  step(dtMs = 50) {
    if (this.autoApfcEnabled) {
      this.apfcCooldownMs -= dtMs;
      if (this.apfcCooldownMs <= 0) {
        const t = this.telemetry;
        // If lagging and PF < 0.96, add a capacitor stage
        if (!t.isLeading && t.powerFactor < 0.96 && this.activeCapStages < this.maxCapStages) {
          this.activeCapStages++;
          this.apfcCooldownMs = 350;
          this.computeTelemetry();
        } else if ((t.isLeading && t.powerFactor < 0.99) || (t.QNetKvar < -8 && this.activeCapStages > 0)) {
          // Prevent leading over-compensation
          this.activeCapStages--;
          this.apfcCooldownMs = 350;
          this.computeTelemetry();
        }
      }
    }
  }

  /**
   * Compute full 3-Phase AC Phasor, Power Triangle, Current, Losses & Tariff Penalty
   */
  computeTelemetry() {
    let loadKw = 0;
    let loadKvar = 0;

    INDUSTRIAL_LOAD_CATALOG.forEach(l => {
      if (this.loadStates[l.id]) {
        const phi = Math.acos(l.pfLag);
        const q = l.kw * Math.tan(phi);
        loadKw += l.kw;
        loadKvar += q;
      }
    });

    const solarKw = Number(((this.solarIrradiancePct / 100) * this.solarPeakKw).toFixed(1));
    const gridImportKw = Math.max(0, Number((loadKw - solarKw).toFixed(1)));
    const capKvar = this.activeCapStages * this.capStageKvar;
    const qNetKvar = Number((loadKvar - capKvar).toFixed(1));

    // Apparent power on the plant bus (using loadKw and qNetKvar)
    const apparentKva = Number(Math.hypot(loadKw, qNetKvar).toFixed(1));
    const uncompensatedKva = Number(Math.hypot(loadKw, loadKvar).toFixed(1));

    let powerFactor = 1.0;
    let phaseAngleDeg = 0;
    let isLeading = false;

    if (apparentKva > 0.1) {
      powerFactor = Number(Math.min(1.0, loadKw / apparentKva).toFixed(3));
      phaseAngleDeg = Number(((Math.atan2(qNetKvar, loadKw) * 180) / Math.PI).toFixed(1));
      isLeading = qNetKvar < -0.5;
    }

    const uncompensatedPf = uncompensatedKva > 0.1
      ? Number((loadKw / uncompensatedKva).toFixed(3))
      : 1.0;

    // 3-Phase Line Current: I = S * 1000 / (sqrt(3) * V_LL)
    const sqrt3 = Math.sqrt(3);
    const lineCurrentAmp = Number(((apparentKva * 1000) / (sqrt3 * this.nominalVoltageLL)).toFixed(1));
    const uncompensatedCurrentAmp = Number(((uncompensatedKva * 1000) / (sqrt3 * this.nominalVoltageLL)).toFixed(1));
    const currentReductionPct = uncompensatedCurrentAmp > 0
      ? Number((((uncompensatedCurrentAmp - lineCurrentAmp) / uncompensatedCurrentAmp) * 100).toFixed(1))
      : 0;

    // 3-Phase Feeder Copper Loss: P_loss = 3 * I^2 * R (in kW)
    const lineLossKw = Number(((3 * Math.pow(lineCurrentAmp, 2) * this.lineResistanceOhm) / 1000).toFixed(2));
    const uncompLossKw = Number(((3 * Math.pow(uncompensatedCurrentAmp, 2) * this.lineResistanceOhm) / 1000).toFixed(2));

    // Voltage drop across feeder reactance/resistance
    const busVoltageLL = Number((this.nominalVoltageLL - lineCurrentAmp * 0.055 - Math.max(0, qNetKvar) * 0.04).toFixed(1));

    // Utility Reactive Power Penalty Status (PLN / Industrial Standard: cos φ >= 0.85 required)
    let statusVerdict = 'OPTIMAL (COMPENSATED)';
    let statusLevel = 'optimal'; // 'optimal' | 'warning' | 'penalty'
    if (powerFactor < 0.85 && !isLeading) {
      statusVerdict = 'PENALTY ALERT: LOW LAGGING PF (< 0.85)';
      statusLevel = 'penalty';
    } else if (isLeading && powerFactor < 0.96) {
      statusVerdict = 'WARNING: OVER-COMPENSATED (LEADING PF)';
      statusLevel = 'warning';
    } else if (powerFactor < 0.93) {
      statusVerdict = 'SUB-OPTIMAL: MODERATE REACTIVE FLOW';
      statusLevel = 'warning';
    }

    this.telemetry = {
      loadKw: Number(loadKw.toFixed(1)),
      loadKvar: Number(loadKvar.toFixed(1)),
      solarKw,
      gridImportKw,
      capKvar,
      QNetKvar: qNetKvar,
      apparentKva,
      uncompensatedKva,
      powerFactor,
      uncompensatedPf,
      phaseAngleDeg,
      isLeading,
      lineCurrentAmp,
      uncompensatedCurrentAmp,
      currentReductionPct,
      lineLossKw,
      uncompLossKw,
      busVoltageLL,
      statusVerdict,
      statusLevel
    };

    return this.telemetry;
  }

  /**
   * Load preset industrial scenario
   */
  loadScenario(scenarioId) {
    if (scenarioId === 'heavy_lagging') {
      // Scenario 1: Uncompensated Heavy Motor Startup (cos φ = 0.67)
      this.autoApfcEnabled = false;
      this.loadStates = {
        ind_motor_1: true,
        ind_motor_2: true,
        arc_welder: true,
        hvac_chiller: true,
        lighting_res: false
      };
      this.solarIrradiancePct = 25;
      this.activeCapStages = 0;
    } else if (scenarioId === 'optimal_apfc') {
      // Scenario 2: Optimal APFC Compensation (cos φ = 0.99)
      this.loadStates = {
        ind_motor_1: true,
        ind_motor_2: true,
        arc_welder: true,
        hvac_chiller: true,
        lighting_res: false
      };
      this.solarIrradiancePct = 40;
      this.autoApfcEnabled = true;
      this.runAutoApfcInstant();
    } else if (scenarioId === 'over_compensated') {
      // Scenario 3: Light Load with All Capacitors ON (Leading PF Hazard)
      this.autoApfcEnabled = false;
      this.loadStates = {
        ind_motor_1: false,
        ind_motor_2: false,
        arc_welder: false,
        hvac_chiller: true,
        lighting_res: true
      };
      this.solarIrradiancePct = 60;
      this.activeCapStages = 6;
    }
    return this.computeTelemetry();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MicrogridEngine, INDUSTRIAL_LOAD_CATALOG };
}
