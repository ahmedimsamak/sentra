/* ==========================================================================
   SENTRA — Simulation & Rules
   MockDataSource produces readings. Rules turns readings into statuses, risk
   and alarm hardware state. Rules is data-source agnostic: feed it real
   ESP32 readings and everything downstream keeps working.
   ========================================================================== */
'use strict';

const Rules = {
  /** Status of a single numeric reading against (possibly user-edited) thresholds. */
  statusOf(key, value, settings) {
    const def = SENSOR_DEFS[key];
    if (key === 'cam') return value === 'NORMAL' ? 'normal' : 'danger';
    if (key === 'sos') return value >= 1 ? 'danger' : 'normal';
    const th = (settings && settings.thresholds[key]) || def;
    if (value >= th.danger) return 'danger';
    if (value >= th.warn) return 'warning';
    if (def.lowDanger !== undefined && value <= def.lowDanger) return 'danger';
    if (def.lowWarn !== undefined && value <= def.lowWarn) return 'warning';
    return 'normal';
  },

  worst(statuses) {
    return statuses.reduce((w, s) => (STATUS[s].rank > STATUS[w].rank ? s : w), 'normal');
  },

  /** Recompute every derived field from raw readings. */
  evaluate(state) {
    const th = state.settings;
    const hazardous = { critical: false, danger: false, warning: false };

    state.zones.forEach((zone) => {
      const set = state.sensors[zone.id];
      const issues = [];
      SENSOR_ORDER.forEach((key) => {
        const s = set[key];
        s.status = Rules.statusOf(key, s.value, th);
        if (s.status !== 'normal') issues.push(key);
      });
      zone.issues = issues;
      zone.status = Rules.worst(issues.map((k) => set[k].status));

      const smokeDanger = set.smoke.status === 'danger';
      const sos = set.sos.value >= 1;
      const camFire = set.cam.value !== 'NORMAL' && set.smoke.status !== 'normal';
      if (smokeDanger || sos || camFire) hazardous.critical = true;
      if (zone.status === 'danger') hazardous.danger = true;
      if (zone.status === 'warning') hazardous.warning = true;
    });

    const prevRisk = state.risk;
    state.risk = hazardous.critical ? 'CRITICAL' : hazardous.danger ? 'HIGH' : hazardous.warning ? 'ELEVATED' : 'LOW';
    state.systemStatus = state.risk === 'CRITICAL' ? 'EMERGENCY' : state.risk === 'LOW' ? 'OPERATIONAL' : 'ATTENTION';

    // Alarm hardware (simulated LED + buzzer on the Alarm Controller).
    if (RISK_LEVELS[state.risk].rank > RISK_LEVELS[prevRisk].rank) state.hardware.silenced = false;
    state.hardware.led = state.risk === 'LOW' ? 'green' : state.risk === 'ELEVATED' ? 'amber' : 'red';
    state.hardware.buzzer = (state.risk === 'CRITICAL' || state.risk === 'HIGH') && !state.hardware.silenced;

    // Devices located in a dangerous zone flag as "Alert".
    state.devices.forEach((d) => {
      const zone = state.zones.find((z) => z.id === d.zoneId);
      if (d.baseStatus === 'Maintenance' || d.baseStatus === 'Offline') { d.status = d.baseStatus; return; }
      d.status = zone && zone.status === 'danger' && d.type !== 'ESP32 Edge Gateway' ? 'Alert' : d.baseStatus;
    });
  }
};

