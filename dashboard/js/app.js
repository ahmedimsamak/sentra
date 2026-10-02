/* ==========================================================================
   SENTRA — Application Controller
   Boot, auth gate, routing, event delegation and scenario orchestration
   (incidents, alerts, notifications, buzzer). No rendering markup here.
   ========================================================================== */
'use strict';

const STORAGE = { theme: 'sentra.theme', mode: 'sentra.mode', session: 'sentra.session', settings: 'sentra.settings' };
const VIEWS = NAV_ITEMS.map((n) => n.id);

const App = {
  dataSource: MockDataSource, // Swap with a real ESP32/MQTT/WebSocket source exposing start/stop/applyScenario.
  booted: false,

  /* ------------------------------------------------------------------ boot */
  init() {
    App.bindGlobalEvents();
    const session = U.storage.get(STORAGE.session, null);
    if (session && session.email === DEMO_USER.email) App.start(); else App.showLogin();
  },

  currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; },

  showLogin() {
    U.$('#app').hidden = true;
    U.$('#login-screen').hidden = false;
    UI.syncThemeControls();
    setTimeout(() => U.$('#login-email').focus(), 50);
  },

  login(email, password) {
    const err = U.$('#login-error');
    if (!email || !password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
    if (email.trim().toLowerCase() !== DEMO_USER.email || password !== DEMO_USER.password) {
      err.textContent = 'Invalid credentials. Use the demo account shown below.'; err.hidden = false; return;
    }
    err.hidden = true;
    U.storage.set(STORAGE.session, { email: DEMO_USER.email, at: Date.now() });
    App.start();
  },

  logout() {
    App.dataSource.stop();
    Buzzer.stop();
    U.storage.remove(STORAGE.session);
    UI.closeModal();
    U.$('#login-form').reset();
    App.showLogin();
  },

  start() {
    const savedSettings = U.storage.get(STORAGE.settings, null);
    const settings = DEFAULT_SETTINGS();
    if (savedSettings) {
      THRESHOLD_KEYS.forEach((k) => { if (savedSettings.thresholds && savedSettings.thresholds[k]) settings.thresholds[k] = savedSettings.thresholds[k]; });
      ['sound', 'interval'].forEach((k) => { if (savedSettings[k] !== undefined) settings[k] = savedSettings[k]; });
      if (savedSettings.notify) settings.notify = { ...settings.notify, ...savedSettings.notify };
    }
    const modeId = MODES[U.storage.get(STORAGE.mode, 'school')] ? U.storage.get(STORAGE.mode, 'school') : 'school';
    const { password, ...user } = DEMO_USER;
    Store.init(createInitialState({ modeId, theme: App.currentTheme(), settings, user }));
    if (window.innerWidth < 760) Store.state.ui.demoCollapsed = true; // keep phones uncluttered

    App.dataSource.primeHistory(Store.state);
    App.refreshDerived();

    U.$('#login-screen').hidden = true;
    U.$('#app').hidden = false;
    UI.mountChrome();
    ['#map-main', '#map-ai'].forEach((sel) => UI.mountMap(U.$(sel), modeId));

    if (!App.booted) {
      Store.subscribe(() => App.render());
      window.addEventListener('hashchange', App.route);
      window.addEventListener('resize', U.debounce(() => App.render(), 120));
      App.booted = true;
    }
    App.route();
    App.startStream();
  },

  startStream() {
    App.dataSource.start(Store.state, () => {
      App.refreshDerived();
      Store.notify('tick');
    });
  },

  /** Rules + AI run after every data change, regardless of data source. */
  refreshDerived() {
    Rules.evaluate(Store.state);
    AI.run(Store.state);
    Buzzer.sync();
  },

  /* ------------------------------------------------------------------ routing */
  route() {
    if (!Store.state) return;
    const hash = location.hash.replace(/^#\/?/, '');
    const view = VIEWS.includes(hash) ? hash : 'dashboard';
    if (hash !== view) { history.replaceState(null, '', `#/${view}`); }
    Store.state.ui.view = view;
    U.$$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
    document.body.classList.remove('sidebar-open');
    U.$('#notif-dropdown').hidden = true;
    U.$('#content').scrollTop = 0;
    window.scrollTo(0, 0);
    App.render();
  },

  render() {
    if (!Store.state || U.$('#app').hidden) return;
    UI.updateChrome();
    const view = UI.views[Store.state.ui.view];
    if (view) view.update();
  },

  /* ------------------------------------------------------------------ theme */
  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    U.storage.set(STORAGE.theme, theme);
    if (Store.state) Store.state.theme = theme;
    UI.syncThemeControls();
    App.render(); // charts re-read CSS variables
  },

  /* ------------------------------------------------------------------ mode */
  setMode(modeId) {
    const s = Store.state;
    if (!MODES[modeId] || s.mode === modeId) return;
    App.resolveActive('Monitoring context switched to another facility mode');
    Object.assign(s, createModeState(modeId));
    s.ui.focusZone = null;
    s.ui.selectedZone = null;
    s.ui.deviceType = 'all';
    U.storage.set(STORAGE.mode, modeId);
    App.dataSource.primeHistory(s);
    App.refreshDerived();
    UI.closeModal();
    App.startStream();
    UI.toast(`${MODES[modeId].label} active`, `${MODES[modeId].facility} · ${s.zones.length} zones monitored`, 'normal');
    Store.notify('mode');
  },

  /* ------------------------------------------------------------------ scenarios */
  triggerScenario(id) {
    const s = Store.state;
    const scenario = SCENARIOS[id];
    if (!scenario) return;

    const hadActive = s.alerts.length > 0;
    App.resolveActive(id === 'normal' ? 'Conditions returned to normal (demo control)' : 'Superseded by a new demo scenario');
    App.dataSource.applyScenario(s, id);
    App.refreshDerived();

    if (id === 'normal') {
      if (hadActive) App.notify({ level: 'normal', title: 'System returned to normal', msg: 'All readings back within thresholds. Active incidents resolved.' });
      UI.closeModal();
      UI.toast('Normal operation', 'All sensors returning to baseline values.', 'normal');
      Store.notify('scenario');
      return;
    }

    const zoneId = s.simulation.zoneId;
    const incident = App.createIncident(scenario, zoneId);
    const alert = { id: U.uid('alert'), scenario: id, zoneId, severity: scenario.severity, ts: Date.now(), acknowledged: false, incidentId: incident.id };
    s.alerts.unshift(alert);

    const set = s.sensors[zoneId];
    const key = { fireWarning: 'smoke', fireEmergency: 'smoke', overheat: 'equip', vibration: 'vibration', sos: 'sos' }[id];
    let msg = `${SENSOR_DEFS[key].model}: ${UI.formatReading(key, set[key])}. ${s.ai.classification} (${s.ai.confidence}%).`;
    if (s.ai.evac.type === 'evacuation') msg += ` Evacuate via ${s.ai.evac.safeExit.name}.`;
    App.notify({ level: scenario.tone === 'warning' ? 'warning' : 'danger', title: `${scenario.title} — ${Store.zoneName(zoneId)}`, msg, incidentId: incident.id });

    const popup = s.settings.notify.dashboard && !(s.settings.notify.criticalOnly && scenario.severity === 'Medium');
    if (popup && (scenario.severity === 'Critical' || scenario.severity === 'High')) App.openAlert(alert);
    else {
      UI.closeModal();
      UI.toast(`${scenario.title} — ${Store.zoneName(zoneId)}`, scenario.headline, 'warning');
    }
    Store.notify('scenario');
  },

  reset() {
    const s = Store.state;
    const fresh = createInitialState({ modeId: s.mode, theme: s.theme, settings: s.settings, user: s.user });
    fresh.ui = { ...fresh.ui, view: s.ui.view, incidentView: s.ui.incidentView, demoCollapsed: s.ui.demoCollapsed };
    Store.state = fresh;
    App.dataSource.primeHistory(Store.state);
    App.refreshDerived();
    UI.closeModal();
    App.startStream();
    UI.toast('Demo reset', 'Sensors, incidents, alerts and notifications restored to initial state.', 'normal');
    Store.notify('reset');
  },

  resolveActive(reason) {
    const s = Store.state;
    s.incidents.filter((i) => i.mode === s.mode && i.status !== 'Resolved').forEach((inc) => {
      inc.status = 'Resolved';
      inc.timeline.push({ ts: Date.now(), text: reason });
    });
    s.alerts = [];
  },

  createIncident(scenario, zoneId) {
    const s = Store.state;
    const now = Date.now();
    const set = s.sensors[zoneId];
    const n = s.incidentCounters[s.mode]++;
    const keys = SENSOR_ORDER.filter((k) => set[k].status !== 'normal' || ['smoke', 'temp', 'equip'].includes(k));
    const readings = Object.fromEntries(keys.map((k) => [k, { value: set[k].value, status: set[k].status }]));
    const primary = keys.filter((k) => set[k].status !== 'normal' && k !== 'cam');
    const timeline = [];
    primary.forEach((k) => timeline.push({ ts: now, text: `${SENSOR_DEFS[k].model} ${SENSOR_DEFS[k].label.toLowerCase()} ${STATUS[set[k].status].label.toLowerCase()}: ${UI.formatReading(k, set[k])}` }));
    if (set.cam.value !== 'NORMAL') timeline.push({ ts: now + 400, text: `ESP32-CAM visual analysis: ${set.cam.value}` });
    timeline.push({ ts: now + 900, text: `AI classification (simulated): ${s.ai.classification} — ${s.ai.confidence}%` });
    if (s.hardware.led !== 'green') timeline.push({ ts: now + 1200, text: `Local alarm: ${s.hardware.led.toUpperCase()} LED${s.hardware.buzzer ? ' + buzzer activated' : ''}` });
    const evac = s.ai.evac;
    if (evac.type === 'evacuation') timeline.push({ ts: now + 1500, text: `Evacuation route computed: ${evac.names.join(' › ')} (avoid ${evac.unsafeExit.name})` });
    if (evac.type === 'precaution') timeline.push({ ts: now + 1500, text: `Precautionary route prepared via ${evac.safeExit.name}` });
    if (evac.type === 'responder') timeline.push({ ts: now + 1500, text: `Responder route from ${Store.zoneName(evac.origin)} — ETA ~${evac.etaSec}s` });
    if (evac.type === 'isolation') timeline.push({ ts: now + 1500, text: `Zone isolation recommended for ${Store.zoneName(zoneId)}` });
    timeline.push({ ts: now + 1800, text: 'Dashboard notification dispatched to safety officer (simulated)' });

    const incident = {
      id: `INC-2026-${String(n).padStart(4, '0')}`,
      mode: s.mode, type: scenario.incidentType, scenario: scenario.id, zoneId,
      severity: scenario.severity, ts: now, status: 'Active', source: 'Live demo',
      responder: s.mode === 'school' ? 'Duty safety officer' : 'Shift safety supervisor',
      readings, ai: { classification: s.ai.classification, confidence: s.ai.confidence }, timeline
    };
    s.incidents.unshift(incident);
    return incident;
  },

  setIncidentStatus(id, status) {
    const s = Store.state;
    const inc = s.incidents.find((i) => i.id === id);
    if (!inc || inc.status === status) return;
    const text = { Acknowledged: 'Incident acknowledged by Safety Officer', Responding: 'Response team dispatched to location (simulated)', Resolved: 'Incident marked resolved by Safety Officer' }[status];
    inc.status = status;
    inc.timeline.push({ ts: Date.now(), text });
    const alert = s.alerts.find((a) => a.incidentId === id);
    if (alert && status !== 'Resolved') alert.acknowledged = true;
    if (status === 'Resolved' && alert) {
      // Resolving the live incident returns the demo to normal conditions.
      s.alerts = s.alerts.filter((a) => a !== alert);
      App.dataSource.applyScenario(s, 'normal');
      App.refreshDerived();
      App.notify({ level: 'normal', title: `${inc.id} resolved`, msg: `${inc.type} at ${Store.zoneName(inc.zoneId)} closed. Sensors returning to baseline.` });
    }
    UI.openModal(UI.incidentModal(inc));
    Store.notify('incident');
  },

  notify({ level, title, msg, incidentId }) {
    Store.state.notifications.unshift({ id: U.uid('n'), mode: Store.state.mode, level, title, msg, incidentId, ts: Date.now(), read: false });
  },

  openAlert(alert) {
    if (!alert) return;
    UI.openModal(UI.alertModal(alert), SEVERITY_TONE[alert.severity]);
    U.$('#modal-root').dataset.kind = 'alert';
  },

  acknowledgeAlert() {
    const s = Store.state;
    const alert = s.alerts[0];
    if (!alert) return;
    alert.acknowledged = true;
    const inc = s.incidents.find((i) => i.id === alert.incidentId);
    if (inc && inc.status === 'Active') { inc.status = 'Acknowledged'; inc.timeline.push({ ts: Date.now(), text: 'Alert acknowledged by Safety Officer' }); }
    UI.closeModal();
    UI.toast('Alert acknowledged', 'Incident status updated. Monitoring continues.', 'normal');
    Store.notify('ack');
  },

  saveSettings() {
    const { thresholds, sound, interval, notify } = Store.state.settings;
    U.storage.set(STORAGE.settings, { thresholds, sound, interval, notify });
  },

  /* ------------------------------------------------------------------ events */
  bindGlobalEvents() {
    U.$('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      App.login(U.$('#login-email').value, U.$('#login-password').value);
    });
    U.$('#fill-demo').addEventListener('click', () => {
      U.$('#login-email').value = DEMO_USER.email;
      U.$('#login-password').value = DEMO_USER.password;
      U.$('#login-error').hidden = true;
    });

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      const dropdown = U.$('#notif-dropdown');
      if (!e.target.closest('.notif-wrap') && !dropdown.hidden) dropdown.hidden = true;
      if (e.target.closest('#notif-btn')) {
        dropdown.hidden = !dropdown.hidden;
        if (!dropdown.hidden) UI.renderNotifDropdown();
        return;
      }
      if (e.target.closest('#demo-toggle')) {
        Store.state.ui.demoCollapsed = !Store.state.ui.demoCollapsed;
        UI.renderDemoPanel();
        return;
      }
      if (!el) return;
      App.handleAction(el.dataset.action, el, e);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        UI.closeModal();
        U.$('#notif-dropdown').hidden = true;
        document.body.classList.remove('sidebar-open');
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone[data-action]')) {
        e.preventDefault();
        App.handleAction('select-zone', e.target, e);
      }
    });

    U.$('#sidebar-scrim').addEventListener('click', () => document.body.classList.remove('sidebar-open'));

    U.$('#dash-zone-select').addEventListener('change', (e) => { Store.state.ui.focusZone = e.target.value; App.render(); });

    U.$('#inc-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      Store.state.ui.incidentFilter = b.dataset.filter; App.render();
    });
    U.$('#inc-view').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      Store.state.ui.incidentView = b.dataset.viewMode; App.render();
    });
    U.$('#inc-severity').addEventListener('change', (e) => { Store.state.ui.incidentSeverity = e.target.value; App.render(); });
    U.$('#inc-search').addEventListener('input', (e) => { Store.state.ui.incidentQuery = e.target.value; App.render(); });
    U.$('#dev-type').addEventListener('change', (e) => { Store.state.ui.deviceType = e.target.value; App.render(); });
    U.$('#dev-search').addEventListener('input', (e) => { Store.state.ui.deviceQuery = e.target.value; App.render(); });
    U.$('#an-range').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      Store.state.ui.analyticsRange = b.dataset.range; App.render();
    });

    U.$('#set-theme').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (b) App.setTheme(b.dataset.themeSet);
    });
    U.$('#set-sound').addEventListener('change', (e) => { Store.state.settings.sound = e.target.checked; App.saveSettings(); Buzzer.sync(); App.render(); });
    U.$('#set-interval').addEventListener('change', (e) => {
      Store.state.settings.interval = Number(e.target.value); App.saveSettings(); App.startStream();
      UI.toast('Update interval changed', `Simulated readings every ${Number(e.target.value) / 1000}s`, 'normal');
    });
    U.$('#set-pause').addEventListener('click', () => { Store.state.simulation.running = !Store.state.simulation.running; App.render(); });
    U.$('#set-notify').addEventListener('change', (e) => {
      const key = e.target.dataset.notify; if (!key) return;
      Store.state.settings.notify[key] = e.target.checked; App.saveSettings();
    });
    U.$('#threshold-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const next = {};
      const errEl = U.$('#th-error');
      for (const k of THRESHOLD_KEYS) {
        const warn = parseFloat(fd.get(`${k}-warn`));
        const danger = parseFloat(fd.get(`${k}-danger`));
        if (!Number.isFinite(warn) || !Number.isFinite(danger) || warn <= 0 || danger <= warn) {
          errEl.textContent = `${SENSOR_DEFS[k].label}: danger threshold must be greater than a positive warning threshold.`;
          errEl.hidden = false;
          return;
        }
        next[k] = { warn, danger };
      }
      errEl.hidden = true;
      Store.state.settings.thresholds = next;
      App.saveSettings();
      App.refreshDerived();
      UI.toast('Thresholds saved', 'Statuses, risk level and AI scoring updated.', 'normal');
      Store.notify('settings');
    });
  },

  handleAction(action, el, e) {
    const s = Store.state;
    switch (action) {
      case 'toggle-theme': App.setTheme(App.currentTheme() === 'dark' ? 'light' : 'dark'); break;
      case 'logout': App.logout(); break;
      case 'open-sidebar': document.body.classList.add('sidebar-open'); break;
      case 'set-mode': App.setMode(el.dataset.mode); break;
      case 'scenario': App.triggerScenario(el.dataset.scenario); break;
      case 'reset': App.reset(); break;
      case 'toggle-sound':
        s.settings.sound = !s.settings.sound; App.saveSettings(); Buzzer.sync(); App.render(); break;
      case 'focus-zone': s.ui.focusZone = el.dataset.zone; App.render(); break;
      case 'select-zone':
        s.ui.selectedZone = el.dataset.zone;
        if (s.ui.view !== 'monitoring') location.hash = '#/monitoring'; else App.render();
        break;
      case 'open-incident': {
        const inc = s.incidents.find((i) => i.id === el.dataset.id);
        if (inc) UI.openModal(UI.incidentModal(inc));
        break;
      }
      case 'incident-status': App.setIncidentStatus(el.dataset.id, el.dataset.status); break;
      case 'open-alert': App.openAlert(s.alerts[0]); break;
      case 'ack-alert': App.acknowledgeAlert(); break;
      case 'silence':
        s.hardware.silenced = true; App.refreshDerived();
        if (U.$('#modal-root').dataset.kind === 'alert') App.openAlert(s.alerts[0]);
        Store.notify('silence'); break;
      case 'go-map':
        s.ui.selectedZone = s.simulation.zoneId; UI.closeModal(); location.hash = '#/monitoring'; break;
      case 'close-modal': UI.closeModal(); break;
      case 'mark-read':
        Store.modeNotifications().forEach((n) => { n.read = true; }); App.render(); break;
      case 'open-notif': {
        const n = s.notifications.find((x) => x.id === el.dataset.id);
        if (!n) break;
        n.read = true;
        U.$('#notif-dropdown').hidden = true;
        const inc = n.incidentId && s.incidents.find((i) => i.id === n.incidentId);
        if (inc) UI.openModal(UI.incidentModal(inc));
        App.render();
        break;
      }
      case 'reset-thresholds': {
        s.settings.thresholds = DEFAULT_SETTINGS().thresholds;
        s.settings._version = String(Date.now());
        App.saveSettings(); App.refreshDerived();
        UI.toast('Defaults restored', 'Alert thresholds reset to factory values.', 'normal');
        Store.notify('settings');
        break;
      }
      case 'restart-demo': App.reset(); break;
      default: break;
    }
  }
};

/* Simulated buzzer: short beeps through Web Audio while the alarm is active. */
const Buzzer = {
  ctx: null, timer: null,
  sync() {
    const s = Store.state;
    const on = s && s.hardware.buzzer && s.settings.sound && !U.$('#app').hidden;
    if (on && !this.timer) this.start(); else if (!on && this.timer) this.stop();
  },
  start() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const beep = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = Store.state.risk === 'CRITICAL' ? 2400 : 1800;
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    };
    beep();
    this.timer = setInterval(beep, Store.state.risk === 'CRITICAL' ? 600 : 1100);
  },
  stop() { clearInterval(this.timer); this.timer = null; }
};

document.addEventListener('DOMContentLoaded', App.init);
