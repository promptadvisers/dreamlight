const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPrefs", {
  read: () => ipcRenderer.sendSync("dreamlight:prefs:read"),
  write: (data) => ipcRenderer.send("dreamlight:prefs:write", data),
});
