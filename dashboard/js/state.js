/* ==========================================================================
   SENTRA — Central Application State
   A single state object + a tiny pub/sub store. UI reads from here only;
   data sources (mock today, ESP32/MQTT tomorrow) write into here only.
   ========================================================================== */
'use strict';

const HISTORY_LENGTH = 40;

const DEFAULT_SETTINGS = () => ({
  thresholds: THRESHOLD_KEYS.reduce((acc, key) => {
    const d = SENSOR_DEFS[key];
    acc[key] = { warn: d.warn, danger: d.danger };
    return acc;
  }, {}),
  sound: false,
  interval: 2000,
  notify: { dashboard: true, email: false, sms: false, criticalOnly: false }
});

function createSensorSet(modeId, zone) {
  const set = {};
  const now = Date.now();
  SENSOR_ORDER.forEach((key) => {
    const def = SENSOR_DEFS[key];
    if (key === 'cam') {
      set.cam = { key, value: 'NORMAL', status: 'normal', ts: now, history: [] };
      return;
    }
    const [lo, hi] = def.baseline[modeId];
    const base = U.rand(lo, hi);
    const history = [];
    for (let i = 0; i < HISTORY_LENGTH; i++) history.push(U.clamp(base + U.noise(def.noise * 1.5), def.min, def.max));
    set[key] = { key, value: base, base, target: null, status: 'normal', ts: now, history };
  });
  // DHT22 also reports air temperature (aux value).
  set.humidity.aux = set.temp.value + U.rand(-0.4, 0.4);
  return set;
}

function createModeState(modeId) {
  const mode = MODES[modeId];
  const sensors = {};
  const zones = mode.zones.map((z) => {
    sensors[z.id] = createSensorSet(modeId, z);
    return { id: z.id, name: z.name, abbr: z.abbr, kind: z.kind, occupancy: z.occupancy, status: 'normal', issues: [] };
  });
  const now = Date.now();
  const labels = [];
  for (let i = HISTORY_LENGTH - 1; i >= 0; i--) labels.push(U.time(now - i * 2000));
  return {
    mode: modeId,
    sensors,
    zones,
    devices: buildDevices(modeId),
    alerts: [],
    history: { labels, avgTemp: [], maxTemp: [], maxSmoke: [], maxEquip: [], maxVib: [] },
    history24h: generate24h(modeId, now),
    weekly: generateWeeklyIncidents(modeId),
    risk: 'LOW',
    systemStatus: 'OPERATIONAL',
    hardware: { led: 'green', buzzer: false, silenced: false },
    ai: null,
    simulation: { scenario: 'normal', zoneId: null, tick: 0, running: true, startedAt: now }
  };
}

function createInitialState({ modeId, theme, settings, user }) {
  const now = Date.now();
  return {
    theme,
    user,
    settings: settings || DEFAULT_SETTINGS(),
    incidents: seedIncidents(now),
    incidentCounters: { ...INCIDENT_COUNTERS },
    notifications: seedNotifications(now),
    ui: {
      view: 'dashboard',
      focusZone: null,
      selectedZone: null,
      incidentFilter: 'all',
      incidentSeverity: 'all',
      incidentQuery: '',
      incidentView: 'table',
      deviceQuery: '',
      deviceType: 'all',
      analyticsRange: 'live',
      demoCollapsed: false
    },
    ...createModeState(modeId)
  };
}

const Store = {
  state: null,
  listeners: new Set(),

  init(initial) { this.state = initial; },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  notify(reason) { this.listeners.forEach((fn) => fn(this.state, reason)); },

  /* Derived selectors */
  mode() { return MODES[this.state.mode]; },
  zone(id) { return this.state.zones.find((z) => z.id === id); },
  zoneName(id) { const z = MODES[this.state.mode].zones.find((zz) => zz.id === id); return z ? z.name : id; },
  modeIncidents() { return this.state.incidents.filter((i) => i.mode === this.state.mode).sort((a, b) => b.ts - a.ts); },
  modeNotifications() { return this.state.notifications.filter((n) => n.mode === this.state.mode).sort((a, b) => b.ts - a.ts); },
  unreadCount() { return this.modeNotifications().filter((n) => !n.read).length; },
  activeIncidents() { return this.modeIncidents().filter((i) => i.status !== 'Resolved'); },
  onlineDevices() { return this.state.devices.filter((d) => d.status !== 'Offline' && d.status !== 'Maintenance').length; },
  outOfRangeSensors() {
    let n = 0;
    Object.values(this.state.sensors).forEach((set) => Object.values(set).forEach((s) => { if (s.status !== 'normal') n++; }));
    return n;
  }
};
