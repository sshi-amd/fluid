"use strict";

const WS_PROTOCOL = location.protocol === "https:" ? "wss:" : "ws:";
const WS_BASE = `${WS_PROTOCOL}//${location.host}`;

const cards = new Map();
let pollInterval = null;

// ─── Startup ───

document.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  await refreshContainers();
  initHostTerminal();
  pollInterval = setInterval(pollStatuses, 3000);
});

// ─── API helpers ───

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  return res.json();
}

// ─── Config ───

let appConfig = null;

async function loadConfig() {
  appConfig = await api("GET", "/config");
  initComboBox("combo-version", "create-version", "combo-version-list",
    appConfig.rocm_versions, appConfig.default_rocm_version);
  initComboBox("combo-distro", "create-distro", "combo-distro-list",
    appConfig.distros, appConfig.default_distro);
  initComboBox("combo-gpu-family", "create-gpu-family", "combo-gpu-family-list",
    appConfig.therock_gpu_families || [], (appConfig.therock_gpu_families || [])[0] || "");
  initComboBox("combo-release-type", "create-release-type", "combo-release-type-list",
    appConfig.therock_release_types || [], "nightlies");

  const distroInput = document.getElementById("create-distro");
  distroInput.addEventListener("input", () => updateTheRockFields());
  distroInput.addEventListener("change", () => updateTheRockFields());
}

function updateTheRockFields() {
  const distro = document.getElementById("create-distro").value;
  const isTheRock = distro.startsWith("therock-");
  document.getElementById("therock-fields").style.display = isTheRock ? "block" : "none";

  const versionInput = document.getElementById("create-version");
  const versionList = document.getElementById("combo-version-list");
  if (isTheRock && appConfig) {
    versionInput.placeholder = "e.g. 7.12.0a20260304 or 7.11.0rc2";
    if (!versionInput.value || appConfig.rocm_versions.includes(versionInput.value)) {
      versionInput.value = (appConfig.therock_versions || [])[0] || "";
    }
  } else {
    versionInput.placeholder = "e.g. 6.3 or type a custom version";
    if (appConfig && appConfig.therock_versions &&
        appConfig.therock_versions.includes(versionInput.value)) {
      versionInput.value = appConfig.default_rocm_version;
    }
  }
}

// ─── Combo box (editable dropdown) ───

function initComboBox(wrapperId, inputId, listId, options, defaultValue) {
  const wrapper = document.getElementById(wrapperId);
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const toggle = wrapper.querySelector(".combo-toggle");

  input.value = defaultValue || "";

  function renderOptions(filter) {
    list.innerHTML = "";
    const query = (filter || "").toLowerCase();
    const filtered = query
      ? options.filter(o => o.toLowerCase().includes(query))
      : options;

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "combo-option";
      div.style.color = "var(--text-dim)";
      div.style.cursor = "default";
      div.textContent = query ? `Use custom: "${filter}"` : "No options";
      list.appendChild(div);
      return;
    }

    for (const opt of filtered) {
      const div = document.createElement("div");
      div.className = "combo-option";
      if (opt === input.value) div.classList.add("active");
      div.textContent = opt;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = opt;
        closeCombo();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      list.appendChild(div);
    }
  }

  function openCombo() {
    renderOptions(input.value);
    list.classList.add("open");
  }

  function closeCombo() {
    list.classList.remove("open");
  }

  toggle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (list.classList.contains("open")) {
      closeCombo();
    } else {
      renderOptions("");
      list.classList.add("open");
      input.focus();
    }
  });

  input.addEventListener("focus", () => openCombo());
  input.addEventListener("input", () => renderOptions(input.value));
  input.addEventListener("blur", () => {
    setTimeout(closeCombo, 150);
  });

  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll(".combo-option");
    const highlighted = list.querySelector(".combo-option.highlighted");
    let idx = Array.from(items).indexOf(highlighted);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!list.classList.contains("open")) { openCombo(); return; }
      idx = Math.min(idx + 1, items.length - 1);
      items.forEach(i => i.classList.remove("highlighted"));
      if (items[idx]) { items[idx].classList.add("highlighted"); items[idx].scrollIntoView({ block: "nearest" }); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      items.forEach(i => i.classList.remove("highlighted"));
      if (items[idx]) { items[idx].classList.add("highlighted"); items[idx].scrollIntoView({ block: "nearest" }); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted) {
        input.value = highlighted.textContent;
      }
      closeCombo();
    } else if (e.key === "Escape") {
      closeCombo();
    }
  });
}

