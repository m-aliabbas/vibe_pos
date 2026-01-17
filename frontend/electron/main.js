// electron/main.js
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

const isDev = !app.isPackaged;

let mainWindow;
let nextServer;

console.log('=== Electron Starting ===');
console.log('isDev:', isDev);
console.log('isPackaged:', app.isPackaged);
console.log('resourcesPath:', process.resourcesPath);

function safeWrite(stream, text) {
  try {
    stream.write(text);
  } catch (_) {
    // Avoid crashing on EPIPE when launched from Finder etc.
  }
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 30000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const sock = new net.Socket();

      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(tick, 250);
        }
      });

      sock.connect(port, host, () => {
        sock.end();
        resolve();
      });
    };

    tick();
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;

    // We run Next from a REAL directory on disk (app.asar.unpacked).
    // This avoids recursion + ENOTDIR issues.
    const rootPath = isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : path.join(__dirname, '..');

    const nextCli = isPackaged
      ? path.join(rootPath, 'node_modules', 'next', 'dist', 'bin', 'next')
      : path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

    console.log('Starting Next.js server...');
    console.log('Root path:', rootPath);
    console.log('Next CLI:', nextCli);
    console.log('Is packaged:', isPackaged);

    // CRITICAL FIX:
    // Use ELECTRON_RUN_AS_NODE=1 instead of --runAsNode.
    // This prevents Electron from launching your app again (infinite recursion).
    const nodeRunner = process.execPath;
    const args = [nextCli, 'start', '-p', '3000'];

    nextServer = spawn(nodeRunner, args, {
      cwd: rootPath,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '3000',
        NEXT_TELEMETRY_DISABLED: '1',
        ELECTRON_RUN_AS_NODE: '1',
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { nextServer?.kill(); } catch {}
      reject(err);
    };

    nextServer.stdout.on('data', (data) => {
      safeWrite(process.stderr, `Next.js: ${data.toString()}`);
    });

    nextServer.stderr.on('data', (data) => {
      safeWrite(process.stderr, `Next.js Error: ${data.toString()}`);
    });

    nextServer.on('error', (err) => {
      console.error('Failed to spawn Next.js:', err);
      fail(err);
    });

    nextServer.on('exit', (code, signal) => {
      if (!settled) {
        fail(new Error(`Next.js exited early. code=${code} signal=${signal}`));
      }
    });

    waitForPort(3000, '127.0.0.1', 30000)
      .then(() => {
        if (settled) return;
        settled = true;
        console.log('Next.js server is listening on 3000');
        resolve();
      })
      .catch(fail);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'POS System',
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const url = isDev ? 'http://localhost:3000' : 'http://127.0.0.1:3000';

  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    console.error('Failed to load URL:', err);

    const safe = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(`
          <h2>POS System failed to start</h2>
          <p>Could not load: <b>${safe(url)}</b></p>
          <pre>${safe(err?.stack || err?.message || String(err))}</pre>
          <p>Check that Next starts and port 3000 opens.</p>
        `)
    );
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function killNextServer() {
  if (!nextServer) return;
  try {
    nextServer.kill('SIGTERM');
  } catch {}
  nextServer = null;
}

app.whenReady().then(async () => {
  console.log('App ready! isDev =', isDev);

  if (!isDev) {
    console.log('Production mode - starting Next.js server...');
    try {
      await startNextServer();
      console.log('Next.js server started successfully!');
    } catch (error) {
      console.error('Failed to start Next.js server:', error);
      app.quit();
      return;
    }
  } else {
    console.log('Development mode - expecting Next.js to be already running');
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killNextServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killNextServer();
});

process.on('exit', () => {
  killNextServer();
});
