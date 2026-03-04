"use strict";

const WS_PROTOCOL = location.protocol === "https:" ? "wss:" : "ws:";
const WS_BASE = `${WS_PROTOCOL}//${location.host}`;

const cards = new Map();
let pollInterval = null;

// ─── Startup ───

document.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  await refreshContainers();
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
  const grid = document.getElementById("container-grid");
  const existing = new Set(cards.keys());

  for (const c of containers) {
    if (cards.has(c.name)) {
      updateCardStatus(c.name, c.status);
      existing.delete(c.name);
    } else {
      addCard(c);
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
    const serverNames = new Set();
    for (const c of containers) {
      serverNames.add(c.name);
      if (cards.has(c.name)) {
        updateCardStatus(c.name, c.status);
      }
    }
  } catch (e) {
    // server unreachable, ignore
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
        ${container.status === "running" ? "Click Shell or Claude to connect" : "Container stopped"}
      </div>
    </div>
    <div class="card-footer">
      <button class="btn btn-secondary" id="startstop-${container.name}"
        onclick="toggleStartStop('${container.name}')">${container.status === "running" ? "Stop" : "Start"}</button>
      <button class="btn btn-primary" id="claude-btn-${container.name}"
        onclick="connectTerminal('${container.name}', 'claude')"
        ${container.status !== "running" ? "disabled" : ""}>Claude</button>
      <button class="btn btn-secondary" id="shell-btn-${container.name}"
        onclick="connectTerminal('${container.name}', '/bin/bash')"
        ${container.status !== "running" ? "disabled" : ""}>Shell</button>
    </div>
  `;

  grid.appendChild(card);

  cards.set(container.name, {
    container,
    terminal: null,
    fitAddon: null,
    ws: null,
    currentCmd: null,
  });

  updateEmptyState();
}

function removeCard(name) {
  const state = cards.get(name);
  if (!state) return;
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  if (state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
  }
  const el = document.getElementById(`card-${name}`);
  if (el) el.remove();
  cards.delete(name);
  updateEmptyState();
}

// ─── Status helpers ───

function statusToCssClass(status) {
  if (status === "running") return "running";
  if (status === "exited" || status === "stopped" || status === "created")
    return "stopped";
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

  if (state.currentCmd === "claude" && status === "running") {
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

  const claudeBtn = document.getElementById(`claude-btn-${name}`);
  if (claudeBtn) claudeBtn.disabled = !isRunning;

  const shellBtn = document.getElementById(`shell-btn-${name}`);
  if (shellBtn) shellBtn.disabled = !isRunning;

  const ph = document.getElementById(`term-ph-${name}`);
  if (ph) {
    ph.textContent = isRunning
      ? "Click Shell or Claude to connect"
      : "Container stopped";
  }

  state.container.status = status;
}

// ─── Terminal connection ───

function connectTerminal(name, cmd) {
  const state = cards.get(name);
  if (!state) return;

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  if (state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
    state.fitAddon = null;
  }

  const ph = document.getElementById(`term-ph-${name}`);
  if (ph) ph.remove();

  const wrap = document.getElementById(`term-wrap-${name}`);
  if (!wrap) return;

  const termDiv = document.createElement("div");
  termDiv.style.height = "100%";
  wrap.innerHTML = "";
  wrap.appendChild(termDiv);

  const term = new Terminal({
    theme: {
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
    },
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termDiv);

  requestAnimationFrame(() => {
    fitAddon.fit();
  });

  state.terminal = term;
  state.fitAddon = fitAddon;
  state.currentCmd = cmd;

  if (cmd === "claude") {
    updateCardStatus(name, "running");
    const dot = document.getElementById(`dot-${name}`);
    if (dot) dot.className = "status-dot claude-active";
    const statusEl = document.getElementById(`status-${name}`);
    if (statusEl) statusEl.textContent = "claude active";
  }

  const wsUrl = `${WS_BASE}/ws/terminal/${encodeURIComponent(name)}?cmd=${encodeURIComponent(cmd)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  state.ws = ws;

  ws.onopen = () => {
    const dims = { type: "resize", cols: term.cols, rows: term.rows };
    ws.send(JSON.stringify(dims));
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
    state.ws = null;
    state.currentCmd = null;
    updateCardStatus(name, state.container.status);
  };

  ws.onerror = () => {
    term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;

    const isCopy = (e.ctrlKey && e.shiftKey && e.key === "C") ||
                   (e.ctrlKey && e.key === "c" && term.hasSelection());
    const isPaste = (e.ctrlKey && e.shiftKey && e.key === "V") ||
                    (e.ctrlKey && e.key === "v");

    if (isCopy) {
      const sel = term.getSelection();
      if (sel) {
        navigator.clipboard.writeText(sel).catch(() => {});
      }
      return false;
    }

    if (isPaste) {
      navigator.clipboard.readText().then((text) => {
        if (text && ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(text));
        }
      }).catch(() => {});
      return false;
    }

    return true;
  });

  termDiv.addEventListener("contextmenu", (e) => {
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
        if (text && ws.readyState === WebSocket.OPEN) {
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

  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
  });
  resizeObserver.observe(wrap);
}

// ─── Start / Stop ───

async function toggleStartStop(name) {
  const state = cards.get(name);
  if (!state) return;

  if (state.container.status === "running") {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
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
    { label: "Shell", action: () => connectTerminal(name, "/bin/bash"), disabled: !isRunning },
    { label: "Claude", action: () => connectTerminal(name, "claude"), disabled: !isRunning },
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
  await api("DELETE", `/containers/${encodeURIComponent(name)}`);
  removeCard(name);
}

// ─── Create dialog ───

function showCreateDialog() {
  document.getElementById("create-dialog").style.display = "flex";
  document.getElementById("create-name").value = "";
  document.getElementById("create-version").value = appConfig ? appConfig.default_rocm_version : "latest";
  document.getElementById("create-distro").value = appConfig ? appConfig.default_distro : "ubuntu-22.04";
  document.getElementById("create-workspace").value = "";
}

async function submitCreate() {
  const name = document.getElementById("create-name").value.trim() || null;
  const rocm_version = document.getElementById("create-version").value;
  const distro = document.getElementById("create-distro").value;
  const workspace = document.getElementById("create-workspace").value.trim() || null;

  hideDialog("create-dialog");

  try {
    const result = await api("POST", "/containers", {
      name, rocm_version, distro, workspace,
    });

    if (result.error) {
      alert(`Error: ${result.error}`);
      return;
    }

    if (!cards.has(result.name)) {
      addCard(result);
    }
  } catch (e) {
    alert(`Error creating container: ${e.message}`);
  }
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