// ─── Container list ───

async function refreshContainers() {
  const containers = await api("GET", "/containers");
  const serverNames = new Set(containers.map((c) => c.name));

  for (const c of containers) {
    if (cards.has(c.name)) {
      updateCardStatus(c.name, c.status);
    } else {
      addCard(c);
    }
  }

  for (const name of [...cards.keys()]) {
    if (!serverNames.has(name)) {
      removeCard(name);
    }
  }

  updateEmptyState();
}

function updateEmptyState() {
  const empty = document.getElementById("empty-state");
  const count = cards.size;
  if (count === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }
  document.getElementById("header-count").textContent =
    `${count} container${count !== 1 ? "s" : ""}`;
}

// ─── Poll statuses ───

async function pollStatuses() {
  if (cards.size === 0) return;
  try {
    const containers = await api("GET", "/containers");
    const serverNames = new Set(containers.map((c) => c.name));

    for (const c of containers) {
      if (cards.has(c.name)) {
        updateCardStatus(c.name, c.status);
      }
    }

    for (const name of [...cards.keys()]) {
      if (!serverNames.has(name)) {
        removeCard(name);
      }
    }

    updateEmptyState();
  } catch (e) {
    // server unreachable
  }
}

// ─── Card management ───

function addCard(container) {
  const grid = document.getElementById("container-grid");
  const card = document.createElement("div");
  card.className = "container-card";
  card.id = `card-${container.name}`;

  const statusClass = statusToCssClass(container.status);
  const statusLabel = statusToLabel(container.status);
  const subtitle = container.rocm_version !== "?"
    ? `ROCm ${container.rocm_version}` : "";
  const workspaceText = container.workspace
    ? ` · ${container.workspace}` : "";
  const isRunning = container.status === "running";

  card.innerHTML = `
    <div class="card-header">
      <div class="status-dot ${statusClass}" id="dot-${container.name}"></div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(container.display_name)}</div>
        <div class="card-subtitle">${escapeHtml(subtitle + workspaceText)}</div>
      </div>
      <span class="card-status" id="status-${container.name}">${statusLabel}</span>
      <button class="card-menu-btn" onclick="showCardMenu(event, '${container.name}')">&#x22EF;</button>
    </div>
    <div class="card-terminal" id="term-wrap-${container.name}">
      <div class="terminal-placeholder" id="term-ph-${container.name}">
        ${isRunning ? "Click Shell or Claude to connect" : "Container stopped"}
      </div>
    </div>
    <div class="card-footer">
      <button class="btn btn-secondary" id="startstop-${container.name}"
        onclick="toggleStartStop('${container.name}')">${isRunning ? "Stop" : "Start"}</button>
      <div class="tab-group">
        <button class="btn btn-primary tab-btn active" id="claude-btn-${container.name}"
          onclick="switchSession('${container.name}', 'claude')"
          ${!isRunning ? "disabled" : ""}>Claude</button>
        <button class="btn-reload" id="claude-reload-${container.name}"
          onclick="reloadSession('${container.name}', 'claude')"
          ${!isRunning ? "disabled" : ""} title="Restart Claude session">&#x21BB;</button>
      </div>
      <div class="tab-group">
        <button class="btn btn-secondary tab-btn" id="shell-btn-${container.name}"
          onclick="switchSession('${container.name}', '/bin/bash')"
          ${!isRunning ? "disabled" : ""}>Shell</button>
        <button class="btn-reload" id="shell-reload-${container.name}"
          onclick="reloadSession('${container.name}', '/bin/bash')"
          ${!isRunning ? "disabled" : ""} title="Restart Shell session">&#x21BB;</button>
      </div>
      <button class="btn btn-secondary" id="code-btn-${container.name}"
        onclick="openCode('${container.name}')"
        ${!isRunning ? "disabled" : ""}>Code</button>
    </div>
  `;

  grid.appendChild(card);

  cards.set(container.name, {
    container,
    sessions: {},
    activeCmd: null,
  });

  updateEmptyState();
}

function removeCard(name) {
  const state = cards.get(name);
  if (!state) return;
  for (const sess of Object.values(state.sessions)) {
    if (sess.ws) sess.ws.close();
    if (sess.terminal) sess.terminal.dispose();
  }
  const el = document.getElementById(`card-${name}`);
  if (el) el.remove();
  cards.delete(name);
  updateEmptyState();
}

