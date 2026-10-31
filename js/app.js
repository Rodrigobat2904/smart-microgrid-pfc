/**
 * GridSync — Main Application & Real-Time Phasor / Waveform Renderer
 */

class GridSyncApp {
  constructor() {
    this.engine = new MicrogridEngine();
    this.engine.setCapStages(4);
    this.phaseTick = 0;

    this.initDOM();
    this.renderLoadBreakers();
    this.renderCapButtons();
    this.attachEvents();
    this.updateUI();
    this.startLoop();
  }

  initDOM() {
    this.verdictBanner = document.getElementById('verdict-banner');
    this.kpiPf = document.getElementById('kpi-pf');
    this.kpiPfSub = document.getElementById('kpi-pf-sub');
    this.kpiCurrent = document.getElementById('kpi-current');
    this.kpiCurrentSub = document.getElementById('kpi-current-sub');
    this.kpiPower = document.getElementById('kpi-power');
    this.kpiPowerSub = document.getElementById('kpi-power-sub');
    this.kpiReactive = document.getElementById('kpi-reactive');
    this.kpiReactiveSub = document.getElementById('kpi-reactive-sub');
    this.kpiLoss = document.getElementById('kpi-loss');
    this.kpiLossSub = document.getElementById('kpi-loss-sub');

    this.waveCanvas = document.getElementById('wave-canvas');
    this.triangleCanvas = document.getElementById('triangle-canvas');
    this.sldSvg = document.getElementById('sld-svg');

    this.loadListEl = document.getElementById('load-list');
    this.capGridEl = document.getElementById('cap-grid');
    this.solarSlider = document.getElementById('solar-slider');
    this.solarValTxt = document.getElementById('solar-val-txt');
    this.btnAutoApfc = document.getElementById('btn-auto-apfc');
  }

  attachEvents() {
    document.getElementById('btn-scen-lag').addEventListener('click', () => {
      this.engine.loadScenario('heavy_lagging');
      this.solarSlider.value = this.engine.solarIrradiancePct;
      this.updateUI();
    });

    document.getElementById('btn-scen-opt').addEventListener('click', () => {
      this.engine.loadScenario('optimal_apfc');
      this.solarSlider.value = this.engine.solarIrradiancePct;
      this.updateUI();
    });

    document.getElementById('btn-scen-lead').addEventListener('click', () => {
      this.engine.loadScenario('over_compensated');
      this.solarSlider.value = this.engine.solarIrradiancePct;
      this.updateUI();
    });

    this.solarSlider.addEventListener('input', (e) => {
      this.engine.setSolarIrradiance(e.target.value);
      this.updateUI();
    });

    this.btnAutoApfc.addEventListener('click', () => {
      this.engine.setAutoApfc(!this.engine.autoApfcEnabled);
      this.updateUI();
    });
  }

  renderLoadBreakers() {
    this.loadListEl.innerHTML = '';
    INDUSTRIAL_LOAD_CATALOG.forEach(item => {
      const isOn = this.engine.loadStates[item.id];
      const phi = Math.acos(item.pfLag);
      const q = (item.kw * Math.tan(phi)).toFixed(0);
      const row = document.createElement('div');
      row.className = `load-row ${isOn ? 'active' : ''}`;
      row.innerHTML = `
        <div>
          <div class="load-info-title">${item.name}</div>
          <div class="load-info-sub">P = ${item.kw} kW | Q = ${q} kVAR | cos φ = ${item.pfLag}</div>
        </div>
        <span class="breaker-pill ${isOn ? 'on' : 'off'}">${isOn ? 'CLOSED (ON)' : 'OPEN (OFF)'}</span>
      `;
      row.addEventListener('click', () => {
        this.engine.setLoadState(item.id, !this.engine.loadStates[item.id]);
        if (this.engine.autoApfcEnabled) this.engine.runAutoApfcInstant();
        this.updateUI();
      });
      this.loadListEl.appendChild(row);
    });
  }

  renderCapButtons() {
    this.capGridEl.innerHTML = '';
    for (let i = 1; i <= this.engine.maxCapStages; i++) {
      const isOn = i <= this.engine.activeCapStages;
      const btn = document.createElement('button');
      btn.className = `cap-step-btn ${isOn ? 'active' : ''}`;
      btn.innerHTML = `STAGE C${i}<br/><span style="font-size:0.68rem;opacity:0.8">+30 kVAR</span>`;
      btn.addEventListener('click', () => {
        this.engine.autoApfcEnabled = false;
        const target = (this.engine.activeCapStages === i) ? i - 1 : i;
        this.engine.setCapStages(target);
        this.updateUI();
      });
      this.capGridEl.appendChild(btn);
    }
  }

