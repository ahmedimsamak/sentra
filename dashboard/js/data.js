/* ==========================================================================
   SENTRA — Mock Data & Static Configuration
   Everything here is simulated. Replace with facility configuration served
   by a real backend (REST: GET /api/facilities/:id) when hardware is live.
   ========================================================================== */
'use strict';

const DEMO_USER = {
  email: 'admin@sentra.demo',
  password: 'Sentra@2026',
  name: 'Safety Officer',
  initials: 'SO',
  role: 'Facility Safety Administrator'
};

const STATUS = {
  normal: { label: 'Normal', rank: 0 },
  warning: { label: 'Warning', rank: 1 },
  danger: { label: 'Dangerous', rank: 2 }
};

const RISK_LEVELS = {
  LOW: { label: 'LOW', rank: 0, cls: 'normal' },
  ELEVATED: { label: 'ELEVATED', rank: 1, cls: 'warning' },
  HIGH: { label: 'HIGH', rank: 2, cls: 'danger' },
  CRITICAL: { label: 'CRITICAL', rank: 3, cls: 'critical' }
};

/* Sensor catalogue. `warn` / `danger` are default thresholds (editable in Settings).
   `low` thresholds are used for humidity (too dry during a fire). */
const SENSOR_DEFS = {
  smoke: {
    key: 'smoke', model: 'MQ-2', label: 'Smoke / Gas', icon: 'wind', unit: 'ppm', decimals: 0,
    warn: 400, danger: 700, noise: 10, min: 0, max: 1500,
    baseline: { school: [170, 250], factory: [220, 310] }
  },
  temp: {
    key: 'temp', model: 'DS18B20', label: 'Ambient Temperature', icon: 'thermo', unit: '°C', decimals: 1,
    warn: 35, danger: 50, noise: 0.18, min: -10, max: 120,
    baseline: { school: [22, 25], factory: [26, 30] }
  },
  equip: {
    key: 'equip', model: 'MLX90614', label: 'Equipment Temperature', icon: 'zap', unit: '°C', decimals: 1,
    warn: 75, danger: 95, noise: 0.45, min: 0, max: 200,
    baseline: { school: [31, 38], factory: [48, 60] }
  },
  humidity: {
    key: 'humidity', model: 'DHT22', label: 'Temp / Humidity', icon: 'droplet', unit: '%RH', decimals: 0,
    warn: 70, danger: 85, lowWarn: 25, lowDanger: 12, noise: 0.6, min: 0, max: 100,
    baseline: { school: [42, 52], factory: [38, 48] }
  },
  light: {
    key: 'light', model: 'BH1750', label: 'Light Level', icon: 'sun', unit: 'lux', decimals: 0,
    warn: 1500, danger: 2500, noise: 9, min: 0, max: 5000,
    baseline: { school: [320, 480], factory: [450, 640] }
  },
  vibration: {
    key: 'vibration', model: 'MPU6050', label: 'Vibration', icon: 'activity', unit: 'g', decimals: 2,
    warn: 0.5, danger: 1.0, noise: 0.012, min: 0, max: 4,
    baseline: { school: [0.02, 0.06], factory: [0.08, 0.2] }
  },
  sos: {
    key: 'sos', model: 'SOS Button', label: 'SOS Button', icon: 'radio', unit: '', decimals: 0,
    warn: 1, danger: 1, noise: 0, min: 0, max: 1, baseline: { school: [0, 0], factory: [0, 0] }
  },
  cam: {
    key: 'cam', model: 'ESP32-CAM', label: 'Camera Analysis', icon: 'camera', unit: '', decimals: 0,
    noise: 0, baseline: { school: [0, 0], factory: [0, 0] }
  }
};

const SENSOR_ORDER = ['smoke', 'temp', 'equip', 'humidity', 'light', 'vibration', 'sos', 'cam'];
const THRESHOLD_KEYS = ['smoke', 'temp', 'equip', 'humidity', 'vibration', 'light'];

/* --------------------------------------------------------------------------
   Facility layouts. Map coordinates use a 1000 x 560 SVG viewBox.
   `nodes` + `edges` form the walking graph used by evacuation routing.
   -------------------------------------------------------------------------- */