// ─── Status helpers ───

function statusToCssClass(status) {
  if (status === "running") return "running";
  return "stopped";
}

function statusToLabel(status) {
  if (status === "running") return "running";
  if (status === "exited" || status === "stopped" || status === "created")
    return "stopped";
  return status;
}

function updateCardStatus(name, status) {
  const state = cards.get(name);
  if (!state) return;

  let cssClass = statusToCssClass(status);
  let label = statusToLabel(status);

  if (state.activeCmd === "claude" && status === "running") {
    cssClass = "claude-active";
    label = "claude active";
  }

  const dot = document.getElementById(`dot-${name}`);
  if (dot) dot.className = `status-dot ${cssClass}`;

  const statusEl = document.getElementById(`status-${name}`);
  if (statusEl) statusEl.textContent = label;

  const isRunning = status === "running";
  const startStop = document.getElementById(`startstop-${name}`);
  if (startStop) startStop.textContent = isRunning ? "Stop" : "Start";

  for (const id of [`claude-btn-${name}`, `shell-btn-${name}`, `code-btn-${name}`,
                     `claude-reload-${name}`, `shell-reload-${name}`]) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !isRunning;
  }

  const ph = document.getElementById(`term-ph-${name}`);
  if (ph) {
    ph.textContent = isRunning
      ? "Click Shell or Claude to connect"
      : "Container stopped";
  }

  state.container.status = status;
}

// ─── Session management (persistent sessions per card) ───