  updateUI() {
    const t = this.engine.telemetry;

    this.verdictBanner.className = `verdict-banner ${t.statusLevel}`;
    this.verdictBanner.innerHTML = `
      <span>⚡ GRID DIAGNOSTIC: ${t.statusVerdict}</span>
      <span>Bus Voltage: ${t.busVoltageLL} V_LL (50 Hz)</span>
    `;

    // KPI Cards
    const pfColor = t.statusLevel === 'optimal' ? '#10b981' : (t.statusLevel === 'penalty' ? '#f43f5e' : '#f59e0b');
    this.kpiPf.style.color = pfColor;
    this.kpiPf.textContent = t.powerFactor.toFixed(3);
    this.kpiPfSub.textContent = `Angle φ = ${t.phaseAngleDeg}° (${t.isLeading ? 'Leading' : 'Lagging'})`;

    this.kpiCurrent.style.color = '#38bdf8';
    this.kpiCurrent.textContent = `${t.lineCurrentAmp} A`;
    this.kpiCurrentSub.textContent = t.currentReductionPct > 0
      ? `↓ ${t.currentReductionPct}% vs Uncomp (${t.uncompensatedCurrentAmp} A)`
      : `Uncompensated: ${t.uncompensatedCurrentAmp} A`;

    this.kpiPower.style.color = '#f8fafc';
    this.kpiPower.textContent = `${t.loadKw} kW`;
    this.kpiPowerSub.textContent = `Grid: ${t.gridImportKw} kW | Solar: ${t.solarKw} kW`;

    this.kpiReactive.style.color = '#a855f7';
    this.kpiReactive.textContent = `${t.QNetKvar} kVAR`;
    this.kpiReactiveSub.textContent = `Load: ${t.loadKvar} | Cap: -${t.capKvar} kVAR`;

    this.kpiLoss.style.color = t.lineLossKw < t.uncompLossKw ? '#10b981' : '#f59e0b';
    this.kpiLoss.textContent = `${t.lineLossKw} kW`;
    this.kpiLossSub.textContent = `Apparent S = ${t.apparentKva} kVA`;

    this.solarValTxt.textContent = `${this.engine.solarIrradiancePct}% (${t.solarKw} kW)`;

    this.btnAutoApfc.className = `sw-btn sw-auto-full ${this.engine.autoApfcEnabled ? 'btn-emerald' : ''}`;
    this.btnAutoApfc.textContent = this.engine.autoApfcEnabled
      ? '🤖 AUTO-APFC RELAY: ENGAGED (TARGET cos φ ≥ 0.98)'
      : '🤖 ENABLE AUTO-APFC CLOSED-LOOP RELAY';

    this.renderLoadBreakers();
    this.renderCapButtons();
    this.renderSingleLineDiagram();
  }

  renderSingleLineDiagram() {
    const t = this.engine.telemetry;
    const capCol = t.capKvar > 0 ? '#00f5d4' : '#475569';
    const pvCol = t.solarKw > 0 ? '#ffb703' : '#475569';
    const loadCol = t.loadKw > 0 ? '#38bdf8' : '#475569';

    this.sldSvg.setAttribute('viewBox', '0 0 1120 132');
    this.sldSvg.innerHTML = `
      <!-- Main 400V 3-Phase Industrial Busbar -->
      <line x1="60" y1="66" x2="1060" y2="66" stroke="#ffb703" stroke-width="5" stroke-linecap="square" />
      <text x="560" y="56" text-anchor="middle" fill="#ffb703" font-family="Share Tech Mono, monospace" font-size="11" font-weight="700">
        ═══ 400V AC 3-PHASE MAIN SUBSTATION BUSBAR (V_LL = ${t.busVoltageLL} V | I_FEEDER = ${t.lineCurrentAmp} A | cos φ = ${t.powerFactor.toFixed(3)}) ═══
      </text>

      <!-- Utility Grid Feeder (Top Left) -->
      <rect x="65" y="6" width="225" height="38" rx="0" fill="#06152d" stroke="#00f5d4" stroke-width="1.8" />
      <text x="177" y="21" text-anchor="middle" fill="#00f5d4" font-family="Share Tech Mono, monospace" font-size="10" font-weight="700">[CB-01] UTILITY PCC (20kV/400V)</text>
      <text x="177" y="36" text-anchor="middle" fill="#e2f1ff" font-family="Share Tech Mono, monospace" font-size="9.5">IMPORT: ${t.gridImportKw} kW | Q_NET: ${t.QNetKvar} kVAR</text>
      <line x1="177" y1="44" x2="177" y2="66" stroke="#00f5d4" stroke-width="2.5" />

      <!-- Solar PV Inverter (Top Right) -->
      <rect x="820" y="6" width="225" height="38" rx="0" fill="#06152d" stroke="${pvCol}" stroke-width="1.8" />
      <text x="932" y="21" text-anchor="middle" fill="${pvCol}" font-family="Share Tech Mono, monospace" font-size="10" font-weight="700">[INV-PV] SOLAR TIE-IN (100kWp)</text>
      <text x="932" y="36" text-anchor="middle" fill="#e2f1ff" font-family="Share Tech Mono, monospace" font-size="9.5">INJECTION: ${t.solarKw} kW (UNITY PF)</text>
      <line x1="932" y1="44" x2="932" y2="66" stroke="${pvCol}" stroke-width="2.5" />

      <!-- Industrial Inductive Motor Loads (Bottom Left) -->
      <line x1="330" y1="66" x2="330" y2="88" stroke="${loadCol}" stroke-width="2.5" />
      <rect x="200" y="88" width="260" height="38" rx="0" fill="#06152d" stroke="${loadCol}" stroke-width="1.8" />
      <text x="330" y="103" text-anchor="middle" fill="${loadCol}" font-family="Share Tech Mono, monospace" font-size="10" font-weight="700">[MCC-1..5] INDUCTIVE PLANT FEEDERS</text>
      <text x="330" y="118" text-anchor="middle" fill="#e2f1ff" font-family="Share Tech Mono, monospace" font-size="9.5">P_LOAD = ${t.loadKw} kW | Q_L = +${t.loadKvar} kVAR</text>

      <!-- 6-Stage Detuned Capacitor Bank (Bottom Right) -->
      <line x1="770" y1="66" x2="770" y2="88" stroke="${capCol}" stroke-width="2.5" />
      <rect x="640" y="88" width="260" height="38" rx="0" fill="#06152d" stroke="${capCol}" stroke-width="1.8" />
      <text x="770" y="103" text-anchor="middle" fill="${capCol}" font-family="Share Tech Mono, monospace" font-size="10" font-weight="700">[APFC C1..C6] DETUNED CAP BANK (${this.engine.activeCapStages}/6)</text>
      <text x="770" y="118" text-anchor="middle" fill="#e2f1ff" font-family="Share Tech Mono, monospace" font-size="9.5">COMPENSATION: Q_C = -${t.capKvar} kVAR</text>
    `;
  }