const MODES = {
  school: {
    id: 'school',
    label: 'School Mode',
    icon: 'school',
    facility: 'Riverside Secondary School',
    building: 'Main Building · Ground Floor',
    metersPerUnit: 0.08,
    responderOrigin: 'main-entrance',
    zones: [
      { id: 'classroom-101', name: 'Classroom 101', abbr: 'C101', kind: 'Classroom', occupancy: 28, rect: [40, 40, 220, 170] },
      { id: 'classroom-102', name: 'Classroom 102', abbr: 'C102', kind: 'Classroom', occupancy: 26, rect: [280, 40, 220, 170] },
      { id: 'science-lab', name: 'Science Lab', abbr: 'SCI', kind: 'Laboratory', occupancy: 22, rect: [520, 40, 220, 170] },
      { id: 'art-room', name: 'Art Room', abbr: 'ART', kind: 'Workshop (kiln)', occupancy: 18, rect: [760, 40, 200, 170] },
      { id: 'corridor', name: 'Corridor', abbr: 'COR', kind: 'Circulation', occupancy: 12, rect: [40, 230, 920, 90] },
      { id: 'cafeteria', name: 'Cafeteria', abbr: 'CAF', kind: 'Dining / Kitchen', occupancy: 64, rect: [40, 340, 560, 180] },
      { id: 'main-entrance', name: 'Main Entrance', abbr: 'ENT', kind: 'Reception / Lobby', occupancy: 9, rect: [620, 340, 340, 180] }
    ],
    nodes: {
      'classroom-101': { x: 150, y: 125, zone: 'classroom-101' },
      'classroom-102': { x: 390, y: 125, zone: 'classroom-102' },
      'science-lab': { x: 630, y: 125, zone: 'science-lab' },
      'art-room': { x: 860, y: 125, zone: 'art-room' },
      c1: { x: 150, y: 275, zone: 'corridor' },
      c2: { x: 390, y: 275, zone: 'corridor' },
      c3: { x: 630, y: 275, zone: 'corridor' },
      c4: { x: 860, y: 275, zone: 'corridor' },
      cafeteria: { x: 320, y: 430, zone: 'cafeteria' },
      'main-entrance': { x: 790, y: 430, zone: 'main-entrance' },
      'exit-a': { x: 790, y: 540, zone: null, exit: true },
      'exit-b': { x: 14, y: 275, zone: null, exit: true },
      'exit-c': { x: 986, y: 275, zone: null, exit: true },
      'exit-d': { x: 180, y: 540, zone: null, exit: true }
    },
    edges: [
      ['classroom-101', 'c1'], ['classroom-102', 'c2'], ['science-lab', 'c3'], ['art-room', 'c4'],
      ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'],
      ['c1', 'exit-b'], ['c4', 'exit-c'],
      ['cafeteria', 'c2'], ['cafeteria', 'exit-d'],
      ['main-entrance', 'c4'], ['main-entrance', 'exit-a']
    ],
    exits: [
      { id: 'exit-a', name: 'Exit A', desc: 'Main Entrance Doors' },
      { id: 'exit-b', name: 'Exit B', desc: 'West Stairwell' },
      { id: 'exit-c', name: 'Exit C', desc: 'East Stairwell' },
      { id: 'exit-d', name: 'Exit D', desc: 'Cafeteria Service Door' }
    ],
    walkways: []
  },

  factory: {
    id: 'factory',
    label: 'Factory Mode',
    icon: 'factory',
    facility: 'Unit 3 Manufacturing Plant',
    building: 'Production Hall · Level 0',
    metersPerUnit: 0.12,
    responderOrigin: 'control-room',
    zones: [
      { id: 'production-a', name: 'Production A', abbr: 'PRA', kind: 'Assembly line', occupancy: 24, rect: [40, 40, 300, 200] },
      { id: 'production-b', name: 'Production B', abbr: 'PRB', kind: 'Welding line', occupancy: 19, rect: [360, 40, 300, 200] },
      { id: 'electrical-room', name: 'Electrical Room', abbr: 'ELC', kind: 'Switchgear', occupancy: 1, rect: [680, 40, 130, 200] },
      { id: 'control-room', name: 'Control Room', abbr: 'CTL', kind: 'Operations', occupancy: 4, rect: [830, 40, 130, 200] },
      { id: 'machine-1', name: 'Machine Area 1', abbr: 'MA1', kind: 'CNC machining', occupancy: 8, rect: [40, 320, 280, 200] },
      { id: 'machine-2', name: 'Machine Area 2', abbr: 'MA2', kind: 'Press line', occupancy: 7, rect: [340, 320, 260, 200] },
      { id: 'storage', name: 'Storage', abbr: 'STR', kind: 'Raw materials', occupancy: 2, rect: [620, 320, 150, 200] },
      { id: 'loading-area', name: 'Loading Area', abbr: 'LDA', kind: 'Dock', occupancy: 6, rect: [790, 320, 170, 200] }
    ],
    nodes: {
      'production-a': { x: 190, y: 140, zone: 'production-a' },
      'production-b': { x: 510, y: 140, zone: 'production-b' },
      'electrical-room': { x: 745, y: 140, zone: 'electrical-room' },
      'control-room': { x: 895, y: 140, zone: 'control-room' },
      a1: { x: 190, y: 280, zone: null },
      a2: { x: 510, y: 280, zone: null },
      a3: { x: 745, y: 280, zone: null },
      a4: { x: 895, y: 280, zone: null },
      'machine-1': { x: 180, y: 420, zone: 'machine-1' },
      'machine-2': { x: 470, y: 420, zone: 'machine-2' },
      storage: { x: 695, y: 420, zone: 'storage' },
      'loading-area': { x: 875, y: 420, zone: 'loading-area' },
      'exit-w': { x: 14, y: 280, zone: null, exit: true },
      'exit-n': { x: 510, y: 16, zone: null, exit: true },
      'exit-e': { x: 986, y: 140, zone: null, exit: true },
      'exit-s': { x: 875, y: 544, zone: null, exit: true }
    },
    edges: [
      ['production-a', 'a1'], ['production-b', 'a2'], ['electrical-room', 'a3'], ['control-room', 'a4'],
      ['machine-1', 'a1'], ['machine-2', 'a2'], ['storage', 'a3'], ['loading-area', 'a4'],
      ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'],
      ['production-a', 'production-b'],
      ['a1', 'exit-w'], ['production-b', 'exit-n'], ['control-room', 'exit-e'], ['loading-area', 'exit-s']
    ],
    exits: [
      { id: 'exit-w', name: 'Exit W', desc: 'West Personnel Door' },
      { id: 'exit-n', name: 'Exit N', desc: 'Production B North Door' },
      { id: 'exit-e', name: 'Exit E', desc: 'Control Room Fire Exit' },
      { id: 'exit-s', name: 'Exit S', desc: 'Loading Dock' }
    ],
    walkways: [{ rect: [40, 255, 920, 50], label: 'MAIN AISLE' }]
  }
};