function switchSession(name, cmd) {
  const state = cards.get(name);
  if (!state) return;

  const wrap = document.getElementById(`term-wrap-${name}`);
  if (!wrap) return;

  // hide all existing session divs
  for (const [key, sess] of Object.entries(state.sessions)) {
    if (sess.el) sess.el.style.display = "none";
  }

  // remove placeholder if present
  const ph = document.getElementById(`term-ph-${name}`);
  if (ph) ph.style.display = "none";

  state.activeCmd = cmd;
  updateTabButtons(name, cmd);

  // reuse existing session if alive
  const existing = state.sessions[cmd];
  if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN) {
    existing.el.style.display = "block";
    requestAnimationFrame(() => existing.fitAddon.fit());
    updateCardStatus(name, state.container.status);
    return;
  }

  // clean up dead session
  if (existing) {
    if (existing.ws) existing.ws.close();
    if (existing.terminal) existing.terminal.dispose();
    if (existing.el) existing.el.remove();
    delete state.sessions[cmd];
  }

  // create new session
  const termDiv = document.createElement("div");
  termDiv.className = "session-terminal";
  wrap.appendChild(termDiv);

  const term = createTerminal(termDiv);
  const fitAddon = term._fitAddon;

  const sess = { terminal: term, fitAddon, el: termDiv, ws: null };
  state.sessions[cmd] = sess;

  const wsUrl = `${WS_BASE}/ws/terminal/${encodeURIComponent(name)}?cmd=${encodeURIComponent(cmd)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  sess.ws = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      term.write(new Uint8Array(event.data));
    } else {
      term.write(event.data);
    }
  };

  ws.onclose = () => {
    term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
    sess.ws = null;
  };

  ws.onerror = () => {
    term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  });

  attachClipboardHandlers(term, ws);
  attachTermContextMenu(termDiv, term, ws);

  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
  });
  resizeObserver.observe(wrap);

  updateCardStatus(name, state.container.status);
}

function reloadSession(name, cmd) {
  const state = cards.get(name);
  if (!state) return;

  const existing = state.sessions[cmd];
  if (existing) {
    if (existing.ws) existing.ws.close();
    if (existing.terminal) existing.terminal.dispose();
    if (existing.el) existing.el.remove();
    delete state.sessions[cmd];
  }

  switchSession(name, cmd);
}

function updateTabButtons(name, activeCmd) {
  const claudeBtn = document.getElementById(`claude-btn-${name}`);
  const shellBtn = document.getElementById(`shell-btn-${name}`);
  if (claudeBtn) {
    claudeBtn.className = `btn tab-btn ${activeCmd === "claude" ? "btn-primary active" : "btn-secondary"}`;
  }
  if (shellBtn) {
    shellBtn.className = `btn tab-btn ${activeCmd === "/bin/bash" ? "btn-primary active" : "btn-secondary"}`;
  }
}

// ─── Terminal factory ───

const TERM_THEME = {
  background: "#09090b",
  foreground: "#d4d4d8",
  cursor: "#d4d4d8",
  selectionBackground: "#3a3a50",
  black: "#18181b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e4e4e7",
  brightBlack: "#71717a",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
};

function createTerminal(container) {
  const term = new Terminal({
    theme: TERM_THEME,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  term._fitAddon = fitAddon;

  requestAnimationFrame(() => fitAddon.fit());

  return term;
}

function attachClipboardHandlers(term, ws) {
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;

    const isCopy = e.ctrlKey && e.shiftKey && (e.key === "C" || e.code === "KeyC");
    const isPaste = e.ctrlKey && e.shiftKey && (e.key === "V" || e.code === "KeyV");

    if (isCopy) {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      return false;
    }

    if (isPaste) {
      navigator.clipboard.readText().then((text) => {
        if (text && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(text));
        }
      }).catch(() => {});
      return false;
    }

    return true;
  });
}

function attachTermContextMenu(el, term, ws) {
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    closeMenu();

    const sel = term.getSelection();
    const menu = document.createElement("div");
    menu.className = "context-menu";

    if (sel) {
      const copyBtn = document.createElement("button");
      copyBtn.className = "context-menu-item";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(sel).catch(() => {});
        closeMenu();
      };
      menu.appendChild(copyBtn);
    }

    const pasteBtn = document.createElement("button");
    pasteBtn.className = "context-menu-item";
    pasteBtn.textContent = "Paste";
    pasteBtn.onclick = () => {
      navigator.clipboard.readText().then((text) => {
        if (text && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(text));
        }
      }).catch(() => {});
      closeMenu();
    };
    menu.appendChild(pasteBtn);

    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    document.body.appendChild(menu);
    activeMenu = menu;

    const dismiss = (ev) => {
      if (!menu.contains(ev.target)) {
        closeMenu();
        document.removeEventListener("click", dismiss);
      }
    };
    setTimeout(() => document.addEventListener("click", dismiss), 0);
  });
}

// ─── Code button ───

async function openCode(name) {
  const result = await api("POST", `/containers/${encodeURIComponent(name)}/code`);
  if (result.error) {
    alert(result.error);
  }
}

// ─── Start / Stop ───

async function toggleStartStop(name) {
  const state = cards.get(name);
  if (!state) return;

  if (state.container.status === "running") {
    for (const sess of Object.values(state.sessions)) {
      if (sess.ws) sess.ws.close();
    }
    await api("POST", `/containers/${encodeURIComponent(name)}/stop`);
    updateCardStatus(name, "exited");
  } else {
    await api("POST", `/containers/${encodeURIComponent(name)}/start`);
    updateCardStatus(name, "running");
  }
}

// ─── Context menu ───

let activeMenu = null;

function showCardMenu(event, name) {
  event.stopPropagation();
  closeMenu();

  const state = cards.get(name);
  if (!state) return;
  const isRunning = state.container.status === "running";

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const items = [
    { label: "Shell", action: () => switchSession(name, "/bin/bash"), disabled: !isRunning },
    { label: "Claude", action: () => switchSession(name, "claude"), disabled: !isRunning },
    { label: "Open in Editor", action: () => openCode(name), disabled: !isRunning },
    { sep: true },
    { label: isRunning ? "Stop" : "Start", action: () => toggleStartStop(name) },
    { sep: true },
    { label: "Remove", action: () => removeContainerAction(name), danger: true },
  ];

  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement("div");
      sep.className = "context-menu-sep";
      menu.appendChild(sep);
    } else {
      const btn = document.createElement("button");
      btn.className = `context-menu-item${item.danger ? " danger" : ""}`;
      btn.textContent = item.label;
      btn.disabled = item.disabled || false;
      btn.onclick = () => { closeMenu(); item.action(); };
      menu.appendChild(btn);
    }
  }

  const rect = event.target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);
  activeMenu = menu;

  const close = (e) => {
    if (!menu.contains(e.target)) {
      closeMenu();
      document.removeEventListener("click", close);
    }
  };
  setTimeout(() => document.addEventListener("click", close), 0);
}

function closeMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

async function removeContainerAction(name) {
  if (!confirm(`Remove container "${name}"? This cannot be undone.`)) return;
  removeCard(name);
  api("DELETE", `/containers/${encodeURIComponent(name)}`);
}

// ─── Host terminal (multi-tab bottom panel) ───

let htTabs = [];
let htActiveId = null;
let htCounter = 0;

function initHostTerminal() {
  addHostTab();
  initHostTerminalDrag();
}

function addHostTab() {
  const panel = document.getElementById("host-terminal");
  if (panel.classList.contains("collapsed")) {
    panel.classList.remove("collapsed");
  }

  htCounter++;
  const id = `ht-${htCounter}`;
  const label = htTabs.length === 0 ? "bash" : `bash (${htCounter})`;

  const wrap = document.getElementById("host-terminal-wrap");
  const pane = document.createElement("div");
  pane.className = "ht-pane";
  pane.id = `pane-${id}`;
  wrap.appendChild(pane);

  const term = createTerminal(pane);
  const fitAddon = term._fitAddon;

  const wsUrl = `${WS_BASE}/ws/host-terminal`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      term.write(new Uint8Array(event.data));
    } else {
      term.write(event.data);
    }
  };

  ws.onclose = () => {
    term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
    const tab = htTabs.find(t => t.id === id);
    if (tab) tab.ws = null;
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  });

  attachClipboardHandlers(term, ws);
  attachTermContextMenu(pane, term, ws);

  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
  });
  resizeObserver.observe(wrap);

  htTabs.push({ id, label, terminal: term, fitAddon, ws, pane, resizeObserver });
  switchHostTab(id);
  renderHostTabs();
}

function switchHostTab(id) {
  htActiveId = id;

  for (const tab of htTabs) {
    tab.pane.classList.toggle("active", tab.id === id);
  }

  const active = htTabs.find(t => t.id === id);
  if (active) {
    requestAnimationFrame(() => active.fitAddon.fit());
  }

  renderHostTabs();
}

function closeHostTab(id, event) {
  if (event) event.stopPropagation();

  const idx = htTabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = htTabs[idx];
  if (tab.ws) tab.ws.close();
  if (tab.terminal) tab.terminal.dispose();
  if (tab.pane) tab.pane.remove();
  htTabs.splice(idx, 1);

  if (htTabs.length === 0) {
    htActiveId = null;
    document.getElementById("host-terminal").classList.add("collapsed");
  } else if (htActiveId === id) {
    const newIdx = Math.min(idx, htTabs.length - 1);
    switchHostTab(htTabs[newIdx].id);
  }

  renderHostTabs();
}

function killActiveHostTab() {
  if (htActiveId) closeHostTab(htActiveId);
}

function renderHostTabs() {
  const container = document.getElementById("ht-tabs");
  container.innerHTML = "";

  for (const tab of htTabs) {
    const el = document.createElement("button");
    el.className = `ht-tab${tab.id === htActiveId ? " active" : ""}`;
    el.onclick = () => switchHostTab(tab.id);
    el.innerHTML = `<span>${escapeHtml(tab.label)}</span><span class="ht-tab-close" onclick="closeHostTab('${tab.id}', event)">&#x2715;</span>`;
    container.appendChild(el);
  }
}

