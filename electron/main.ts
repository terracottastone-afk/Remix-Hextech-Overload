import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import { fileURLToPath } from 'url';
import os from 'os';

// Robust ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[QUIT] Existing instance detected. Closing...');
  app.quit();
} else {
  // Move all app startup logic inside the lock branch
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Move UserData to a local temporary folder to avoid OneDrive/Permission issues
  if (!app.isPackaged) {
    const customPath = path.join(os.tmpdir(), 'hext-coach-v5');
    if (!fs.existsSync(customPath)) fs.mkdirSync(customPath, { recursive: true });
    app.setPath('userData', customPath);
    
    // Disable GPU and Hardware Acceleration to stop "Access Denied" errors in OneDrive folders
    app.disableHardwareAcceleration();
    
    // CRITICAL: Disable all caching to prevent "Access Denied" errors in protected folders
    app.commandLine.appendSwitch('disable-http-cache');
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
    app.commandLine.appendSwitch('disable-disk-cache');
  }

  app.whenReady().then(createWindow);
}

let mainWindow: BrowserWindow | null = null;

const agent = new https.Agent({ rejectUnauthorized: false });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 700,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  // Log paths for debugging if the bridge fails
  console.log('[DEBUG] Main Dir:', __dirname);
  console.log('[DEBUG] Preload Path:', path.join(__dirname, 'preload.js'));
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hotkeys
  globalShortcut.register('F9', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });

  globalShortcut.register('F10', () => {
    mainWindow?.webContents.send('trigger-rune-import');
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to find lockfile
const getLockfile = () => {
  const commonPaths = [
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
    'E:\\Riot Games\\League of Legends\\lockfile',
    'F:\\Riot Games\\League of Legends\\lockfile',
    'G:\\Riot Games\\League of Legends\\lockfile',
    path.join(process.env.LOCALAPPDATA || '', 'Riot Games/Riot Client/Config/lockfile'),
  ];

  for (const p of commonPaths) {
    console.log(`Checking path: ${p}`);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const [name, pid, port, password, protocol] = content.split(':');
        console.log(`[SUCCESS] Lockfile found at: ${p}`);
        return { port, password, protocol };
      } catch (e) {
        console.log(`[ERROR] Found lockfile at ${p} but could not read it. Permissions?`);
      }
    }
  }
  console.log(`[FAIL] No lockfile found in common locations.`);
  return null;
};

// LCU IPC
ipcMain.handle('lcu-request', async (_event, { path: lcuPath, method = 'GET', body = null }) => {
  const info = getLockfile();
  if (!info) return null;

  const url = `${info.protocol}://127.0.0.1:${info.port}${lcuPath}`;
  const auth = Buffer.from(`riot:${info.password}`).toString('base64');

  try {
    const res = await axios({
      method,
      url,
      data: body,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: agent
    });
    return res.data;
  } catch (err: any) {
    throw new Error(err.response?.data || err.message);
  }
});

// Live Game IPC
ipcMain.handle('game-request', async (_event, { path: gamePath }) => {
  const url = `https://127.0.0.1:2999/liveclientdata/${gamePath}`;
  try {
    const res = await axios.get(url, { httpsAgent: agent });
    return res.data;
  } catch (err: any) {
    throw new Error(err.message);
  }
});

// Atomic Rune Import IPC
ipcMain.handle('lcu-rune-import', async (_event, pageData) => {
  const info = getLockfile();
  if (!info) throw new Error("LCU not found");

  const auth = Buffer.from(`riot:${info.password}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  const baseUrl = `${info.protocol}://127.0.0.1:${info.port}`;

  try {
    const pagesRes = await axios.get(`${baseUrl}/lol-perks/v1/pages`, { headers, httpsAgent: agent });
    const editable = pagesRes.data.find((p: any) => p.isEditable);
    if (editable) {
      await axios.delete(`${baseUrl}/lol-perks/v1/pages/${editable.id}`, { headers, httpsAgent: agent });
    }
    const createRes = await axios.post(`${baseUrl}/lol-perks/v1/pages`, { ...pageData, current: true }, { headers, httpsAgent: agent });
    return createRes.data;
  } catch (err: any) {
    throw new Error(err.message);
  }
});

ipcMain.handle('read-lockfile', () => getLockfile());

// App Cleanup
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC for click-through toggling
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setIgnoreMouseEvents(ignore, options);
});