/* --------------------------------------------------------------------------
   Demo scenarios. Targets are applied to the affected zone; `spill` applies a
   fraction of the deviation to directly adjacent zones (smoke/heat spread).
   -------------------------------------------------------------------------- */
const SCENARIOS = {
  normal: {
    id: 'normal', label: 'Normal', icon: 'check', tone: 'normal',
    description: 'All sensors return to baseline operating values.'
  },
  fireWarning: {
    id: 'fireWarning', label: 'Fire Warning', icon: 'wind', tone: 'warning',
    zone: { school: 'science-lab', factory: 'production-a' },
    targets: { smoke: 485, temp: 37.4, light: 820, humidity: 36 },
    spill: { smoke: 0.18, temp: 0.15 },
    cam: 'NORMAL',
    incidentType: 'Smoke Detected', severity: 'Medium',
    title: 'Fire Warning', headline: 'Elevated smoke concentration detected'
  },
  fireEmergency: {
    id: 'fireEmergency', label: 'Fire Emergency', icon: 'flame', tone: 'danger',
    zone: { school: 'science-lab', factory: 'production-a' },
    targets: { smoke: 880, temp: 63.5, equip: 79, humidity: 19, light: 1880 },
    spill: { smoke: 0.42, temp: 0.3, humidity: 0.3 },
    cam: 'POSSIBLE FIRE',
    incidentType: 'Fire', severity: 'Critical',
    title: 'Fire Emergency', headline: 'Fire indicators confirmed by multiple sensors'
  },
  overheat: {
    id: 'overheat', label: 'Equipment Overheating', icon: 'zap', tone: 'danger',
    zone: { school: 'art-room', factory: 'electrical-room' },
    targets: { equip: 104, temp: 36.2 },
    spill: { temp: 0.12 },
    cam: 'NORMAL',
    incidentType: 'Equipment Overheating', severity: 'High',
    title: 'Equipment Overheating', headline: 'Equipment surface temperature above safe limit'
  },
  vibration: {
    id: 'vibration', label: 'High Vibration', icon: 'activity', tone: 'danger',
    zone: { school: 'cafeteria', factory: 'machine-1' },
    targets: { vibration: 1.46, equip: 71 },
    spill: { vibration: 0.25 },
    cam: 'NORMAL',
    incidentType: 'Abnormal Vibration', severity: 'High',
    title: 'High Vibration', headline: 'Abnormal machine vibration detected'
  },
  sos: {
    id: 'sos', label: 'SOS Emergency', icon: 'radio', tone: 'danger',
    zone: { school: 'classroom-102', factory: 'loading-area' },
    targets: { sos: 1 },
    spill: {},
    cam: 'EMERGENCY',
    incidentType: 'SOS Emergency', severity: 'Critical',
    title: 'SOS Emergency', headline: 'Manual SOS button activated'
  }
};

