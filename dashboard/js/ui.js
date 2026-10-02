/* ==========================================================================
   SENTRA — UI Rendering
   Reads from Store.state and writes DOM. Contains no simulation logic.
   User interactions are expressed as data-action attributes handled in app.js.
   ========================================================================== */
'use strict';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'monitoring', label: 'Live Monitoring', icon: 'map' },
  { id: 'incidents', label: 'Incidents', icon: 'alert' },
  { id: 'devices', label: 'Devices', icon: 'cpu' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'ai', label: 'AI Insights', icon: 'ai' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

const SEVERITY_TONE = { Critical: 'critical', High: 'danger', Medium: 'warning', Low: 'info' };
const INCIDENT_STATUS_TONE = { Active: 'danger', Acknowledged: 'warning', Responding: 'info', Resolved: 'normal' };
const DEVICE_STATUS_TONE = { Online: 'normal', Alert: 'danger', Warning: 'warning', Maintenance: 'info', Offline: 'muted' };

const UI = {
  /* ------------------------------------------------------------------ helpers */

  /** Set innerHTML only when content actually changed (keeps hover/scroll/animations stable). */
  set(el, html) {
    if (!el) return;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  },

  badge(status) { return `<span class="badge badge--${status}">${STATUS[status].label}</span>`; },
  tone(label, tone) { return `<span class="badge badge--${tone}">${U.esc(label)}</span>`; },
  severity(sev) { return UI.tone(sev, SEVERITY_TONE[sev] || 'info'); },
  riskBadge(risk) { return `<span class="badge badge--${RISK_LEVELS[risk].cls}">${risk}</span>`; },

  valueParts(key, s) {
    const def = SENSOR_DEFS[key];
    if (key === 'cam') return { value: s.value, unit: '' };
    if (key === 'sos') return { value: s.value >= 1 ? 'PRESSED' : 'IDLE', unit: '' };
    return { value: U.num(s.value, def.decimals), unit: def.unit };
  },

  formatReading(key, s) {
    const p = UI.valueParts(key, s);
    return p.unit ? `${p.value} ${p.unit}` : p.value;
  },

  trend(s, key) {
    if (!s.history || s.history.length < 6 || key === 'sos') return '';
    const def = SENSOR_DEFS[key];
    const delta = s.history[s.history.length - 1] - s.history[s.history.length - 6];
    const eps = def.noise * 3 || 0.01;
    if (Math.abs(delta) < eps) return '<span class="trend">→ stable</span>';
    const up = delta > 0;
    return `<span class="trend ${up ? 'trend--up' : 'trend--down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${U.num(delta, def.decimals)} ${def.unit}</span>`;
  },

  empty(text, icon = 'check') {
    return `<div class="empty">${U.icon(icon)}<span>${U.esc(text)}</span></div>`;
  },

  /* ------------------------------------------------------------------ chrome */

  mountChrome() {
    const s = Store.state;
    U.$('#nav').innerHTML = NAV_ITEMS.map((n) => `
      <a href="#/${n.id}" class="nav-link" data-nav="${n.id}">${U.icon(n.icon)}<span>${n.label}</span><em class="nav-badge" data-badge="${n.id}" hidden></em></a>`).join('');
    U.$('#menu-btn').innerHTML = U.icon('menu');
    U.$('#notif-btn').innerHTML = `${U.icon('bell')}<span class="count" id="notif-count" hidden></span>`;
    U.$('#risk-pill').innerHTML = '<span class="risk-dot"></span><span class="risk-label">Risk</span><strong id="risk-value">LOW</strong>';
    U.$('#hw-indicators').innerHTML = `
      <div class="hw" title="Alarm LED (simulated)"><span class="led" id="hw-led"></span><span class="hw-label">LED</span></div>
      <div class="hw" title="Buzzer (simulated)" id="hw-buzzer">${U.icon('volume')}<span class="hw-label">Buzzer</span></div>`;
    U.$('#user-chip').innerHTML = `<span class="avatar">${s.user.initials}</span><span class="user-meta"><strong>${U.esc(s.user.name)}</strong><small>${U.esc(s.user.email)}</small></span>
      <button class="icon-btn icon-btn--sm" data-action="logout" aria-label="Sign out" title="Sign out">${U.icon('logout')}</button>`;
    U.$('#demo-chev').innerHTML = U.icon('chevron');
    U.$('#inc-search-icon').innerHTML = U.icon('search');
    U.$('#dev-search-icon').innerHTML = U.icon('search');
    U.$('#ai-notice-icon').innerHTML = U.icon('info');
    UI.renderDemoPanel();
    UI.renderModeSwitch();
    UI.syncThemeControls();
  },

  renderModeSwitch() {
    const html = Object.values(MODES).map((m) => `<button data-action="set-mode" data-mode="${m.id}" class="${Store.state.mode === m.id ? 'is-active' : ''}" role="tab" aria-selected="${Store.state.mode === m.id}">${U.icon(m.icon)}<span>${m.id === 'school' ? 'School' : 'Factory'}</span></button>`).join('');
    UI.set(U.$('#mode-switch'), html);
    UI.set(U.$('#set-mode'), html);
  },

  syncThemeControls() {
    const theme = Store.state ? Store.state.theme : document.documentElement.getAttribute('data-theme');
    U.$$('.theme-icon').forEach((el) => { el.textContent = theme === 'dark' ? '☀️' : '🌙'; });
    U.$$('.theme-toggle').forEach((el) => el.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'));
    U.$$('#set-theme button').forEach((b) => b.classList.toggle('is-active', b.dataset.themeSet === theme));
  },

  renderDemoPanel() {
    const s = Store.state;
    const active = s.simulation.scenario;
    const body = SCENARIO_ORDER.map((id) => {
      const sc = SCENARIOS[id];
      return `<button class="demo-btn demo-btn--${sc.tone} ${active === id ? 'is-active' : ''}" data-action="scenario" data-scenario="${id}">${U.icon(sc.icon)}<span>${sc.label}</span></button>`;
    }).join('') + `
      <button class="demo-btn demo-btn--reset" data-action="reset">${U.icon('reset')}<span>Reset</span></button>
      <div class="demo-foot">
        <button class="demo-sound ${s.settings.sound ? 'is-on' : ''}" data-action="toggle-sound">${U.icon(s.settings.sound ? 'volume' : 'mute')}<span>Sound ${s.settings.sound ? 'on' : 'off'}</span></button>
        <span class="demo-zone">${s.simulation.zoneId ? 'Zone: ' + U.esc(Store.zoneName(s.simulation.zoneId)) : 'All zones baseline'}</span>
      </div>`;
    UI.set(U.$('#demo-body'), body);
    U.$('#demo-state').textContent = SCENARIOS[active].label;
    U.$('#demo-panel').dataset.tone = SCENARIOS[active].tone;
    U.$('#demo-panel').classList.toggle('is-collapsed', s.ui.demoCollapsed);
    U.$('#demo-toggle').setAttribute('aria-expanded', String(!s.ui.demoCollapsed));
  },

  updateChrome() {
    const s = Store.state;
    const mode = Store.mode();
    const nav = NAV_ITEMS.find((n) => n.id === s.ui.view);
    U.$('#page-title').textContent = nav ? nav.label : '';
    U.$('#page-sub').textContent = `${mode.facility} · ${mode.building}`;
    U.$$('.nav-link').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === s.ui.view));

    const activeCount = Store.activeIncidents().length;
    const incBadge = U.$('[data-badge="incidents"]');
    incBadge.hidden = !activeCount; incBadge.textContent = activeCount;

    const pill = U.$('#risk-pill');
    pill.dataset.level = s.risk;
    U.$('#risk-value').textContent = s.risk;

    const led = U.$('#hw-led');
    led.dataset.led = s.hardware.led;
    led.classList.toggle('is-blink', s.risk === 'CRITICAL');
    const buzzer = U.$('#hw-buzzer');
    buzzer.classList.toggle('is-on', s.hardware.buzzer);
    buzzer.title = s.hardware.buzzer ? 'Buzzer ACTIVE (simulated)' : s.hardware.silenced ? 'Buzzer silenced' : 'Buzzer idle (simulated)';

    const unread = Store.unreadCount();
    const count = U.$('#notif-count');
    count.hidden = !unread; count.textContent = unread > 99 ? '99+' : unread;

    UI.set(U.$('#facility-card'), `<div class="facility-icon">${U.icon(mode.icon)}</div><div><strong>${U.esc(mode.facility)}</strong><small>${mode.label} · ${s.zones.length} zones</small></div>`);
    UI.renderModeSwitch();
    UI.renderDemoPanel();
    UI.renderBanner();
    if (!U.$('#notif-dropdown').hidden) UI.renderNotifDropdown();
  },

  renderBanner() {
    const s = Store.state;
    const el = U.$('#emergency-banner');
    const alert = s.alerts[0];
    if (!alert) { el.hidden = true; UI.set(el, ''); document.body.classList.remove('has-emergency'); return; }
    const sc = SCENARIOS[alert.scenario];
    const evac = s.ai && s.ai.evac;
    let instruction = sc.headline;
    if (evac && evac.type === 'evacuation') instruction = `Evacuate via ${evac.safeExit.name} — ${evac.safeExit.desc}. Avoid ${evac.unsafeExit.name}.`;
    else if (evac && evac.type === 'precaution') instruction = `Verify on site. Precautionary route: ${evac.safeExit.name} — ${evac.safeExit.desc}.`;
    else if (evac && evac.type === 'responder') instruction = `Responder route from ${Store.zoneName(evac.origin)} · ETA ~${evac.etaSec}s.`;
    else if (evac && evac.type === 'isolation') instruction = `Isolate equipment and restrict access to ${Store.zoneName(alert.zoneId)}.`;
    const tone = SEVERITY_TONE[alert.severity];
    el.hidden = false;
    el.className = `banner banner--${tone} ${alert.acknowledged ? 'is-ack' : ''}`;
    document.body.classList.toggle('has-emergency', tone === 'critical');
    UI.set(el, `
      <div class="banner-icon">${U.icon(sc.icon)}</div>
      <div class="banner-text">
        <strong>${U.esc(sc.title.toUpperCase())} · ${U.esc(Store.zoneName(alert.zoneId))}</strong>
        <span>${U.esc(instruction)}</span>
      </div>
      <div class="banner-meta">${alert.severity} · ${U.time(alert.ts)}${alert.acknowledged ? ' · Acknowledged' : ''}</div>
      <div class="banner-actions">
        <button class="btn btn--sm btn--light" data-action="open-alert">Details</button>
        ${s.hardware.buzzer ? '<button class="btn btn--sm btn--light" data-action="silence">Silence buzzer</button>' : ''}
        ${alert.acknowledged ? '' : '<button class="btn btn--sm btn--solid" data-action="ack-alert">Acknowledge</button>'}
      </div>`);
  },

  renderNotifDropdown() {
    const list = Store.modeNotifications().slice(0, 12);
    UI.set(U.$('#notif-dropdown'), `
      <div class="dropdown-head"><strong>Notifications</strong><button class="link" data-action="mark-read">Mark all read</button></div>
      <div class="dropdown-body">${list.length ? list.map(UI.notifItem).join('') : UI.empty('No notifications')}</div>`);
  },

  notifItem(n) {
    return `<button class="notif ${n.read ? '' : 'is-unread'}" data-action="open-notif" data-id="${n.id}">
      <span class="notif-dot notif-dot--${n.level}"></span>
      <span class="notif-body"><strong>${U.esc(n.title)}</strong><span>${U.esc(n.msg)}</span><small>${U.ago(n.ts)}</small></span>
    </button>`;
  },

  /* ------------------------------------------------------------------ map */

  mountMap(el, modeId) {
    const mode = MODES[modeId];
    const zones = mode.zones.map((z) => {
      const [x, y, w, h] = z.rect;
      const words = z.name.split(' ');
      const twoLine = w < 170 && words.length > 1;
      const nameSvg = twoLine
        ? `<text class="zone-name" x="${x + 14}" y="${y + 28}">${U.esc(words[0])}<tspan x="${x + 14}" dy="19">${U.esc(words.slice(1).join(' '))}</tspan></text>`
        : `<text class="zone-name" x="${x + 14}" y="${y + 28}">${U.esc(z.name)}</text>`;
      const statusY = y + (twoLine ? 70 : 51);
      return `<g class="zone" data-zone="${z.id}" data-action="select-zone" tabindex="0" role="button" aria-label="${U.esc(z.name)}">
        <rect class="zone-pulse" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
        <rect class="zone-rect" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
        ${nameSvg}
        <text class="zone-status" x="${x + 14}" y="${statusY}">Normal</text>
        <text class="zone-meta" x="${x + 14}" y="${y + h - 14}">${z.abbr} · ${z.occupancy} ppl</text>
        <circle class="zone-dot" cx="${x + w - 18}" cy="${y + 20}" r="6"/>
      </g>`;
    }).join('');
    const walkways = mode.walkways.map((wk) => {
      const [x, y, w, h] = wk.rect;
      return `<rect class="walkway" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="walkway-label" x="${x + w / 2}" y="${y + h / 2 + 5}">${wk.label}</text>`;
    }).join('');
    const exits = mode.exits.map((ex) => {
      const n = mode.nodes[ex.id];
      const rx = U.clamp(n.x - 34, 2, 1000 - 70), ry = U.clamp(n.y - 12, 2, 560 - 26);
      return `<g class="exit" data-exit="${ex.id}"><rect x="${rx}" y="${ry}" width="68" height="24" rx="5"/><text x="${rx + 34}" y="${ry + 16.5}">${ex.name.toUpperCase()}</text></g>`;
    }).join('');
    el.innerHTML = `<svg class="map" viewBox="0 0 1000 560" role="img" aria-label="${U.esc(mode.facility)} map">
      <rect class="map-bg" x="0" y="0" width="1000" height="560" rx="14"/>
      ${walkways}${zones}
      <polyline class="route-unsafe" points=""/>
      <polyline class="route" points=""/>
      <circle class="route-start" r="9" cx="-50" cy="-50"/>
      ${exits}
    </svg>`;
    el.dataset.mode = modeId;
  },

  updateMap(el, { highlightSelected = true } = {}) {
    const s = Store.state;
    if (el.dataset.mode !== s.mode) UI.mountMap(el, s.mode);
    const mode = Store.mode();
    const evac = s.ai ? s.ai.evac : { type: 'none', exits: [] };
    const hazard = s.simulation.zoneId;
    U.$$('.zone', el).forEach((g) => {
      const zone = Store.zone(g.dataset.zone);
      g.setAttribute('class', `zone zone--${zone.status}${hazard === zone.id && zone.status !== 'normal' ? ' is-hazard' : ''}${highlightSelected && s.ui.selectedZone === zone.id ? ' is-selected' : ''}`);
      const wide = mode.zones.find((z) => z.id === zone.id).rect[2] >= 170;
      const txt = zone.status === 'normal' || !wide ? STATUS[zone.status].label : `${STATUS[zone.status].label} · ${zone.issues.length} signal${zone.issues.length > 1 ? 's' : ''}`;
      const st = U.$('.zone-status', g);
      if (st.textContent !== txt) st.textContent = txt;
    });
    const exitState = {};
    (evac.exits || []).forEach((e) => { exitState[e.id] = e.state; });
    U.$$('.exit', el).forEach((g) => g.setAttribute('class', `exit exit--${exitState[g.dataset.exit] || 'clear'}`));
    const pts = (path) => (path ? path.map((n) => `${mode.nodes[n].x},${mode.nodes[n].y}`).join(' ') : '');
    const showRoute = evac.path && ['evacuation', 'precaution', 'responder'].includes(evac.type);
    const route = U.$('.route', el);
    const routePts = showRoute ? pts(evac.path) : '';
    if (route.getAttribute('points') !== routePts) route.setAttribute('points', routePts);
    route.setAttribute('class', `route ${evac.type === 'responder' ? 'route--responder' : ''}`);
    const unsafe = U.$('.route-unsafe', el);
    const unsafePts = evac.unsafePath ? pts(evac.unsafePath) : '';
    if (unsafe.getAttribute('points') !== unsafePts) unsafe.setAttribute('points', unsafePts);
    const start = U.$('.route-start', el);
    if (showRoute) { const n = mode.nodes[evac.path[0]]; start.setAttribute('cx', n.x); start.setAttribute('cy', n.y); }
    else { start.setAttribute('cx', -50); start.setAttribute('cy', -50); }
  },

  /* ------------------------------------------------------------------ camera */

  camHtml(zoneId, size = '') {
    const s = Store.state;
    const zone = Store.zone(zoneId);
    const kind = s.mode;
    const objects = kind === 'school'
      ? '<i class="obj obj-board"></i><i class="obj obj-desk d1"></i><i class="obj obj-desk d2"></i><i class="obj obj-desk d3"></i><i class="obj obj-desk d4"></i>'
      : '<i class="obj obj-rack r1"></i><i class="obj obj-rack r2"></i><i class="obj obj-machine m1"></i><i class="obj obj-machine m2"></i>';
    return `<div class="cam ${size}" data-cam="${zoneId}" data-state="NORMAL" data-kind="${kind}">
      <div class="cam-scene"><i class="cam-bg"></i><i class="cam-floor"></i>${objects}<i class="cam-fire"></i><i class="cam-smoke"></i></div>
      <div class="cam-scan"></div>
      <div class="cam-box"><span>flame/smoke · <b class="cam-conf">0.00</b></span></div>
      <div class="cam-top"><span class="cam-rec">● REC</span><span>CAM-${zone.abbr}-01</span></div>
      <div class="cam-bottom"><span>${U.esc(zone.name)}</span><span class="cam-time">--:--:--</span></div>
      <div class="cam-status">NORMAL</div>
      <div class="cam-proto">PROTOTYPE FEED</div>
    </div>`;
  },

  updateCam(el) {
    const s = Store.state;
    const set = s.sensors[el.dataset.cam];
    if (!set) return;
    const state = set.cam.value;
    if (el.dataset.state !== state) el.dataset.state = state;
    U.$('.cam-status', el).textContent = state;
    U.$('.cam-time', el).textContent = U.time(set.cam.ts);
    if (state === 'POSSIBLE FIRE') U.$('.cam-conf', el).textContent = (0.8 + Math.random() * 0.12).toFixed(2);
  },

  /* ------------------------------------------------------------------ sensor card */

  sensorCard(key, s, zoneId) {
    const def = SENSOR_DEFS[key];
    const p = UI.valueParts(key, s);
    const th = Store.state.settings.thresholds[key];
    let extra = '';
    if (key === 'humidity') extra = `Air ${U.num(s.aux, 1)} °C · ${UI.trend(s, key)}`;
    else if (key === 'cam') extra = 'On-device frame analysis (simulated)';
    else if (key === 'sos') extra = s.value >= 1 ? 'Manual activation latched' : 'Armed · self-test 07:00';
    else extra = `${UI.trend(s, key)}${th ? ` <span class="muted">· warn ≥ ${U.num(th.warn, def.decimals)}</span>` : ''}`;
    const spark = key === 'cam' || key === 'sos' ? `<div class="sensor-spark sensor-spark--flat">${key === 'cam' ? U.icon('camera') : U.icon('radio')}</div>` : `<div class="sensor-spark">${U.sparkline(s.history.slice(-24))}</div>`;
    return `<div class="sensor s--${s.status}">
      <div class="sensor-top">
        <span class="sensor-icon">${U.icon(def.icon)}</span>
        <div class="sensor-titles"><div class="sensor-name">${def.label}</div><div class="sensor-model">${def.model}</div></div>
      </div>
      <div class="sensor-value ${key === 'cam' || key === 'sos' ? 'sensor-value--text' : ''}">${U.esc(p.value)}${p.unit ? `<small>${p.unit}</small>` : ''}</div>
      <div class="sensor-extra">${extra}</div>
      ${spark}
      <div class="sensor-ts"><span>${U.icon('clock')} ${U.time(s.ts)}</span>${UI.badge(s.status)}</div>
    </div>`;
  },

  /* ------------------------------------------------------------------ incident parts */

  incidentRow(inc) {
    return `<tr data-action="open-incident" data-id="${inc.id}" class="clickable">
      <td class="mono">${inc.id}</td>
      <td>${U.esc(inc.type)}</td>
      <td>${U.esc(Store.zoneName(inc.zoneId))}</td>
      <td>${UI.severity(inc.severity)}</td>
      <td title="${new Date(inc.ts).toLocaleString()}">${U.dateTime(inc.ts)}</td>
      <td>${UI.tone(inc.status, INCIDENT_STATUS_TONE[inc.status])}</td>
    </tr>`;
  },

  incidentTable(list, compact = false) {
    if (!list.length) return UI.empty('No incidents match the current filter');
    return `<div class="table-wrap"><table class="table ${compact ? 'table--compact' : ''}">
      <thead><tr><th>ID</th><th>Type</th><th>Location</th><th>Severity</th><th>Time</th><th>Status</th></tr></thead>
      <tbody>${list.map(UI.incidentRow).join('')}</tbody></table></div>`;
  },

  incidentCards(list) {
    if (!list.length) return UI.empty('No incidents match the current filter');
    return `<div class="inc-cards">${list.map((inc) => `
      <button class="inc-card inc-card--${SEVERITY_TONE[inc.severity]}" data-action="open-incident" data-id="${inc.id}">
        <div class="inc-card-top"><span class="mono">${inc.id}</span>${UI.tone(inc.status, INCIDENT_STATUS_TONE[inc.status])}</div>
        <strong>${U.esc(inc.type)}</strong>
        <span class="muted">${U.esc(Store.zoneName(inc.zoneId))}</span>
        <div class="inc-card-foot">${UI.severity(inc.severity)}<small>${U.dateTime(inc.ts)}</small></div>
        <small class="muted">AI: ${U.esc(inc.ai.classification)} (${inc.ai.confidence}%)</small>
      </button>`).join('')}</div>`;
  },

  readingsGrid(readings) {
    return `<div class="readings">${Object.entries(readings).map(([key, v]) => {
      const def = SENSOR_DEFS[key];
      const val = typeof v === 'object' ? v : { value: v };
      const status = val.status || Rules.statusOf(key, val.value, Store.state.settings);
      const display = key === 'cam' ? val.value : key === 'sos' ? (val.value >= 1 ? 'PRESSED' : 'IDLE') : `${U.num(val.value, def.decimals)} ${def.unit}`;
      return `<div class="reading r--${status}"><span>${def.label}<small>${def.model}</small></span><strong>${U.esc(display)}</strong></div>`;
    }).join('')}</div>`;
  },

  incidentModal(inc) {
    const actions = [];
    if (inc.status === 'Active') actions.push('<button class="btn btn--ghost" data-action="incident-status" data-status="Acknowledged" data-id="' + inc.id + '">Acknowledge</button>');
    if (inc.status === 'Active' || inc.status === 'Acknowledged') actions.push('<button class="btn btn--ghost" data-action="incident-status" data-status="Responding" data-id="' + inc.id + '">Dispatch response</button>');
    if (inc.status !== 'Resolved') actions.push('<button class="btn btn--primary" data-action="incident-status" data-status="Resolved" data-id="' + inc.id + '">Mark resolved</button>');
    const steps = ['Active', 'Acknowledged', 'Responding', 'Resolved'];
    const idx = steps.indexOf(inc.status);
    return `
      <div class="modal-head modal-head--${SEVERITY_TONE[inc.severity]}">
        <div><div class="modal-kicker mono">${inc.id} · ${inc.source}</div><h2>${U.esc(inc.type)} — ${U.esc(Store.zoneName(inc.zoneId))}</h2></div>
        <button class="icon-btn" data-action="close-modal" aria-label="Close">${U.icon('x')}</button>
      </div>
      <div class="modal-body">
        <div class="meta-row">
          <div><small>Severity</small>${UI.severity(inc.severity)}</div>
          <div><small>Status</small>${UI.tone(inc.status, INCIDENT_STATUS_TONE[inc.status])}</div>
          <div><small>Detected</small><strong>${new Date(inc.ts).toLocaleString()}</strong></div>
          <div><small>Responder</small><strong>${U.esc(inc.responder)}</strong></div>
        </div>
        <div class="progress-steps">${steps.map((st, i) => `<div class="pstep ${i <= idx ? 'is-done' : ''}"><i></i><span>${st}</span></div>`).join('')}</div>
        <div class="modal-cols">
          <div>
            <h4>Sensor readings at detection</h4>
            ${UI.readingsGrid(inc.readings)}
            <h4>AI classification <span class="tag tag--proto">SIMULATED</span></h4>
            <div class="ai-mini"><strong>${U.esc(inc.ai.classification)}</strong><div class="bar"><i style="width:${inc.ai.confidence}%"></i></div><span>${inc.ai.confidence}% confidence</span></div>
          </div>
          <div>
            <h4>Timeline</h4>
            <ol class="timeline">${inc.timeline.slice().reverse().map((t) => `<li><time>${U.time(t.ts)}</time><span>${U.esc(t.text)}</span></li>`).join('')}</ol>
          </div>
        </div>
      </div>
      <div class="modal-foot"><span class="muted small">Response actions are recorded locally in this prototype.</span><div class="row-gap">${actions.join('') || '<span class="badge badge--normal">Closed</span>'}</div></div>`;
  },

  alertModal(alert) {
    const s = Store.state;
    const sc = SCENARIOS[alert.scenario];
    const set = s.sensors[alert.zoneId];
    const inc = s.incidents.find((i) => i.id === alert.incidentId);
    const ai = s.ai;
    const evac = ai.evac;
    const keys = SENSOR_ORDER.filter((k) => set[k].status !== 'normal' || ['smoke', 'temp', 'equip'].includes(k));
    const readings = Object.fromEntries(keys.map((k) => [k, { value: set[k].value, status: set[k].status }]));
    let guidance = '';
    if (evac.type === 'evacuation' || evac.type === 'precaution') {
      guidance = `<div class="evac-box ${evac.type === 'evacuation' ? 'evac-box--danger' : 'evac-box--warning'}">
        <div class="evac-title">${U.icon('route')} ${evac.type === 'evacuation' ? 'EVACUATION RECOMMENDED' : 'PRECAUTIONARY ROUTE'}</div>
        <div class="evac-route">${evac.names.map((n) => `<span>${U.esc(n)}</span>`).join('<i>›</i>')}</div>
        <div class="evac-meta">~${Math.round(evac.meters)} m · ~${evac.etaSec}s walking · <b>Avoid ${U.esc(evac.unsafeExit.name)} (${U.esc(evac.unsafeExit.desc)})</b></div>
      </div>`;
    } else if (evac.type === 'responder') {
      guidance = `<div class="evac-box evac-box--info"><div class="evac-title">${U.icon('users')} RESPONDER ACCESS ROUTE</div>
        <div class="evac-route">${evac.names.map((n) => `<span>${U.esc(n)}</span>`).join('<i>›</i>')}</div>
        <div class="evac-meta">~${Math.round(evac.meters)} m · ETA ~${evac.etaSec}s (brisk walk)</div></div>`;
    } else if (evac.type === 'isolation') {
      guidance = `<div class="evac-box evac-box--warning"><div class="evac-title">${U.icon('lock')} ISOLATE &amp; RESTRICT ACCESS</div><div class="evac-meta">${U.esc(ai.recommendation)}</div></div>`;
    }
    return `
      <div class="modal-head modal-head--${SEVERITY_TONE[alert.severity]} modal-head--alert">
        <div class="alert-icon">${U.icon(sc.icon)}</div>
        <div><div class="modal-kicker">${alert.severity.toUpperCase()} ALERT · ${U.time(alert.ts)}</div><h2>${U.esc(sc.title)} — ${U.esc(Store.zoneName(alert.zoneId))}</h2><p>${U.esc(sc.headline)}</p></div>
        <button class="icon-btn" data-action="close-modal" aria-label="Close">${U.icon('x')}</button>
      </div>
      <div class="modal-body">
        <div class="meta-row">
          <div><small>Type</small><strong>${U.esc(sc.incidentType)}</strong></div>
          <div><small>Location</small><strong>${U.esc(Store.zoneName(alert.zoneId))}</strong></div>
          <div><small>Severity</small>${UI.severity(alert.severity)}</div>
          <div><small>Facility risk</small>${UI.riskBadge(s.risk)}</div>
        </div>
        ${guidance}
        <h4>Live readings</h4>
        ${UI.readingsGrid(readings)}
        <div class="ai-mini"><span class="tag tag--proto">AI · SIMULATED</span><strong>${U.esc(ai.classification)}</strong><div class="bar"><i style="width:${ai.confidence}%"></i></div><span>${ai.confidence}%</span></div>
        <p class="muted small">Prototype alert. No real emergency services are contacted by this system.</p>
      </div>
      <div class="modal-foot">
        <div class="row-gap">
          <button class="btn btn--ghost" data-action="go-map">View on map</button>
          ${inc ? `<button class="btn btn--ghost" data-action="open-incident" data-id="${inc.id}">Open incident</button>` : ''}
        </div>
        <div class="row-gap">
          ${s.hardware.buzzer ? '<button class="btn btn--ghost" data-action="silence">Silence buzzer</button>' : ''}
          ${alert.acknowledged ? '<button class="btn btn--ghost" data-action="close-modal">Close</button>' : '<button class="btn btn--primary" data-action="ack-alert">Acknowledge</button>'}
        </div>
      </div>`;
  },

  openModal(html, tone = '') {
    const root = U.$('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal ${tone ? 'modal--' + tone : ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-open'));
  },

  closeModal() {
    const root = U.$('#modal-root');
    root.classList.remove('is-open');
    root.hidden = true;
    root.innerHTML = '';
    root.dataset.kind = '';
  },

  toast(title, msg, level = 'normal') {
    const el = document.createElement('div');
    el.className = `toast toast--${level}`;
    el.innerHTML = `<span class="notif-dot notif-dot--${level}"></span><div><strong>${U.esc(title)}</strong><span>${U.esc(msg)}</span></div>`;
    U.$('#toast-root').appendChild(el);
    setTimeout(() => el.classList.add('is-leaving'), 3800);
    setTimeout(() => el.remove(), 4200);
  },

  security() {
    const items = [
      { icon: 'lock', label: 'Encrypted Communication', desc: 'TLS/MQTTS planned — simulated indicator' },
      { icon: 'userCheck', label: 'Authentication Enabled', desc: 'Demo login gate (client-side only)' },
      { icon: 'database', label: 'Data Protected', desc: 'Local-only storage in this prototype' },
      { icon: 'ban', label: 'Unauthorized Access Blocked', desc: `${3 + (Store.state.simulation.tick % 3)} simulated attempts rejected today` }
    ];
    return `<div class="sec-list">${items.map((it) => `<div class="sec-item"><span class="sec-icon">${U.icon(it.icon)}</span><div><strong>${it.label}</strong><small>${it.desc}</small></div><span class="sec-ok">${U.icon('check')}</span></div>`).join('')}</div>`;
  },

  legend(items) {
    return items.map(([label, color]) => `<span><i class="lg" style="background:var(${color})"></i>${label}</span>`).join('');
  },

  /* ================================================================== VIEWS */

  views: {
    /* ----------------------------------------------------------- dashboard */
    dashboard: {
      update() {
        const s = Store.state;
        const mode = Store.mode();
        const online = Store.onlineDevices();
        const outOfRange = Store.outOfRangeSensors();
        const statusTone = s.systemStatus === 'OPERATIONAL' ? 'normal' : s.systemStatus === 'EMERGENCY' ? 'critical' : 'warning';
        UI.set(U.$('#dash-kpis'), `
          <div class="kpi kpi--${statusTone}"><span class="kpi-icon">${U.icon('shield')}</span><div><small>System Status</small><strong>${s.systemStatus}</strong><span>${s.simulation.running ? 'Live · simulated stream' : 'Stream paused'}</span></div></div>
          <div class="kpi"><span class="kpi-icon">${U.icon('wifi')}</span><div><small>Devices Online</small><strong>${online}<em>/${s.devices.length}</em></strong><span>${s.devices.filter((d) => d.status === 'Alert').length} in alert · ${s.devices.filter((d) => d.status === 'Maintenance').length} maintenance</span></div></div>
          <div class="kpi ${s.alerts.length ? 'kpi--danger' : ''}"><span class="kpi-icon">${U.icon('bell')}</span><div><small>Active Alerts</small><strong>${s.alerts.length}</strong><span>${outOfRange} sensor reading${outOfRange === 1 ? '' : 's'} out of range</span></div></div>
          <div class="kpi"><span class="kpi-icon">${U.icon('map')}</span><div><small>Areas Monitored</small><strong>${s.zones.length}</strong><span>${mode.label} · ${s.zones.reduce((a, z) => a + z.occupancy, 0)} occupants est.</span></div></div>
          <div class="kpi kpi--risk kpi--${RISK_LEVELS[s.risk].cls}"><span class="kpi-icon">${U.icon('alert')}</span><div><small>Current Risk</small><strong>${s.risk}</strong><span>${s.ai ? U.esc(s.ai.classification) : ''}</span></div></div>`);

        // Evacuation / response recommendation
        const evac = s.ai.evac;
        let evacHtml = '';
        if (evac.type === 'evacuation' || evac.type === 'precaution' || evac.type === 'responder') {
          const title = evac.type === 'evacuation' ? 'Evacuation recommended' : evac.type === 'precaution' ? 'Precautionary evacuation route' : 'Responder access route';
          const tone = evac.type === 'evacuation' ? 'danger' : evac.type === 'precaution' ? 'warning' : 'info';
          evacHtml = `<div class="evac-card evac-card--${tone}">
            <div class="evac-card-icon">${U.icon(evac.type === 'responder' ? 'users' : 'route')}</div>
            <div class="evac-card-main"><small>${title} · AI routing (simulated)</small>
              <div class="evac-route">${evac.names.map((n) => `<span>${U.esc(n)}</span>`).join('<i>›</i>')}</div>
              <div class="evac-meta">~${Math.round(evac.meters)} m · ~${evac.etaSec}s${evac.unsafeExit ? ` · <b>Avoid ${U.esc(evac.unsafeExit.name)} — ${U.esc(evac.unsafeExit.desc)}</b>` : ''}</div>
            </div>
            <a class="btn btn--sm btn--ghost" href="#/ai">Route analysis</a>
          </div>`;
        }
        UI.set(U.$('#dash-evac'), evacHtml);

        // Zone select + sensors
        const focus = s.ui.focusZone || s.simulation.zoneId || s.zones[0].id;
        const select = U.$('#dash-zone-select');
        const opts = s.zones.map((z) => `<option value="${z.id}">${U.esc(z.name)}${z.status !== 'normal' ? ' — ' + STATUS[z.status].label : ''}</option>`).join('');
        UI.set(select, opts);
        if (select.value !== focus) select.value = focus;
        const set = s.sensors[focus];
        UI.set(U.$('#dash-sensors'), SENSOR_ORDER.map((k) => UI.sensorCard(k, set[k], focus)).join(''));

        const bad = s.zones.filter((z) => z.status !== 'normal').length;
        U.$('#dash-zone-sub').textContent = bad ? `${bad} zone${bad > 1 ? 's' : ''} need attention` : `All ${s.zones.length} zones normal`;
        UI.set(U.$('#dash-zones'), s.zones.map((z) => `
          <button class="zone-item zone-item--${z.status} ${focus === z.id ? 'is-focus' : ''}" data-action="focus-zone" data-zone="${z.id}">
            <span class="zone-dot-sm"></span>
            <span class="zone-item-name"><strong>${U.esc(z.name)}</strong><small>${U.esc(z.kind)}</small></span>
            <span class="zone-item-val">${U.num(s.sensors[z.id].temp.value, 1)}°C · ${U.num(s.sensors[z.id].smoke.value, 0)} ppm</span>
            ${UI.badge(z.status)}
          </button>`).join(''));

        UI.set(U.$('#leg-dash-temp'), UI.legend([['Avg', '--series-2'], ['Equipment max', '--series-1']]));
        const th = s.settings.thresholds;
        Charts.line(U.$('#chart-dash-temp'), {
          labels: s.history.labels, unit: '°C', decimals: 1,
          series: [
            { label: 'Average temp', data: s.history.avgTemp, color: '--series-2', fill: true },
            { label: 'Equipment max', data: s.history.maxEquip, color: '--series-1' }
          ],
          thresholds: [{ value: th.equip.warn, label: `Equip warn ${th.equip.warn}°C`, tone: 'warn' }]
        });
        Charts.line(U.$('#chart-dash-smoke'), {
          labels: s.history.labels, unit: 'ppm', decimals: 0, yMin: 0,
          series: [{ label: 'Max smoke', data: s.history.maxSmoke, color: '--series-3', fill: true }],
          thresholds: [{ value: th.smoke.warn, label: 'Warning', tone: 'warn' }, { value: th.smoke.danger, label: 'Danger', tone: 'danger' }]
        });

        UI.set(U.$('#dash-hw'), `
          <div class="hw-panel">
            <div class="hw-row"><span class="led led--lg ${s.risk === 'CRITICAL' ? 'is-blink' : ''}" data-led="${s.hardware.led}"></span><div><strong>Status LED</strong><small>${s.hardware.led === 'green' ? 'Green · all clear' : s.hardware.led === 'amber' ? 'Amber · warning' : 'Red · alarm'}</small></div></div>
            <div class="hw-row"><span class="buzzer-icon ${s.hardware.buzzer ? 'is-on' : ''}">${U.icon(s.hardware.buzzer ? 'volume' : 'mute')}</span><div><strong>Buzzer</strong><small>${s.hardware.buzzer ? 'Sounding (simulated)' : s.hardware.silenced ? 'Silenced by operator' : 'Idle'}</small></div></div>
          </div>
          ${UI.security()}`);

        UI.set(U.$('#dash-incidents'), UI.incidentTable(Store.modeIncidents().slice(0, 5), true));
        const notifs = Store.modeNotifications();
        U.$('#dash-notif-sub').textContent = `${Store.unreadCount()} unread`;
        UI.set(U.$('#dash-notifs'), notifs.length ? notifs.slice(0, 6).map(UI.notifItem).join('') : UI.empty('No notifications'));
      }
    },

    /* ----------------------------------------------------------- monitoring */
    monitoring: {
      update() {
        const s = Store.state;
        const mode = Store.mode();
        if (!s.ui.selectedZone || !Store.zone(s.ui.selectedZone)) s.ui.selectedZone = s.simulation.zoneId || s.zones[0].id;
        U.$('#map-title').textContent = `${mode.facility} — ${mode.building}`;
        UI.updateMap(U.$('#map-main'));

        // Zone detail
        const zone = Store.zone(s.ui.selectedZone);
        const panel = U.$('#zone-detail');
        if (panel.dataset.zone !== zone.id || panel.dataset.mode !== s.mode) {
          panel.dataset.zone = zone.id;
          panel.dataset.mode = s.mode;
          panel.innerHTML = `<div id="zd-head"></div><div id="zd-cam">${UI.camHtml(zone.id, 'cam--md')}</div><div id="zd-sensors"></div><div id="zd-devices"></div>`;
        }
        const set = s.sensors[zone.id];
        UI.set(U.$('#zd-head'), `<div class="card-head"><div><h3>${U.esc(zone.name)}</h3><p class="card-sub">${U.esc(zone.kind)} · ${zone.occupancy} occupants (est.)</p></div>${UI.badge(zone.status)}</div>`);
        UI.updateCam(U.$('#zd-cam .cam'));
        UI.set(U.$('#zd-sensors'), `<div class="sensor-rows">${SENSOR_ORDER.filter((k) => k !== 'cam').map((k) => {
          const r = set[k]; const def = SENSOR_DEFS[k];
          return `<div class="srow srow--${r.status}">
            <span class="srow-icon">${U.icon(def.icon)}</span>
            <span class="srow-name"><strong>${def.label}</strong><small>${def.model} · ${U.time(r.ts)}</small></span>
            ${k === 'sos' ? '<span></span>' : `<span class="srow-spark">${U.sparkline(r.history.slice(-20), 70, 22)}</span>`}
            <span class="srow-val">${U.esc(UI.formatReading(k, r))}</span>
            <span class="srow-dot" title="${STATUS[r.status].label}"></span>
          </div>`;
        }).join('')}</div>`);
        const devs = s.devices.filter((d) => d.zoneId === zone.id);
        UI.set(U.$('#zd-devices'), `<h4 class="sub-head">Devices in zone</h4><div class="dev-mini">${devs.map((d) => `<div><span class="mono">${d.id}</span><small>${U.esc(d.type)}</small>${UI.tone(d.status, DEVICE_STATUS_TONE[d.status])}</div>`).join('')}</div>`);

        // Camera wall
        const wall = U.$('#cam-wall');
        if (wall.dataset.mode !== s.mode) {
          wall.dataset.mode = s.mode;
          wall.innerHTML = s.zones.map((z) => `<button class="cam-tile" data-action="select-zone" data-zone="${z.id}">${UI.camHtml(z.id, 'cam--sm')}</button>`).join('');
        }
        U.$$('.cam', wall).forEach(UI.updateCam);
        U.$$('.cam-tile', wall).forEach((t) => t.classList.toggle('is-selected', t.dataset.zone === zone.id));
      }
    },

    /* ----------------------------------------------------------- incidents */
    incidents: {
      update() {
        const s = Store.state;
        const all = Store.modeIncidents();
        const active = all.filter((i) => i.status !== 'Resolved');
        const critical = all.filter((i) => i.severity === 'Critical').length;
        UI.set(U.$('#inc-stats'), `
          <div class="stat"><small>Total incidents</small><strong>${all.length}</strong></div>
          <div class="stat ${active.length ? 'stat--danger' : ''}"><small>Active</small><strong>${active.length}</strong></div>
          <div class="stat"><small>Critical (all time)</small><strong>${critical}</strong></div>
          <div class="stat"><small>Median acknowledge time</small><strong>32 s</strong><span class="muted small">mock history</span></div>`);
        U.$$('#inc-filter button').forEach((b) => b.classList.toggle('is-active', b.dataset.filter === s.ui.incidentFilter));
        U.$$('#inc-view button').forEach((b) => b.classList.toggle('is-active', b.dataset.viewMode === s.ui.incidentView));
        const q = s.ui.incidentQuery.toLowerCase();
        const list = all.filter((i) => (s.ui.incidentFilter === 'all' || (s.ui.incidentFilter === 'active' ? i.status !== 'Resolved' : i.status === 'Resolved'))
          && (s.ui.incidentSeverity === 'all' || i.severity === s.ui.incidentSeverity)
          && (!q || `${i.id} ${i.type} ${Store.zoneName(i.zoneId)}`.toLowerCase().includes(q)));
        UI.set(U.$('#inc-list'), s.ui.incidentView === 'table' ? UI.incidentTable(list) : UI.incidentCards(list));
      }
    },

    /* ----------------------------------------------------------- devices */
    devices: {
      update() {
        const s = Store.state;
        const count = (st) => s.devices.filter((d) => d.status === st).length;
        UI.set(U.$('#dev-stats'), `
          <div class="stat"><small>Total devices</small><strong>${s.devices.length}</strong></div>
          <div class="stat stat--ok"><small>Online</small><strong>${count('Online')}</strong></div>
          <div class="stat ${count('Alert') ? 'stat--danger' : ''}"><small>In alert</small><strong>${count('Alert')}</strong></div>
          <div class="stat"><small>Warning / Maintenance</small><strong>${count('Warning')} / ${count('Maintenance')}</strong></div>`);
        const types = ['all', ...new Set(s.devices.map((d) => d.type))];
        UI.set(U.$('#dev-type'), types.map((t) => `<option value="${U.esc(t)}">${t === 'all' ? 'All device types' : U.esc(t)}</option>`).join(''));
        U.$('#dev-type').value = s.ui.deviceType;
        const q = s.ui.deviceQuery.toLowerCase();
        const list = s.devices.filter((d) => (s.ui.deviceType === 'all' || d.type === s.ui.deviceType)
          && (!q || `${d.id} ${d.type} ${Store.zoneName(d.zoneId)}`.toLowerCase().includes(q)));
        UI.set(U.$('#dev-table'), list.length ? `<table class="table">
          <thead><tr><th>Device ID</th><th>Type</th><th>Location</th><th>Status</th><th>Last communication</th><th>Signal</th><th>Firmware</th></tr></thead>
          <tbody>${list.map((d) => `<tr>
            <td class="mono">${d.id}</td>
            <td><strong class="cell-strong">${U.esc(d.type)}</strong><small class="cell-sub">${U.esc(d.sensors)}</small></td>
            <td>${U.esc(Store.zoneName(d.zoneId))}</td>
            <td>${UI.tone(d.status, DEVICE_STATUS_TONE[d.status])}${d.note ? `<small class="cell-sub">${U.esc(d.note)}</small>` : ''}</td>
            <td>${d.status === 'Maintenance' ? '<span class="muted">Paused</span>' : `${U.ago(d.lastSeen)}<small class="cell-sub">${U.time(d.lastSeen)}</small>`}</td>
            <td><span class="signal" data-bars="${d.signal > -50 ? 4 : d.signal > -60 ? 3 : 2}"><i></i><i></i><i></i><i></i></span><small class="cell-sub">${d.signal} dBm</small></td>
            <td class="mono">${d.firmware}</td>
          </tr>`).join('')}</tbody></table>` : UI.empty('No devices match the current filter', 'search'));
      }
    },

    /* ----------------------------------------------------------- analytics */
    analytics: {
      update() {
        const s = Store.state;
        const live = s.ui.analyticsRange === 'live';
        U.$$('#an-range button').forEach((b) => b.classList.toggle('is-active', b.dataset.range === s.ui.analyticsRange));
        const src = live
          ? { labels: s.history.labels, temp: s.history.avgTemp, tempMax: s.history.maxTemp, smoke: s.history.maxSmoke, equip: s.history.maxEquip, vib: s.history.maxVib }
          : { labels: s.history24h.labels, temp: s.history24h.temp, tempMax: s.history24h.temp.map((v, i) => +(v + 1.2 + ((i * 7) % 5) * 0.2).toFixed(1)), smoke: s.history24h.smoke, equip: s.history24h.equip, vib: s.history24h.vibration };
        const th = s.settings.thresholds;
        UI.set(U.$('#leg-an-temp'), UI.legend([['Average', '--series-2'], ['Max', '--series-1']]));
        Charts.line(U.$('#chart-an-temp'), { labels: src.labels, unit: '°C', decimals: 1, series: [{ label: 'Average', data: src.temp, color: '--series-2', fill: true }, { label: 'Max', data: src.tempMax, color: '--series-1' }], thresholds: [{ value: th.temp.warn, label: 'Warning', tone: 'warn' }] });
        Charts.line(U.$('#chart-an-smoke'), { labels: src.labels, unit: 'ppm', decimals: 0, yMin: 0, series: [{ label: 'Max smoke', data: src.smoke, color: '--series-3', fill: true }], thresholds: [{ value: th.smoke.warn, label: 'Warning', tone: 'warn' }, { value: th.smoke.danger, label: 'Danger', tone: 'danger' }] });
        Charts.line(U.$('#chart-an-equip'), { labels: src.labels, unit: '°C', decimals: 1, series: [{ label: 'Hottest surface', data: src.equip, color: '--series-1', fill: true }], thresholds: [{ value: th.equip.warn, label: 'Warning', tone: 'warn' }, { value: th.equip.danger, label: 'Danger', tone: 'danger' }] });
        Charts.line(U.$('#chart-an-vib'), { labels: src.labels, unit: 'g', decimals: 2, yMin: 0, series: [{ label: 'Peak vibration', data: src.vib, color: '--series-4', fill: true }], thresholds: [{ value: th.vibration.warn, label: 'Warning', tone: 'warn' }, { value: th.vibration.danger, label: 'Danger', tone: 'danger' }] });

        // Weekly incidents (+ today's live incidents)
        const days = [];
        for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toLocaleString('en-US', { weekday: 'short' }));
        const w = s.weekly;
        const liveToday = { fire: 0, equipment: 0, vibration: 0, sos: 0 };
        Store.modeIncidents().filter((i) => i.source === 'Live demo').forEach((i) => {
          const cat = i.type === 'Fire' || i.type === 'Smoke Detected' ? 'fire' : i.type === 'Equipment Overheating' ? 'equipment' : i.type === 'Abnormal Vibration' ? 'vibration' : 'sos';
          liveToday[cat]++;
        });
        const withToday = (arr, k) => arr.map((v, i) => (i === 6 ? v + liveToday[k] : v));
        UI.set(U.$('#leg-an-inc'), UI.legend([['Fire / smoke', '--series-1'], ['Equipment', '--series-2'], ['Vibration', '--series-4'], ['SOS', '--series-3']]));
        Charts.bar(U.$('#chart-an-inc'), {
          labels: days,
          series: [
            { label: 'Fire / smoke', data: withToday(w.fire, 'fire'), color: '--series-1' },
            { label: 'Equipment', data: withToday(w.equipment, 'equipment'), color: '--series-2' },
            { label: 'Vibration', data: withToday(w.vibration, 'vibration'), color: '--series-4' },
            { label: 'SOS', data: withToday(w.sos, 'sos'), color: '--series-3' }
          ]
        });

        const total7 = Object.keys(w).reduce((a, k) => a + withToday(w[k], k).reduce((x, y) => x + y, 0), 0);
        const peak = (arr, d) => U.num(Math.max(...arr), d);
        U.$('#an-summary-sub').textContent = live ? 'Current live window' : 'Last 24 hours';
        UI.set(U.$('#an-summary'), `<div class="summary">
          <div><small>Peak temperature</small><strong>${peak(src.tempMax, 1)} °C</strong></div>
          <div><small>Peak smoke</small><strong>${peak(src.smoke, 0)} ppm</strong></div>
          <div><small>Peak equipment heat</small><strong>${peak(src.equip, 1)} °C</strong></div>
          <div><small>Peak vibration</small><strong>${peak(src.vib, 2)} g</strong></div>
          <div><small>Incidents (7 days)</small><strong>${total7}</strong></div>
          <div><small>Data availability</small><strong>${U.num((Store.onlineDevices() / s.devices.length) * 100, 1)}%</strong></div>
        </div>`);
      }
    },

    /* ----------------------------------------------------------- AI */
    ai: {
      update() {
        const s = Store.state;
        const ai = s.ai;
        const tone = RISK_LEVELS[ai.risk].cls;
        const circ = 2 * Math.PI * 52;
        UI.set(U.$('#ai-class'), `
          <div class="card-head"><div><h3>Current Classification</h3><p class="card-sub">${U.esc(ai.model)}</p></div><span class="tag tag--proto">SIMULATED</span></div>
          <div class="ai-hero ai-hero--${tone}">
            <svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - ai.confidence / 100)}"/></svg>
            <div class="ring-label"><strong>${ai.confidence}%</strong><small>confidence</small></div>
          </div>
          <div class="ai-class-name">${U.esc(ai.classification)}</div>
          <div class="meta-row meta-row--tight">
            <div><small>Risk level</small>${UI.riskBadge(ai.risk)}</div>
            <div><small>Location</small><strong>${U.esc(ai.zoneName)}</strong></div>
            <div><small>Since</small><strong>${U.time(ai.changedAt)}</strong></div>
          </div>
          <div class="ai-reco ai-reco--${tone}"><strong>Recommended action</strong><span>${U.esc(ai.recommendation)}</span></div>`);

        U.$('#ai-signal-sub').textContent = ai.zoneId ? `Fused readings from ${ai.zoneName}` : 'Strongest signals across zones';
        UI.set(U.$('#ai-signals'), `<div class="bars">${ai.signals.map((sig) => `
          <div class="bar-row">
            <div class="bar-label"><strong>${sig.label}</strong><small>${sig.sensor} · ${U.esc(sig.reading)}</small></div>
            <div class="bar bar--${sig.status}"><i style="width:${Math.max(2, Math.round(sig.weight * 100))}%"></i></div>
            <span class="bar-val">${Math.round(sig.weight * 100)}</span>
          </div>`).join('')}</div>`);

        UI.set(U.$('#ai-probs'), `<div class="bars">${ai.probabilities.map((p, i) => `
          <div class="bar-row bar-row--prob">
            <div class="bar-label"><strong>${p.label}</strong></div>
            <div class="bar ${i === 0 ? 'bar--top' : ''}"><i style="width:${Math.max(1, p.p * 100)}%"></i></div>
            <span class="bar-val">${U.num(p.p * 100, 1)}%</span>
          </div>`).join('')}</div>`);
        UI.set(U.$('#ai-reason'), `<strong>Reasoning</strong><p>${U.esc(ai.reasoning)}</p>`);

        const evac = ai.evac;
        const step = (kicker, title, text, tone2, icon) => `<div class="flow-step flow-step--${tone2}"><span class="flow-icon">${U.icon(icon)}</span><div><small>${kicker}</small><strong>${title}</strong><span>${text}</span></div></div>`;
        let flow;
        if (evac.type === 'evacuation' || evac.type === 'precaution') {
          flow = step('Hazard zone', U.esc(Store.zoneName(evac.hazardZone)), U.esc(ai.classification), 'danger', 'flame')
            + '<i class="flow-arrow">→</i>'
            + step('Predicted dangerous exit', `${U.esc(evac.unsafeExit.name)} — ${U.esc(evac.unsafeExit.desc)}`, U.esc(evac.unsafeReason), 'warning', 'ban')
            + '<i class="flow-arrow">→</i>'
            + step(evac.type === 'evacuation' ? 'Recommended safer route' : 'Precautionary route', `${U.esc(evac.safeExit.name)} — ${U.esc(evac.safeExit.desc)}`, `${evac.names.map(U.esc).join(' › ')} · ~${Math.round(evac.meters)} m · ~${evac.etaSec}s`, 'normal', 'route');
        } else if (evac.type === 'responder') {
          flow = step('Incident location', U.esc(Store.zoneName(evac.hazardZone)), 'Manual SOS activation', 'danger', 'radio')
            + '<i class="flow-arrow">→</i>'
            + step('Responder origin', U.esc(Store.zoneName(evac.origin)), 'Nearest staffed point', 'info', 'users')
            + '<i class="flow-arrow">→</i>'
            + step('Fastest access route', `~${Math.round(evac.meters)} m · ETA ~${evac.etaSec}s`, evac.names.map(U.esc).join(' › '), 'normal', 'route');
        } else if (evac.type === 'isolation') {
          flow = step('Affected zone', U.esc(Store.zoneName(evac.hazardZone)), U.esc(ai.classification), 'danger', 'zap')
            + '<i class="flow-arrow">→</i>'
            + step('Containment', 'Restrict access to zone', 'Isolate power / stop machine', 'warning', 'lock')
            + '<i class="flow-arrow">→</i>'
            + step('Evacuation', 'Not required', 'All exits remain clear', 'normal', 'check');
        } else {
          flow = step('Facility state', 'No active hazard', 'All zones within thresholds', 'normal', 'shield')
            + '<i class="flow-arrow">→</i>'
            + step('Exit availability', `${evac.exits.length} of ${evac.exits.length} exits clear`, evac.exits.map((e) => e.name).join(' · '), 'normal', 'route')
            + '<i class="flow-arrow">→</i>'
            + step('Routing engine', 'Standing by', 'Routes are recomputed when a hazard is detected', 'info', 'ai');
        }
        UI.set(U.$('#ai-flow'), `<div class="flow">${flow}</div>`);
        UI.updateMap(U.$('#map-ai'), { highlightSelected: false });

        let side;
        if (evac.zoneRoutes) {
          side = `<h4 class="sub-head">Zone-by-zone exit guidance</h4>
            <table class="table table--compact"><thead><tr><th>Zone</th><th>Use exit</th><th>Dist.</th></tr></thead><tbody>
            ${evac.zoneRoutes.map((r) => `<tr><td>${U.esc(r.zoneName)}</td><td><strong>${r.exit.name}</strong> <small class="muted">${U.esc(r.exit.desc)}</small></td><td>${r.meters ?? '—'} m</td></tr>`).join('')}
            </tbody></table>
            <h4 class="sub-head">Predicted spread risk (next 5 min)</h4>
            <div class="bars">${evac.zoneRisk.slice(0, 5).map((z) => `<div class="bar-row"><div class="bar-label"><strong>${U.esc(z.zoneName)}</strong></div><div class="bar bar--${z.risk >= 60 ? 'danger' : z.risk >= 25 ? 'warning' : 'normal'}"><i style="width:${Math.max(2, z.risk)}%"></i></div><span class="bar-val">${z.risk}%</span></div>`).join('')}</div>`;
        } else {
          side = `<h4 class="sub-head">Exit status</h4><div class="exit-list">${evac.exits.map((e) => `<div class="exit-item"><span class="exit-tag">${e.name}</span><span>${U.esc(e.desc)}</span>${UI.tone('Clear', 'normal')}</div>`).join('')}</div>
            <p class="muted small">Routing method: hazard spread is estimated by hop distance on the walking graph; exits are ranked with a risk-weighted Dijkstra search. Prototype logic only.</p>`;
        }
        UI.set(U.$('#ai-routes'), side);
      }
    },

    /* ----------------------------------------------------------- settings */
    settings: {
      update() {
        const s = Store.state;
        UI.syncThemeControls();
        U.$('#set-sound').checked = s.settings.sound;
        U.$('#set-interval').value = String(s.settings.interval);
        UI.set(U.$('#set-pause'), s.simulation.running ? `${U.icon('pause')} Pause stream` : `${U.icon('play')} Resume stream`);
        const form = U.$('#threshold-form');
        const version = s.settings._version || 'initial';
        if (form.dataset.version !== version) {
          form.dataset.version = version;
          form.innerHTML = `<div class="th-grid"><div class="th-head">Sensor</div><div class="th-head">Warning ≥</div><div class="th-head">Danger ≥</div>
            ${THRESHOLD_KEYS.map((k) => {
              const d = SENSOR_DEFS[k]; const t = s.settings.thresholds[k];
              const stepVal = d.decimals === 2 ? '0.05' : d.decimals === 1 ? '0.5' : '10';
              return `<div class="th-name"><strong>${d.label}</strong><small>${d.model} · ${d.unit}</small></div>
                <input class="input" type="number" step="${stepVal}" name="${k}-warn" value="${t.warn}" aria-label="${d.label} warning">
                <input class="input" type="number" step="${stepVal}" name="${k}-danger" value="${t.danger}" aria-label="${d.label} danger">`;
            }).join('')}</div>
            <div class="form-error" id="th-error" hidden></div>
            <div class="row-gap row-gap--end"><button type="button" class="btn btn--ghost btn--sm" data-action="reset-thresholds">Restore defaults</button><button type="submit" class="btn btn--primary btn--sm">Save thresholds</button></div>`;
        }
        UI.set(U.$('#set-security'), UI.security());
        const n = s.settings.notify;
        const opt = (key, label, desc) => `<div class="setting-row"><div><strong>${label}</strong><p class="muted small">${desc}</p></div><label class="switch"><input type="checkbox" data-notify="${key}" ${n[key] ? 'checked' : ''}><span></span></label></div>`;
        UI.set(U.$('#set-notify'), opt('dashboard', 'Dashboard alerts', 'Banner, modal and notification centre') + opt('email', 'Email (simulated)', 'Would send to safety officers') + opt('sms', 'SMS (simulated)', 'Would send to on-call responders') + opt('criticalOnly', 'Critical only', 'Suppress pop-ups for Medium severity'));
        UI.set(U.$('#set-account'), `<span class="avatar avatar--lg">${s.user.initials}</span><div><strong>${U.esc(s.user.name)}</strong><small>${U.esc(s.user.role)} · ${U.esc(s.user.email)}</small></div>`);
      }
    }
  }
};
