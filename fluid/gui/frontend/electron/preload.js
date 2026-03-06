"use strict";

// Preload runs with Node.js access in an isolated context.
// Expose only what the renderer genuinely needs via contextBridge.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Platform string — useful for conditional UI (e.g. macOS traffic lights)
  platform: process.platform,

  // Let the renderer request the app version
  getVersion: () => ipcRenderer.invoke("get-version"),
});