function toggleHostTerminal() {
  const panel = document.getElementById("host-terminal");
  panel.classList.toggle("collapsed");

  if (!panel.classList.contains("collapsed") && htActiveId) {
    const active = htTabs.find(t => t.id === htActiveId);
    if (active) {
      requestAnimationFrame(() => active.fitAddon.fit());
    }
  }
}

function initHostTerminalDrag() {
  const handle = document.getElementById("host-terminal-drag");
  const panel = document.getElementById("host-terminal");
  if (!handle || !panel) return;

  let startY = 0;
  let startH = 0;

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = panel.offsetHeight;
    handle.classList.add("dragging");
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      const delta = startY - ev.clientY;
      const newH = Math.max(80, Math.min(startH + delta, window.innerHeight * 0.8));
      panel.style.height = `${newH}px`;
    }

    function onUp() {
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const active = htTabs.find(t => t.id === htActiveId);
      if (active) {
        requestAnimationFrame(() => active.fitAddon.fit());
      }
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ─── Page navigation ───

let currentPage = "home";

function switchPage(page) {
  currentPage = page;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  const pages = {
    home: document.getElementById("main"),
    settings: document.getElementById("page-settings"),
    images: document.getElementById("page-images"),
  };

  for (const [key, el] of Object.entries(pages)) {
    if (el) el.style.display = key === page ? "flex" : "none";
  }

  if (page === "settings") loadSettings();
  if (page === "images") loadImages();
}

// ─── Settings ───

async function loadSettings() {
  try {
    const data = await api("GET", "/settings");

    const fields = [
      { input: "settings-amd-gateway-key", status: "amd-gateway-key-status",
        value: data.amd_gateway_key, isSet: data.amd_gateway_key_set, label: "Key" },
      { input: "settings-anthropic-key", status: "anthropic-key-status",
        value: data.anthropic_api_key, isSet: data.anthropic_api_key_set, label: "Key" },
      { input: "settings-github-token", status: "github-token-status",
        value: data.github_token, isSet: data.github_token_set, label: "Token" },
    ];

    for (const f of fields) {
      const input = document.getElementById(f.input);
      input.value = f.value || "";
      input.dataset.masked = f.isSet ? "true" : "false";
      const statusEl = document.getElementById(f.status);
      statusEl.textContent = f.isSet ? `${f.label} is configured` : "Not set";
      statusEl.className = `settings-key-status${f.isSet ? " set" : ""}`;
    }

    document.getElementById("settings-anthropic-base-url").value = data.anthropic_base_url || "";
    document.getElementById("settings-anthropic-model").value = data.anthropic_model || "";
    document.getElementById("settings-save-status").textContent = "";
  } catch (e) {
    // ignore
  }
}

async function saveSettings() {
  const body = {};

  const maskedFields = [
    { id: "settings-amd-gateway-key", key: "amd_gateway_key" },
    { id: "settings-anthropic-key", key: "anthropic_api_key" },
    { id: "settings-github-token", key: "github_token" },
  ];

  for (const f of maskedFields) {
    const input = document.getElementById(f.id);
    if (input.dataset.masked === "true" && input.value.includes("*")) {
      continue;
    }
    body[f.key] = input.value.trim();
  }

  body.anthropic_base_url = document.getElementById("settings-anthropic-base-url").value.trim();
  body.anthropic_model = document.getElementById("settings-anthropic-model").value.trim();

  try {
    await api("PUT", "/settings", body);
    const status = document.getElementById("settings-save-status");
    status.textContent = "Settings saved";
    setTimeout(() => { status.textContent = ""; }, 3000);
    loadSettings();
  } catch (e) {
    alert(`Error saving settings: ${e.message}`);
  }
}

function toggleKeyVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
}

