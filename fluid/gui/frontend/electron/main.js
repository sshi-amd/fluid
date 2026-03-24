"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const isDev = !app.isPackaged;
const API_PORT = 5000;
const DEV_URL = "http://localhost:5173";
const PROD_URL = `http://127.0.0.1:${API_PORT}`;

const externalUrl = process.argv
  .find((a) => a.startsWith("--fluid-url="))
  ?.split("=")[1];

let mainWindow = null;
let pythonProcess = null;

// ─── Spawn the FastAPI backend ───────────────────────────────────────────────

function startPythonServer() {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  // When packaged, the server lives alongside the app resources.
  // In dev, rely on the project being installed in the active virtualenv.
  const serverArgs = [
    "-m", "uvicorn",
    "fluid.gui.server:app",
    "--host", "127.0.0.1",
    "--port", String(API_PORT),
    "--log-level", isDev ? "info" : "warning",
  ];

  pythonProcess = spawn(pythonCmd, serverArgs, {
    stdio: isDev ? "inherit" : "ignore",
    detached: false,
  });

  pythonProcess.on("error", (err) => {
    console.error("[fluid] Failed to start Python server:", err.message);
  });

  pythonProcess.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[fluid] Python server exited (code=${code}, signal=${signal})`);
    }
    pythonProcess = null;
  });
}

function stopPythonServer() {
  if (pythonProcess) {
    pythonProcess.kill("SIGTERM");
    pythonProcess = null;
  }
}

// ─── Wait for server to be ready ─────────────────────────────────────────────

function waitForServer(url, retries = 30, delayMs = 500) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    let attempts = 0;

    const tryConnect = () => {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (++attempts >= retries) {
          reject(new Error(`Server at ${url} did not become ready`));
        } else {
          setTimeout(tryConnect, delayMs);
        }
      });
    };

    tryConnect();
  });
}

// ─── Create BrowserWindow ────────────────────────────────────────────────────

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0e0e10",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Remove default menu bar on Linux/Windows
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  if (externalUrl) {
    await mainWindow.loadURL(externalUrl);
  } else if (isDev) {
    await mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadURL(PROD_URL);
  }

  // Open external links in the default browser rather than Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  if (!externalUrl) {
    startPythonServer();

    try {
      await waitForServer(`http://127.0.0.1:${API_PORT}/api/config`);
    } catch (err) {
      console.warn("[fluid] Server readiness check failed:", err.message);
    }
  }

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!externalUrl) stopPythonServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (!externalUrl) stopPythonServer();
});