const SCENARIO_ORDER = ['normal', 'fireWarning', 'fireEmergency', 'overheat', 'vibration', 'sos'];

/* --------------------------------------------------------------------------
   Device inventory template (one set per zone + shared infrastructure).
   -------------------------------------------------------------------------- */
const DEVICE_TEMPLATES = [
  { prefix: 'SN', type: 'ESP32 Sensor Node', sensors: 'MQ-2 · DS18B20 · DHT22 · BH1750', firmware: 'v1.4.2' },
  { prefix: 'EQ', type: 'Equipment Monitor', sensors: 'MLX90614 · MPU6050', firmware: 'v1.3.0' },
  { prefix: 'CAM', type: 'ESP32-CAM', sensors: 'OV2640 camera', firmware: 'v0.9.8' },
  { prefix: 'SOS', type: 'SOS Button Unit', sensors: 'Latching push button', firmware: 'v1.1.0' }
];

function buildDevices(modeId) {
  const mode = MODES[modeId];
  const devices = [];
  mode.zones.forEach((zone, zi) => {
    DEVICE_TEMPLATES.forEach((tpl, ti) => {
      devices.push({
        id: `${tpl.prefix}-${zone.abbr}-01`,
        type: tpl.type,
        sensors: tpl.sensors,
        zoneId: zone.id,
        firmware: tpl.firmware,
        baseStatus: 'Online',
        status: 'Online',
        signal: -48 - ((zi * 7 + ti * 5) % 24),
        lastSeen: Date.now() - (zi + ti) * 900
      });
    });
  });
  const hub = mode.responderOrigin;
  devices.push(
    { id: 'GW-01', type: 'ESP32 Edge Gateway', sensors: 'Wi-Fi · MQTT bridge', zoneId: hub, firmware: 'v2.0.1', baseStatus: 'Online', status: 'Online', signal: -41, lastSeen: Date.now() },
    { id: 'ALM-01', type: 'Alarm Controller', sensors: 'Red/Green LED · Piezo buzzer', zoneId: hub, firmware: 'v1.2.4', baseStatus: 'Online', status: 'Online', signal: -44, lastSeen: Date.now() }
  );
  // Realistic imperfections for the demo inventory.
  const lowBattery = devices.find((d) => d.id === `SOS-${mode.zones[4].abbr}-01`);
  if (lowBattery) { lowBattery.baseStatus = 'Warning'; lowBattery.status = 'Warning'; lowBattery.note = 'Battery 18%'; }
  const maint = devices.find((d) => d.id === `EQ-${mode.zones[mode.zones.length - 1].abbr}-01`);
  if (maint) { maint.baseStatus = 'Maintenance'; maint.status = 'Maintenance'; maint.note = 'Scheduled calibration'; maint.firmware = 'v1.2.9'; }
  return devices;
}

