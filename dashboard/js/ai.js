/* ==========================================================================
   SENTRA — AI Insights Engine (SIMULATED / PROTOTYPE)
   A transparent rule-based sensor-fusion scorer that imitates what a trained
   classifier would output. It is NOT a trained or validated model.
   Also contains Predictive Evacuation Routing (risk-weighted Dijkstra).
   ========================================================================== */
'use strict';

const AI_CLASSES = {
  normal: 'Normal Operation',
  fireActive: 'Fire — Active',
  fireEarly: 'Fire — Early Stage / Smoke',
  overheat: 'Equipment Overheating',
  mechanical: 'Mechanical Fault (Vibration)',
  sos: 'Personal Emergency (SOS)'
};

const AI = {
  /** Normalised 0..1 feature strengths for one zone. */
  features(set, settings) {
    const th = settings.thresholds;
    const c = U.clamp;
    const smokeBase = 300, tempBase = 28, equipBase = th.equip.warn - 20, vibBase = 0.25;
    return {
      smoke: c((set.smoke.value - smokeBase) / (th.smoke.danger - smokeBase), 0, 1),
      temp: c((set.temp.value - tempBase) / (th.temp.danger - tempBase), 0, 1),
      equip: c((set.equip.value - equipBase) / (th.equip.danger - equipBase), 0, 1),
      vibration: c((set.vibration.value - vibBase) / (th.vibration.danger - vibBase), 0, 1),
      light: c((set.light.value - 800) / 1500, 0, 1),
      dryness: c((40 - set.humidity.value) / 25, 0, 1),
      camFire: set.cam.value === 'POSSIBLE FIRE' ? 1 : 0,
      camEmergency: set.cam.value === 'EMERGENCY' ? 1 : 0,
      sos: set.sos.value >= 1 ? 1 : 0
    };
  },

  score(f) {
    const s = {};
    s.fireActive = f.smoke >= 0.95 ? 0.5 * f.smoke + 0.2 * f.temp + 0.15 * f.camFire + 0.1 * f.light + 0.05 * f.dryness : 0.3 * f.smoke * f.smoke;
    s.fireEarly = f.smoke >= 0.3 && f.smoke < 0.95 ? 0.45 + 0.35 * f.smoke + 0.1 * f.temp : 0.15 * f.smoke;
    s.overheat = (f.equip >= 0.5 ? 0.4 + 0.5 * f.equip : 0.3 * f.equip) * (1 - 0.6 * f.smoke);
    s.mechanical = f.vibration >= 0.3 ? 0.4 + 0.5 * f.vibration : 0.3 * f.vibration;
    s.sos = f.sos ? 0.85 + 0.1 * f.camEmergency : 0;
    const top = Math.max(...Object.values(s));
    s.normal = Math.max(0.05, 1 - top * 0.9);
    // Sharpen into a probability-like distribution.
    const powered = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.pow(Math.max(v, 0.0001), 3)]));
    const total = Object.values(powered).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(powered).map(([k, v]) => [k, v / total]));
  },

  run(state) {
    const settings = state.settings;
    let best = null;

    state.zones.forEach((zone) => {
      const set = state.sensors[zone.id];
      const f = AI.features(set, settings);
      const probs = AI.score(f);
      const top = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
      const severity = top[0] === 'normal' ? 0 : top[1] * (top[0] === 'fireActive' || top[0] === 'sos' ? 2 : 1);
      if (!best || severity > best.severity) best = { zone, set, f, probs, top, severity };
    });

    const { zone, set, f, probs, top } = best;
    const classKey = top[0];
    const isNormal = classKey === 'normal';
    const jitter = U.noise(0.6);
    const confidence = U.clamp(Math.round(top[1] * 100 + jitter), 50, 98);

    const signals = [
      { key: 'smoke', label: 'Smoke concentration', sensor: 'MQ-2', weight: f.smoke },
      { key: 'temp', label: 'Ambient temperature', sensor: 'DS18B20', weight: f.temp },
      { key: 'equip', label: 'Equipment surface temp', sensor: 'MLX90614', weight: f.equip },
      { key: 'humidity', label: 'Humidity drop', sensor: 'DHT22', weight: f.dryness },
      { key: 'light', label: 'Light intensity spike', sensor: 'BH1750', weight: f.light },
      { key: 'vibration', label: 'Vibration amplitude', sensor: 'MPU6050', weight: f.vibration },
      { key: 'sos', label: 'Manual SOS trigger', sensor: 'SOS Button', weight: f.sos },
      { key: 'cam', label: 'Visual anomaly', sensor: 'ESP32-CAM', weight: Math.max(f.camFire, f.camEmergency) }
    ].map((sig) => ({ ...sig, reading: UI.formatReading(sig.key, set[sig.key]), status: set[sig.key].status }))
      .sort((a, b) => b.weight - a.weight);

    const prev = state.ai;
    state.ai = {
      model: 'SENTRA-Fusion v0.3 (rule-based prototype)',
      classKey,
      classification: AI_CLASSES[classKey],
      confidence,
      zoneId: isNormal ? null : zone.id,
      zoneName: isNormal ? 'All monitored zones' : zone.name,
      risk: state.risk,
      probabilities: Object.entries(probs).map(([k, p]) => ({ key: k, label: AI_CLASSES[k], p })).sort((a, b) => b.p - a.p),
      signals,
      reasoning: AI.reasoning(classKey, set, zone),
      recommendation: AI.recommendation(classKey, zone),
      evac: AI.routing(state, classKey, isNormal ? null : zone.id),
      updatedAt: Date.now(),
      changedAt: prev && prev.classKey === classKey ? prev.changedAt : Date.now()
    };
  },

  reasoning(classKey, set, zone) {
    const r = (k) => UI.formatReading(k, set[k]);
    switch (classKey) {
      case 'fireActive': return `Smoke (${r('smoke')}) is above the danger threshold while temperature (${r('temp')}) rises and humidity falls (${r('humidity')}). The camera flags a possible flame and light intensity spiked (${r('light')}). Correlated signals indicate an active fire in ${zone.name}.`;
      case 'fireEarly': return `Smoke (${r('smoke')}) is above the warning threshold with a moderate temperature rise (${r('temp')}). No visual flame confirmation yet — pattern is consistent with early-stage combustion or fumes in ${zone.name}.`;
      case 'overheat': return `Equipment surface temperature (${r('equip')}) exceeds the safe limit while smoke remains near baseline (${r('smoke')}). Pattern indicates thermal overload rather than fire in ${zone.name}.`;
      case 'mechanical': return `Vibration amplitude (${r('vibration')}) is well above normal with no smoke or heat correlation. Pattern suggests imbalance, loose mounting or bearing wear in ${zone.name}.`;
      case 'sos': return `The SOS button in ${zone.name} was activated manually and the camera reports an emergency condition. Human-initiated alerts are treated as critical regardless of sensor values.`;
      default: return 'All fused sensor signals are within configured thresholds. No anomalous correlation detected across monitored zones.';
    }
  },

  recommendation(classKey, zone) {
    switch (classKey) {
      case 'fireActive': return `Evacuate ${zone.name} and adjacent areas immediately using the recommended route. Notify emergency services per facility procedure.`;
      case 'fireEarly': return `Dispatch staff to verify ${zone.name}. Prepare for evacuation; keep the recommended exit route clear.`;
      case 'overheat': return `Isolate power to the affected equipment in ${zone.name}, restrict access and schedule an inspection.`;
      case 'mechanical': return `Stop the affected machine in ${zone.name}, lock out and inspect mounting and bearings before restart.`;
      case 'sos': return `Send the nearest responder to ${zone.name} using the fastest access route. Keep the line of communication open.`;
      default: return 'Continue routine monitoring. No action required.';
    }
  },

  /* ---------------------------- Evacuation routing ---------------------------- */

  graph(modeId) {
    const mode = MODES[modeId];
    const adj = {};
    Object.keys(mode.nodes).forEach((n) => { adj[n] = []; });
    mode.edges.forEach(([a, b]) => {
      const d = Math.hypot(mode.nodes[a].x - mode.nodes[b].x, mode.nodes[a].y - mode.nodes[b].y);
      adj[a].push({ to: b, d });
      adj[b].push({ to: a, d });
    });
    return adj;
  },

  /** BFS hop distance from hazard nodes → predicted spread risk (0..1). */
  nodeRisk(modeId, hazardZone) {
    const mode = MODES[modeId];
    const adj = AI.graph(modeId);
    const decay = [1, 0.7, 0.35, 0.1];
    const risk = {};
    const queue = Object.keys(mode.nodes).filter((n) => mode.nodes[n].zone === hazardZone).map((n) => [n, 0]);
    const seen = new Set(queue.map((q) => q[0]));
    while (queue.length) {
      const [n, hop] = queue.shift();
      risk[n] = decay[hop] ?? 0;
      adj[n].forEach(({ to }) => { if (!seen.has(to)) { seen.add(to); queue.push([to, hop + 1]); } });
    }
    return risk;
  },

  dijkstra(modeId, start, costFn, blocked = new Set()) {
    const adj = AI.graph(modeId);
    const dist = {}, prev = {};
    Object.keys(adj).forEach((n) => { dist[n] = Infinity; });
    dist[start] = 0;
    const open = new Set(Object.keys(adj));
    while (open.size) {
      let u = null;
      open.forEach((n) => { if (u === null || dist[n] < dist[u]) u = n; });
      if (dist[u] === Infinity) break;
      open.delete(u);
      adj[u].forEach(({ to, d }) => {
        if (blocked.has(to) && to !== start) return;
        const alt = dist[u] + costFn(u, to, d);
        if (alt < dist[to]) { dist[to] = alt; prev[to] = u; }
      });
    }
    return { dist, prev };
  },

  path(prev, start, end) {
    const out = [end];
    while (out[0] !== start) {
      const p = prev[out[0]];
      if (p === undefined) return null;
      out.unshift(p);
    }
    return out;
  },

  pathLength(modeId, path) {
    const nodes = MODES[modeId].nodes;
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(nodes[path[i]].x - nodes[path[i - 1]].x, nodes[path[i]].y - nodes[path[i - 1]].y);
    return len * MODES[modeId].metersPerUnit;
  },

  describePath(modeId, path) {
    const mode = MODES[modeId];
    const names = [];
    path.forEach((n) => {
      const node = mode.nodes[n];
      let label;
      if (node.exit) { const ex = mode.exits.find((e) => e.id === n); label = `${ex.name} (${ex.desc})`; }
      else if (node.zone) label = mode.zones.find((z) => z.id === node.zone).name;
      else label = 'Main Aisle';
      if (names[names.length - 1] !== label) names.push(label);
    });
    return names;
  },

  routing(state, classKey, hazardZone) {
    const modeId = state.mode;
    const mode = MODES[modeId];
    const exitIds = mode.exits.map((e) => e.id);

    if (!hazardZone || classKey === 'normal') {
      return { type: 'none', exits: mode.exits.map((e) => ({ ...e, state: 'clear' })) };
    }

    const startNode = Object.keys(mode.nodes).find((n) => mode.nodes[n].zone === hazardZone);

    if (classKey === 'overheat' || classKey === 'mechanical') {
      return { type: 'isolation', hazardZone, restricted: [hazardZone], exits: mode.exits.map((e) => ({ ...e, state: 'clear' })) };
    }

    if (classKey === 'sos') {
      const origin = mode.responderOrigin;
      const { prev } = AI.dijkstra(modeId, origin, (u, v, d) => d);
      const path = AI.path(prev, origin, startNode) || [origin, startNode];
      const meters = AI.pathLength(modeId, path);
      return {
        type: 'responder', hazardZone, origin, path, names: AI.describePath(modeId, path),
        meters, etaSec: Math.round(meters / 2.2),
        exits: mode.exits.map((e) => ({ ...e, state: 'clear' }))
      };
    }

    // Fire: predict spread, mark nearest exit as unsafe, find safest alternative.
    const risk = AI.nodeRisk(modeId, hazardZone);
    const plain = AI.dijkstra(modeId, startNode, (u, v, d) => d);
    const unsafeExit = exitIds.slice().sort((a, b) => plain.dist[a] - plain.dist[b])[0];
    const weighted = (u, v, d) => d * (1 + 6 * (risk[v] || 0));
    const blocked = new Set([unsafeExit]);
    const safe = AI.dijkstra(modeId, startNode, weighted, blocked);
    const safeExit = exitIds.filter((e) => e !== unsafeExit).sort((a, b) => safe.dist[a] - safe.dist[b])[0];
    const path = AI.path(safe.prev, startNode, safeExit);
    const unsafePath = AI.path(plain.prev, startNode, unsafeExit);
    const meters = AI.pathLength(modeId, path);

    // Per-zone recommendations for everyone else in the building (avoid hazard zone nodes).
    const hazardNodes = new Set(Object.keys(mode.nodes).filter((n) => mode.nodes[n].zone === hazardZone));
    hazardNodes.add(unsafeExit);
    const zoneRoutes = mode.zones.filter((z) => z.id !== hazardZone).map((z) => {
      const s = Object.keys(mode.nodes).find((n) => mode.nodes[n].zone === z.id);
      const r = AI.dijkstra(modeId, s, weighted, hazardNodes);
      const ex = exitIds.filter((e) => e !== unsafeExit).sort((a, b) => r.dist[a] - r.dist[b])[0];
      const p = AI.path(r.prev, s, ex);
      return { zoneId: z.id, zoneName: z.name, exit: mode.exits.find((e) => e.id === ex), meters: p ? Math.round(AI.pathLength(modeId, p)) : null };
    });

    const zoneRisk = mode.zones.map((z) => {
      const nodes = Object.keys(mode.nodes).filter((n) => mode.nodes[n].zone === z.id);
      const r = Math.max(...nodes.map((n) => risk[n] || 0));
      const scale = classKey === 'fireActive' ? 1 : 0.55;
      return { zoneId: z.id, zoneName: z.name, risk: Math.round(r * scale * 100) };
    }).sort((a, b) => b.risk - a.risk);

    const unsafe = mode.exits.find((e) => e.id === unsafeExit);
    const safeEx = mode.exits.find((e) => e.id === safeExit);
    return {
      type: classKey === 'fireActive' ? 'evacuation' : 'precaution',
      hazardZone,
      unsafeExit: unsafe,
      unsafeReason: `Nearest exit (${Math.round(AI.pathLength(modeId, unsafePath))} m) — shares the corridor segment predicted to fill with smoke first.`,
      unsafePath,
      safeExit: safeEx,
      path,
      names: AI.describePath(modeId, path),
      meters,
      etaSec: Math.round(meters / 1.2),
      zoneRoutes,
      zoneRisk,
      exits: mode.exits.map((e) => ({ ...e, state: e.id === unsafeExit ? 'unsafe' : e.id === safeExit ? 'recommended' : 'available' }))
    };
  }
};