// ─── Images page ───

async function loadImages() {
  const images = await api("GET", "/images");
  const tbody = document.getElementById("images-tbody");
  const empty = document.getElementById("images-empty");
  const count = document.getElementById("images-count");

  tbody.innerHTML = "";

  if (images.length === 0) {
    empty.classList.remove("hidden");
    count.textContent = "0 images";
    return;
  }

  empty.classList.add("hidden");
  count.textContent = `${images.length} image${images.length !== 1 ? "s" : ""}`;

  for (const img of images) {
    const tr = document.createElement("tr");
    const statusClass = img.in_use ? "in-use" : "unused";
    const statusLabel = img.in_use ? "In use" : "Unused";

    tr.innerHTML = `
      <td><span class="img-tag">${escapeHtml(img.tag)}</span></td>
      <td>${escapeHtml(img.rocm_version)}</td>
      <td><span class="img-size">${img.size_mb} MB</span></td>
      <td><span class="img-status ${statusClass}"><span class="img-status-dot"></span>${statusLabel}</span></td>
      <td><button class="img-remove-btn" onclick="removeImage('${escapeHtml(img.id)}', ${img.in_use})"
        ${img.in_use ? "title=\"In use by a container\"" : ""}>Remove</button></td>
    `;

    tbody.appendChild(tr);
  }
}

async function removeImage(imageId, inUse) {
  if (inUse) {
    if (!confirm("This image is in use by a container. Force remove?")) return;
    api("DELETE", `/images/${encodeURIComponent(imageId)}?force=true`);
  } else {
    api("DELETE", `/images/${encodeURIComponent(imageId)}`);
  }
  setTimeout(loadImages, 500);
}

async function cleanImages(force) {
  const msg = force
    ? "Remove ALL Fluid images, including those in use by containers?"
    : "Remove unused Fluid images?";
  if (!confirm(msg)) return;

  const result = await api("POST", `/images/clean?force=${force}`);
  if (result.error) {
    alert(result.error);
  }
  loadImages();
}

// ─── Create dialog ───

