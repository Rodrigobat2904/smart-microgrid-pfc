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
    const pfColor = t.statusLevel === 'optimal' ? '#0d9488' : (t.statusLevel === 'penalty' ? '#e11d48' : '#d97706');
    this.kpiPf.style.color = pfColor;
    this.kpiPf.textContent = t.powerFactor.toFixed(3);
    this.kpiPfSub.textContent = `Angle φ = ${t.phaseAngleDeg}° (${t.isLeading ? 'Leading' : 'Lagging'})`;

    this.kpiCurrent.style.color = '#4f46e5';
    this.kpiCurrent.textContent = `${t.lineCurrentAmp} A`;
    this.kpiCurrentSub.textContent = t.currentReductionPct > 0
      ? `↓ ${t.currentReductionPct}% vs Uncomp (${t.uncompensatedCurrentAmp} A)`
      : `Uncompensated: ${t.uncompensatedCurrentAmp} A`;

    this.kpiPower.style.color = '#0f172a';
    this.kpiPower.textContent = `${t.loadKw} kW`;
    this.kpiPowerSub.textContent = `Grid: ${t.gridImportKw} kW | Solar: ${t.solarKw} kW`;

    this.kpiReactive.style.color = '#4f46e5';
    this.kpiReactive.textContent = `${t.QNetKvar} kVAR`;
    this.kpiReactiveSub.textContent = `Load: ${t.loadKvar} | Cap: -${t.capKvar} kVAR`;

    this.kpiLoss.style.color = t.lineLossKw < t.uncompLossKw ? '#0d9488' : '#d97706';
    this.kpiLoss.textContent = `${t.lineLossKw} kW`;
    this.kpiLossSub.textContent = `Apparent S = ${t.apparentKva} kVA`;

    this.solarValTxt.textContent = `${this.engine.solarIrradiancePct}% (${t.solarKw} kW)`;

    this.btnAutoApfc.className = `btn-primary-full ${this.engine.autoApfcEnabled ? 'btn-emerald' : ''}`;
    this.btnAutoApfc.textContent = this.engine.autoApfcEnabled
      ? 'Auto-APFC Relay: Active (cos φ ≥ 0.98)'
      : 'Enable Auto-APFC Closed-Loop Relay';

    this.renderLoadBreakers();
    this.renderCapButtons();
    this.renderSingleLineDiagram();
  }

  renderSingleLineDiagram() {
    const t = this.engine.telemetry;
    const capCol = t.capKvar > 0 ? '#4f46e5' : '#94a3b8';
    const pvCol = t.solarKw > 0 ? '#d97706' : '#94a3b8';
    const loadCol = t.loadKw > 0 ? '#0f172a' : '#94a3b8';

    this.sldSvg.setAttribute('viewBox', '0 0 920 125');
    this.sldSvg.innerHTML = `
      <!-- Main 400V 3-Phase Industrial Busbar -->
      <line x1="50" y1="62" x2="870" y2="62" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
      <text x="460" y="53" text-anchor="middle" fill="#0f172a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">
        400V 3-PHASE DISTRIBUTION BUSBAR (${t.busVoltageLL} V_LL · I = ${t.lineCurrentAmp} A · cos φ = ${t.powerFactor.toFixed(3)})
      </text>

      <!-- Utility Grid Feeder (Top Left) -->
      <rect x="55" y="4" width="205" height="36" rx="6" fill="#f0fdf4" stroke="#0d9488" stroke-width="1.5" />
      <text x="157" y="19" text-anchor="middle" fill="#0f766e" font-family="Inter, sans-serif" font-size="9.5" font-weight="700">Utility PCC Feeder (20kV/400V)</text>
      <text x="157" y="33" text-anchor="middle" fill="#334155" font-family="JetBrains Mono, monospace" font-size="9">Import: ${t.gridImportKw} kW | Q: ${t.QNetKvar} kVAR</text>
      <line x1="157" y1="40" x2="157" y2="62" stroke="#0d9488" stroke-width="2" />

      <!-- Solar PV Inverter (Top Right) -->
      <rect x="655" y="4" width="205" height="36" rx="6" fill="#fffbeb" stroke="${pvCol}" stroke-width="1.5" />
      <text x="757" y="19" text-anchor="middle" fill="#b45309" font-family="Inter, sans-serif" font-size="9.5" font-weight="700">Solar PV Inverter (100 kWp)</text>
      <text x="757" y="33" text-anchor="middle" fill="#334155" font-family="JetBrains Mono, monospace" font-size="9">Output: ${t.solarKw} kW (Unity PF)</text>
      <line x1="757" y1="40" x2="757" y2="62" stroke="${pvCol}" stroke-width="2" />

      <!-- Industrial Inductive Motor Loads (Bottom Left) -->
      <line x1="270" y1="62" x2="270" y2="84" stroke="${loadCol}" stroke-width="2" />
      <rect x="155" y="84" width="230" height="36" rx="6" fill="#f8fafc" stroke="${loadCol}" stroke-width="1.5" />
      <text x="270" y="99" text-anchor="middle" fill="#0f172a" font-family="Inter, sans-serif" font-size="9.5" font-weight="700">Inductive Plant Loads (MCC)</text>
      <text x="270" y="113" text-anchor="middle" fill="#475569" font-family="JetBrains Mono, monospace" font-size="9">P = ${t.loadKw} kW | Q_L = +${t.loadKvar} kVAR</text>

      <!-- 6-Stage Detuned Capacitor Bank (Bottom Right) -->
      <line x1="640" y1="62" x2="640" y2="84" stroke="${capCol}" stroke-width="2" />
      <rect x="520" y="84" width="240" height="36" rx="6" fill="#eef2ff" stroke="${capCol}" stroke-width="1.5" />
      <text x="640" y="99" text-anchor="middle" fill="#4f46e5" font-family="Inter, sans-serif" font-size="9.5" font-weight="700">APFC Capacitor Bank (${this.engine.activeCapStages}/6)</text>
      <text x="640" y="113" text-anchor="middle" fill="#475569" font-family="JetBrains Mono, monospace" font-size="9">Compensation: Q_C = -${t.capKvar} kVAR</text>
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

    // Subtle light grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 50) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 45) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const t = this.engine.telemetry;
    const phiRad = (t.phaseAngleDeg * Math.PI) / 180;

    // 1. Reference Voltage Wave v(t)
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const theta = (x / w) * Math.PI * 4 - this.phaseTick;
      const y = h / 2 - Math.sin(theta) * (h * 0.34);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Line Current Wave i(t)
    const iCol = t.statusLevel === 'optimal' ? '#0d9488' : (t.statusLevel === 'penalty' ? '#e11d48' : '#d97706');
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

    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#4f46e5';
    ctx.fillText('─── v(t) Bus Voltage (400V)', 14, 22);
    ctx.fillStyle = iCol;
    ctx.fillText(`─── i(t) Line Current (${t.lineCurrentAmp}A, φ = ${t.phaseAngleDeg}°)`, 14, 38);
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
    const ox = 48;
    const oy = h - 36;
    const scaleX = (w - 96) / maxScale;
    const scaleY = (h - 68) / maxScale;
    const scale = Math.min(scaleX, scaleY);

    const px = ox + t.loadKw * scale;
    const qLoadY = oy - t.loadKvar * scale;
    const qNetY = oy - t.QNetKvar * scale;

    // 1. Uncompensated dashed triangle
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, qLoadY);
    ctx.lineTo(px, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Active Power P (Horizontal Slate)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, oy);
    ctx.stroke();

    // 3. Net Reactive Power Q_net (Vertical Indigo)
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(px, oy);
    ctx.lineTo(px, qNetY);
    ctx.stroke();

    // 4. Resultant Apparent Power S (Hypotenuse Teal)
    const sCol = t.statusLevel === 'optimal' ? '#0d9488' : '#e11d48';
    ctx.strokeStyle = sCol;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, qNetY);
    ctx.stroke();

    // Labels
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`P = ${t.loadKw} kW`, ox + (px - ox) * 0.32, oy + 18);

    ctx.fillStyle = '#4f46e5';
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