  drawWaveforms() {
    const canvas = this.waveCanvas;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    for (let x = 0; x < w; x += 60) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    const t = this.engine.telemetry;
    const phiRad = (t.phaseAngleDeg * Math.PI) / 180; // Positive = lagging

    // 1. Reference Voltage Wave v(t) = Vm sin(wt)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const theta = (x / w) * Math.PI * 4 - this.phaseTick;
      const y = h / 2 - Math.sin(theta) * (h * 0.34);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Line Current Wave i(t) = Im sin(wt - phi)
    const iCol = t.statusLevel === 'optimal' ? '#10b981' : (t.statusLevel === 'penalty' ? '#f43f5e' : '#f59e0b');
    const iAmpScale = Math.min(0.42, Math.max(0.14, (t.lineCurrentAmp / 420) * 0.38));
    ctx.strokeStyle = iCol;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const theta = (x / w) * Math.PI * 4 - this.phaseTick - phiRad;
      const y = h / 2 - Math.sin(theta) * (h * iAmpScale);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend overlay
    ctx.font = '600 11px JetBrains Mono, monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('─── v(t) Bus Voltage (400V)', 14, 22);
    ctx.fillStyle = iCol;
    ctx.fillText(`─── i(t) Line Current (${t.lineCurrentAmp}A, φ = ${t.phaseAngleDeg}°)`, 14, 40);
  }

  drawPowerTriangle() {
    const canvas = this.triangleCanvas;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const t = this.engine.telemetry;
    const maxScale = Math.max(180, t.loadKw, t.loadKvar, t.apparentKva) * 1.25;
    const ox = 52;
    const oy = h - 42;
    const scaleX = (w - 105) / maxScale;
    const scaleY = (h - 75) / maxScale;
    const scale = Math.min(scaleX, scaleY);

    const px = ox + t.loadKw * scale;
    const qLoadY = oy - t.loadKvar * scale;
    const qNetY = oy - t.QNetKvar * scale;

    // 1. Uncompensated dashed triangle
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, qLoadY);
    ctx.lineTo(px, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Active Power P (Horizontal Emerald/Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, oy);
    ctx.stroke();

    // 3. Net Reactive Power Q_net (Vertical)
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, oy);
    ctx.lineTo(px, qNetY);
    ctx.stroke();

    // 4. Resultant Apparent Power S (Hypotenuse)
    const sCol = t.statusLevel === 'optimal' ? '#10b981' : '#f43f5e';
    ctx.strokeStyle = sCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, qNetY);
    ctx.stroke();

    // Labels
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`P = ${t.loadKw} kW`, ox + (px - ox) * 0.32, oy + 18);

    ctx.fillStyle = '#a855f7';
    ctx.fillText(`Q_net = ${t.QNetKvar} kVAR`, Math.min(w - 135, px + 8), (oy + qNetY) / 2);

    ctx.fillStyle = sCol;
    ctx.fillText(`S = ${t.apparentKva} kVA (cos φ = ${t.powerFactor})`, ox + 10, 24);
  }

  startLoop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = now - last;
      last = now;
      this.phaseTick = (this.phaseTick + 0.045) % (Math.PI * 2);

      const prevStages = this.engine.activeCapStages;
      this.engine.step(dt);
      if (this.engine.activeCapStages !== prevStages) {
        this.updateUI();
      }

      this.drawWaveforms();
      this.drawPowerTriangle();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gridApp = new GridSyncApp();
});