const MockDataSource = {
  timer: null,
  onData: null,

  /** Start periodic simulated readings. `onData(state)` is called after each tick. */
  start(state, onData) {
    this.stop();
    this.onData = onData;
    const loop = () => {
      if (state.simulation.running) {
        this.tick(state);
        onData(state);
      }
      this.timer = setTimeout(loop, state.settings.interval);
    };
    this.timer = setTimeout(loop, state.settings.interval);
  },

  stop() { clearTimeout(this.timer); this.timer = null; },

  /** Fill facility-level history from per-sensor history so charts start populated. */
  primeHistory(state) {
    const h = state.history;
    h.avgTemp = []; h.maxTemp = []; h.maxSmoke = []; h.maxEquip = []; h.maxVib = [];
    for (let i = 0; i < HISTORY_LENGTH; i++) {
      const sets = Object.values(state.sensors);
      const temps = sets.map((s) => s.temp.history[i]);
      h.avgTemp.push(temps.reduce((a, b) => a + b, 0) / temps.length);
      h.maxTemp.push(Math.max(...temps));
      h.maxSmoke.push(Math.max(...sets.map((s) => s.smoke.history[i])));
      h.maxEquip.push(Math.max(...sets.map((s) => s.equip.history[i])));
      h.maxVib.push(Math.max(...sets.map((s) => s.vibration.history[i])));
    }
  },

  tick(state) {
    const now = Date.now();
    const modeId = state.mode;
    state.simulation.tick++;

    state.zones.forEach((zone) => {
      const set = state.sensors[zone.id];
      SENSOR_ORDER.forEach((key) => {
        if (key === 'cam') { set.cam.ts = now; return; }
        const def = SENSOR_DEFS[key];
        const s = set[key];
        const [lo, hi] = def.baseline[modeId];
        s.base = U.clamp(s.base + U.noise(def.noise * 0.15), lo, hi);
        const goal = s.target !== null ? s.target : s.base;
        if (key === 'sos') {
          s.value = goal;
        } else {
          const jitter = s.target !== null ? def.noise * 1.6 : def.noise;
          s.value = U.clamp(s.value + (goal - s.value) * 0.35 + U.noise(jitter), def.min, def.max);
        }
        s.ts = now;
        s.history.push(s.value);
        if (s.history.length > HISTORY_LENGTH) s.history.shift();
      });
      set.humidity.aux = set.temp.value + U.noise(0.3);
    });

    // Devices report in (simulated heartbeat).
    state.devices.forEach((d) => {
      if (d.baseStatus !== 'Maintenance' && d.baseStatus !== 'Offline' && Math.random() < 0.7) d.lastSeen = now;
    });

    this.pushFacilityHistory(state, now);
  },

  pushFacilityHistory(state, now) {
    const sets = Object.values(state.sensors);
    const temps = sets.map((s) => s.temp.value);
    const h = state.history;
    h.labels.push(U.time(now));
    h.avgTemp.push(temps.reduce((a, b) => a + b, 0) / temps.length);
    h.maxTemp.push(Math.max(...temps));
    h.maxSmoke.push(Math.max(...sets.map((s) => s.smoke.value)));
    h.maxEquip.push(Math.max(...sets.map((s) => s.equip.value)));
    h.maxVib.push(Math.max(...sets.map((s) => s.vibration.value)));
    Object.keys(h).forEach((k) => { if (h[k].length > HISTORY_LENGTH) h[k].shift(); });
  },

  /** Zones sharing a walking-graph connection (directly or via an aisle node). */
  neighbours(modeId, zoneId) {
    const mode = MODES[modeId];
    const own = Object.keys(mode.nodes).filter((n) => mode.nodes[n].zone === zoneId);
    const adj = (n) => mode.edges.filter((e) => e.includes(n)).map((e) => (e[0] === n ? e[1] : e[0]));
    const result = new Set();
    own.forEach((n) => adj(n).forEach((m) => {
      const node = mode.nodes[m];
      if (node.zone && node.zone !== zoneId) result.add(node.zone);
      if (!node.zone && !node.exit) adj(m).forEach((k) => { const z = mode.nodes[k].zone; if (z && z !== zoneId) result.add(z); });
    }));
    return Array.from(result);
  },

  /** Apply a demo scenario. Values jump immediately, then settle with noise on each tick. */
  applyScenario(state, scenarioId) {
    const scenario = SCENARIOS[scenarioId];
    const modeId = state.mode;
    const now = Date.now();

    // Clear previous targets.
    Object.values(state.sensors).forEach((set) => {
      Object.values(set).forEach((s) => { if ('target' in s) s.target = null; });
      set.cam.value = 'NORMAL';
      set.sos.value = 0;
    });

    state.simulation.scenario = scenarioId;
    state.simulation.zoneId = scenario.zone ? scenario.zone[modeId] : null;
    state.hardware.silenced = false;

    if (scenarioId === 'normal') {
      Object.values(state.sensors).forEach((set) => {
        Object.values(set).forEach((s) => {
          if (s.key === 'cam') return;
          // Snap most of the way back so recovery is visible but not instant.
          s.value = s.key === 'sos' ? 0 : U.lerp(s.value, s.base, 0.75);
          s.ts = now;
        });
      });
      return;
    }

    const zoneId = state.simulation.zoneId;
    const set = state.sensors[zoneId];
    Object.entries(scenario.targets).forEach(([key, target]) => {
      set[key].target = target;
      set[key].value = key === 'sos' ? target : target + U.noise(SENSOR_DEFS[key].noise);
      set[key].ts = now;
    });
    set.cam.value = scenario.cam;
    set.cam.ts = now;

    this.neighbours(modeId, zoneId).forEach((nId) => {
      const nSet = state.sensors[nId];
      Object.entries(scenario.spill).forEach(([key, factor]) => {
        const s = nSet[key];
        s.target = s.base + (scenario.targets[key] - s.base) * factor;
        s.value = s.target;
        s.ts = now;
      });
    });
  }
};