/* --------------------------------------------------------------------------
   Seed incident history (all resolved) — relative to page load time.
   -------------------------------------------------------------------------- */
function seedIncidents(now) {
  const H = 3600 * 1000;
  const mk = (o) => ({
    status: 'Resolved', source: 'Simulated history', responder: 'Safety officer on duty', ...o,
    timeline: o.timeline.map((t) => ({ ts: o.ts + t[0] * 1000, text: t[1] }))
  });
  return [
    mk({ id: 'INC-2026-0421', mode: 'school', type: 'Abnormal Vibration', zoneId: 'cafeteria', severity: 'Low', ts: now - 20 * H,
      ai: { classification: 'Mechanical Fault (Vibration)', confidence: 71 },
      readings: { vibration: 0.58, equip: 52.1, temp: 24.6, smoke: 214 },
      timeline: [[0, 'MPU6050 vibration exceeded 0.5 g on kitchen exhaust fan'], [40, 'Alert acknowledged by facilities team'], [2700, 'Fan belt re-tensioned, readings normal'], [2760, 'Incident resolved']] }),
    mk({ id: 'INC-2026-0418', mode: 'school', type: 'Smoke Detected', zoneId: 'science-lab', severity: 'Medium', ts: now - 50 * H,
      ai: { classification: 'Fire — Early Stage / Smoke', confidence: 64 },
      readings: { smoke: 455, temp: 29.8, humidity: 41, light: 510 },
      timeline: [[0, 'MQ-2 smoke 455 ppm above warning threshold'], [25, 'Teacher confirmed Bunsen burner experiment'], [600, 'Ventilation increased, smoke back to baseline'], [640, 'Incident resolved — no fire']] }),
    mk({ id: 'INC-2026-0412', mode: 'school', type: 'SOS Emergency', zoneId: 'cafeteria', severity: 'High', ts: now - 5 * 24 * H,
      ai: { classification: 'Personal Emergency (SOS)', confidence: 92 },
      readings: { sos: 1, temp: 23.9, smoke: 198 },
      timeline: [[0, 'SOS button pressed in Cafeteria'], [18, 'School nurse dispatched'], [140, 'Nurse on scene — student medical assistance'], [1500, 'Incident resolved']] }),
    mk({ id: 'INC-2026-0405', mode: 'school', type: 'Equipment Overheating', zoneId: 'art-room', severity: 'Medium', ts: now - 8 * 24 * H,
      ai: { classification: 'Equipment Overheating', confidence: 81 },
      readings: { equip: 88.4, temp: 31.2, smoke: 240 },
      timeline: [[0, 'MLX90614 kiln surface 88 °C above warning threshold'], [60, 'Kiln cycle paused by art teacher'], [1800, 'Surface cooled to 45 °C'], [1860, 'Incident resolved']] }),
    mk({ id: 'INC-2026-0736', mode: 'factory', type: 'Abnormal Vibration', zoneId: 'machine-2', severity: 'Medium', ts: now - 30 * H,
      ai: { classification: 'Mechanical Fault (Vibration)', confidence: 78 },
      readings: { vibration: 0.82, equip: 66.3, temp: 29.1, smoke: 280 },
      timeline: [[0, 'Press line vibration 0.82 g'], [90, 'Line supervisor acknowledged'], [3600, 'Worn bearing replaced'], [3700, 'Incident resolved']] }),
    mk({ id: 'INC-2026-0733', mode: 'factory', type: 'Equipment Overheating', zoneId: 'electrical-room', severity: 'High', ts: now - 3 * 24 * H,
      ai: { classification: 'Equipment Overheating', confidence: 88 },
      readings: { equip: 97.6, temp: 38.4, smoke: 330 },
      timeline: [[0, 'Switchgear busbar 97.6 °C (MLX90614)'], [45, 'Electrician dispatched'], [600, 'Load redistributed to feeder 2'], [2400, 'Incident resolved']] }),
    mk({ id: 'INC-2026-0729', mode: 'factory', type: 'Smoke Detected', zoneId: 'production-b', severity: 'Medium', ts: now - 6 * 24 * H,
      ai: { classification: 'Fire — Early Stage / Smoke', confidence: 58 },
      readings: { smoke: 512, temp: 33.5, light: 1320 },
      timeline: [[0, 'MQ-2 smoke 512 ppm on welding line'], [30, 'Extraction fan found switched off'], [420, 'Extraction restored, readings normal'], [480, 'Incident resolved — welding fumes']] }),
    mk({ id: 'INC-2026-0718', mode: 'factory', type: 'SOS Emergency', zoneId: 'loading-area', severity: 'High', ts: now - 9 * 24 * H,
      ai: { classification: 'Personal Emergency (SOS)', confidence: 93 },
      readings: { sos: 1, vibration: 0.21, temp: 27.2 },
      timeline: [[0, 'SOS button pressed at Loading Area'], [20, 'First aider dispatched from Control Room'], [150, 'Minor hand injury treated'], [1300, 'Incident resolved']] })
  ];
}