function showCreateDialog() {
  document.getElementById("create-dialog").style.display = "flex";
  document.getElementById("create-name").value = "";
  document.getElementById("create-version").value = appConfig ? appConfig.default_rocm_version : "latest";
  document.getElementById("create-distro").value = appConfig ? appConfig.default_distro : "ubuntu-22.04";
  document.getElementById("create-workspace").value = "";
  document.getElementById("create-gpu-family").value = appConfig ? (appConfig.therock_gpu_families || [])[0] || "" : "";
  document.getElementById("create-release-type").value = "nightlies";
  updateTheRockFields();
}

async function submitCreate() {
  const name = document.getElementById("create-name").value.trim() || null;
  const rocm_version = document.getElementById("create-version").value;
  const distro = document.getElementById("create-distro").value;
  const workspace = document.getElementById("create-workspace").value.trim() || null;
  const isTheRock = distro.startsWith("therock-");
  const gpu_family = isTheRock ? document.getElementById("create-gpu-family").value.trim() : "";
  const release_type = isTheRock ? document.getElementById("create-release-type").value.trim() : "nightlies";

  hideDialog("create-dialog");

  const wsUrl = `${WS_BASE}/ws/create`;
  const ws = new WebSocket(wsUrl);

  let buildCardName = null;

  ws.onopen = () => {
    ws.send(JSON.stringify({ name, rocm_version, distro, workspace, gpu_family, release_type }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "init") {
      buildCardName = msg.name;
      addBuildQueueItem(msg.name, msg.display_name, msg.rocm_version);
    } else if (msg.type === "log") {
      appendBuildLog(buildCardName, msg.text);
    } else if (msg.type === "phase") {
      updateBuildPhase(buildCardName, msg.phase);
    } else if (msg.type === "done") {
      completeBuildItem(buildCardName, msg.container);
    } else if (msg.type === "error") {
      markBuildError(buildCardName, msg.message);
    }
  };

  ws.onerror = () => {
    if (buildCardName) markBuildError(buildCardName, "Connection lost");
  };
}

// ─── Build queue ───

const buildQueue = new Map();

function showBuildQueue() {
  document.getElementById("build-queue").classList.remove("hidden");
}

function hideBuildQueue() {
  document.getElementById("build-queue").classList.add("hidden");
}

function updateBuildQueueCount() {
  const count = buildQueue.size;
  document.getElementById("build-queue-count").textContent = count;
  if (count === 0) hideBuildQueue();
  else showBuildQueue();
}

function addBuildQueueItem(name, displayName, rocmVersion) {
  showBuildQueue();
  const list = document.getElementById("build-queue-list");

  const item = document.createElement("div");
  item.className = "bq-item expanded";
  item.id = `bq-${name}`;
  item.innerHTML = `
    <div class="bq-item-header">
      <div class="bq-spinner" id="bq-spinner-${name}"></div>
      <div class="bq-info">
        <div class="bq-name">${escapeHtml(displayName)}</div>
        <div class="bq-phase" id="bq-phase-${name}">Queued...</div>
      </div>
      <button class="bq-toggle" onclick="toggleBqItem('${name}')">&#9662;</button>
    </div>
    <div class="bq-progress"><div class="bq-progress-fill" id="bq-progress-${name}"></div></div>
    <div class="bq-log"><div class="bq-log-inner" id="bq-log-${name}"></div></div>
  `;

  list.prepend(item);
  buildQueue.set(name, true);
  updateBuildQueueCount();

  // also add a placeholder card in the grid
  const grid = document.getElementById("container-grid");
  const card = document.createElement("div");
  card.className = "container-card building-card";
  card.id = `card-${name}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="status-dot building" id="dot-${name}"></div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(displayName)}</div>
        <div class="card-subtitle">ROCm ${escapeHtml(rocmVersion)}</div>
      </div>
      <span class="card-status build-phase" id="status-${name}">building</span>
    </div>
    <div class="card-terminal">
      <div class="terminal-placeholder">Building image... see Build Queue &rarr;</div>
    </div>
    <div class="card-footer">
      <span class="build-progress-label" style="font-size:11px;color:var(--text-dim)">Image build in progress</span>
    </div>
  `;
  grid.prepend(card);

  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.classList.add("hidden");
}

function toggleBqItem(name) {
  const el = document.getElementById(`bq-${name}`);
  if (el) el.classList.toggle("expanded");
}

function appendBuildLog(name, text) {
  const log = document.getElementById(`bq-log-${name}`);
  if (!log) return;
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

function updateBuildPhase(name, phase) {
  const phaseEl = document.getElementById(`bq-phase-${name}`);
  const progressEl = document.getElementById(`bq-progress-${name}`);
  const statusEl = document.getElementById(`status-${name}`);

  const phases = {
    building_image: { label: "Building image...", progress: 40 },
    creating_container: { label: "Creating container...", progress: 85 },
  };

  const info = phases[phase] || { label: phase, progress: 50 };
  if (phaseEl) phaseEl.textContent = info.label;
  if (progressEl) progressEl.style.width = `${info.progress}%`;
  if (statusEl) statusEl.textContent = info.label.replace("...", "");
}

function completeBuildItem(name, container) {
  const spinner = document.getElementById(`bq-spinner-${name}`);
  if (spinner) spinner.className = "bq-spinner done";

  const phaseEl = document.getElementById(`bq-phase-${name}`);
  if (phaseEl) { phaseEl.textContent = "Done"; phaseEl.style.color = "var(--green)"; }

  const progressEl = document.getElementById(`bq-progress-${name}`);
  if (progressEl) { progressEl.style.width = "100%"; progressEl.style.background = "var(--green)"; }

  // replace placeholder card with real card
  const placeholder = document.getElementById(`card-${name}`);
  if (placeholder) placeholder.remove();
  addCard(container);

  // remove from queue after a delay
  setTimeout(() => {
    const bqEl = document.getElementById(`bq-${name}`);
    if (bqEl) bqEl.remove();
    buildQueue.delete(name);
    updateBuildQueueCount();
  }, 3000);
}

function markBuildError(name, message) {
  const spinner = document.getElementById(`bq-spinner-${name}`);
  if (spinner) spinner.className = "bq-spinner error";

  const phaseEl = document.getElementById(`bq-phase-${name}`);
  if (phaseEl) { phaseEl.textContent = `Failed: ${message}`; phaseEl.style.color = "var(--red)"; }

  const progressEl = document.getElementById(`bq-progress-${name}`);
  if (progressEl) { progressEl.style.width = "100%"; progressEl.style.background = "var(--red)"; }

  const dot = document.getElementById(`dot-${name}`);
  if (dot) dot.className = "status-dot stopped";

  const statusEl = document.getElementById(`status-${name}`);
  if (statusEl) { statusEl.textContent = "failed"; statusEl.style.color = "var(--red)"; }

  // remove from queue after longer delay
  setTimeout(() => {
    const bqEl = document.getElementById(`bq-${name}`);
    if (bqEl) bqEl.remove();
    const cardEl = document.getElementById(`card-${name}`);
    if (cardEl) cardEl.remove();
    buildQueue.delete(name);
    updateBuildQueueCount();
  }, 10000);
}

// ─── Add existing dialog ───

let addExistingData = [];

async function showAddExistingDialog() {
  document.getElementById("add-dialog").style.display = "flex";
  const list = document.getElementById("add-list");
  const status = document.getElementById("add-status");
  list.innerHTML = "";
  status.textContent = "Loading...";
  addExistingData = [];

  try {
    const containers = await api("GET", "/containers");
    const onDashboard = new Set(cards.keys());
    addExistingData = containers.filter((c) => !onDashboard.has(c.name));

    if (addExistingData.length === 0) {
      list.innerHTML = '<div class="add-list-empty">No additional containers found</div>';
      status.textContent = "";
      return;
    }

    for (const c of addExistingData) {
      const item = document.createElement("div");
      item.className = "add-list-item";
      item.dataset.name = c.name;
      item.onclick = () => item.classList.toggle("selected");
      item.innerHTML = `
        <input type="checkbox" onclick="event.stopPropagation(); this.parentElement.classList.toggle('selected')">
        <span>${escapeHtml(c.display_name)} &nbsp;<span style="color:var(--text-dim)">ROCm ${escapeHtml(c.rocm_version)} · ${escapeHtml(c.status)}</span></span>
      `;
      list.appendChild(item);
    }

    status.textContent = `${addExistingData.length} container(s) available`;
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
}

function submitAddExisting() {
  const items = document.querySelectorAll("#add-list .add-list-item.selected");
  for (const item of items) {
    const name = item.dataset.name;
    const c = addExistingData.find((x) => x.name === name);
    if (c && !cards.has(c.name)) {
      addCard(c);
    }
  }
  hideDialog("add-dialog");
}

// ─── Dialog helpers ───

function hideDialog(id) {
  document.getElementById(id).style.display = "none";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideDialog("create-dialog");
    hideDialog("add-dialog");
    closeMenu();
  }
});

// ─── Utils ───

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
