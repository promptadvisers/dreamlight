const { app, BrowserWindow, Menu, nativeImage } = require("electron");
const setupMenuBar = require("./menubar");
const fs = require("fs");
const http = require("http");
const path = require("path");

// Packaged app: web/ ships inside Resources. Dev: the sibling ../web folder.
const WEB_DIR = app.isPackaged ? path.join(process.resourcesPath, "web") : path.resolve(__dirname, "..", "web");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
};

function startOfflineStaticServer() {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, "");
    if (!relPath) relPath = "index.html";
    if (relPath === "api/tracks") relPath = "tracks.json";

    const fullPath = path.resolve(WEB_DIR, relPath);
    if (!fullPath.startsWith(WEB_DIR + path.sep) && fullPath !== WEB_DIR) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const range = req.headers.range;

      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
          if (start >= stat.size || start > end) {
            res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
            res.end();
            return;
          }
          res.writeHead(206, {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
          });
          fs.createReadStream(fullPath, { start, end }).pipe(res);
          return;
        }
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": stat.size,
      });
      fs.createReadStream(fullPath).pipe(res);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

let staticServer = null;
let mainWindow = null;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function createWindow() {
  const { server, port } = await startOfflineStaticServer();
  staticServer = server;
  const baseUrl = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#03050c",
    title: "Dreamlight — Neural Focus Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep audio, timers and the menu bar live when hidden
    },
  });

  mainWindow.loadURL(`${baseUrl}/`);

  // Closing the window keeps Dreamlight playing in the menu bar. Quit from the menu bar or Cmd+Q.
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  const run = (js) => mainWindow.webContents.executeJavaScript(js, true).catch(() => null);
  setupMenuBar({ getMainWindow: () => mainWindow, showMainWindow, baseUrl });

  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, "assets", "icon-1024.png")));
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: "Play / Pause", click: () => run("togglePlay()") },
      { label: "Next session", click: () => run("playNext(true)") },
      { label: "25 min focus", click: () => run("setFocusTimer(25)") },
      { label: "50 min focus", click: () => run("setFocusTimer(50)") },
    ]));
    // Dock badge shows the focus timer countdown while it runs.
    setInterval(async () => {
      const t = await run("state.timerTotalSec ? Math.ceil(state.timerRemainSec / 60) + 'm' : ''");
      app.dock.setBadge(t || "");
    }, 5000);
  }
}

app.on("before-quit", () => { app.isQuitting = true; });

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") { if (staticServer) staticServer.close(); app.quit(); }
});

app.on("activate", () => {
  if (mainWindow) showMainWindow();
  else createWindow();
});