const INCIDENT_COUNTERS = { school: 422, factory: 737 };

function seedNotifications(now) {
  const M = 60 * 1000;
  return [
    { id: 'n-seed-1', mode: 'school', level: 'normal', title: 'Daily self-test passed', msg: 'All 30 simulated devices responded to the 07:00 health check.', ts: now - 95 * M, read: true },
    { id: 'n-seed-2', mode: 'school', level: 'warning', title: 'Low battery — SOS-COR-01', msg: 'Corridor SOS button battery at 18%. Replace within 7 days.', ts: now - 42 * M, read: false },
    { id: 'n-seed-3', mode: 'factory', level: 'normal', title: 'Shift handover check complete', msg: 'All 34 simulated devices online at shift change.', ts: now - 80 * M, read: true },
    { id: 'n-seed-4', mode: 'factory', level: 'warning', title: 'Calibration due — EQ-LDA-01', msg: 'Loading Area equipment monitor is in scheduled maintenance.', ts: now - 35 * M, read: false }
  ];
}

/** 24-hour mock history (30-min buckets) for Analytics. Deterministic per mode. */
function generate24h(modeId, now) {
  const rng = U.seeded(modeId === 'school' ? 1207 : 3319);
  const labels = [], temp = [], smoke = [], equip = [], vibration = [];
  const start = now - 24 * 3600 * 1000;
  for (let i = 0; i < 48; i++) {
    const ts = start + i * 30 * 60 * 1000;
    const hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    const active = modeId === 'school' ? (hour >= 7.5 && hour <= 15.5 ? 1 : 0) : (hour >= 6 && hour <= 22 ? 1 : 0.35);
    const daylight = Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
    labels.push(U.shortTime(ts));
    if (modeId === 'school') {
      temp.push(+(21 + 3.2 * daylight + active * 0.8 + rng() * 0.6).toFixed(1));
      smoke.push(Math.round(170 + active * 55 + rng() * 30 + (hour > 11.5 && hour < 13 ? 60 : 0)));
      equip.push(+(29 + active * 7 + rng() * 2.5).toFixed(1));
      vibration.push(+(0.02 + active * 0.04 + rng() * 0.02 + (hour > 11 && hour < 14 ? 0.08 : 0)).toFixed(3));
    } else {
      temp.push(+(24 + 3 * daylight + active * 3 + rng() * 0.9).toFixed(1));
      smoke.push(Math.round(210 + active * 90 + rng() * 45));
      equip.push(+(38 + active * 21 + rng() * 5).toFixed(1));
      vibration.push(+(0.04 + active * 0.16 + rng() * 0.05).toFixed(3));
    }
  }
  return { labels, temp, smoke, equip, vibration };
}

/** Incidents per day by category for the last 7 days (mock history). */
function generateWeeklyIncidents(modeId) {
  return modeId === 'school'
    ? { fire: [0, 1, 0, 0, 0, 1, 0], equipment: [0, 0, 1, 0, 0, 0, 0], vibration: [1, 0, 0, 0, 0, 0, 1], sos: [0, 0, 1, 0, 0, 0, 0] }
    : { fire: [0, 1, 0, 0, 0, 0, 0], equipment: [1, 0, 0, 1, 0, 0, 0], vibration: [0, 0, 1, 0, 1, 1, 0], sos: [1, 0, 0, 0, 0, 0, 0] };
}
