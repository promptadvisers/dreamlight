const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dl", {
  cmd: (name, arg) => ipcRenderer.send("dl:cmd", name, arg),
  onState: (fn) => ipcRenderer.on("dl:state", (_e, s) => fn(s)),
  onSpectrum: (fn) => ipcRenderer.on("dl:spectrum", (_e, s) => fn(s)),
});
