const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let nextServerProcess = null;

const isDev = !app.isPackaged;
const PORT = process.env.PORT || 3000;

function waitForServer(url, timeout = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          resolve();
        })
        .on('error', () => {
          if (Date.now() - startTime > timeout) {
            reject(new Error(`Timeout waiting for internal server at ${url}`));
          } else {
            setTimeout(check, 300);
          }
        });
    };
    check();
  });
}

function startNextProductionServer() {
  return new Promise((resolve, reject) => {
    // In production, server.js from Next.js standalone output in standalone_dist
    const serverPath = path.join(process.resourcesPath, 'standalone_dist', 'server', 'server.js');

    nextServerProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: PORT.toString(),
      },
      stdio: 'inherit',
    });

    nextServerProcess.on('error', (err) => {
      console.error('Failed to start Next.js internal server:', err);
      reject(err);
    });

    nextServerProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Next.js internal server exited with code ${code}`);
      }
    });

    // Wait until localhost:PORT responds
    const targetUrl = `http://localhost:${PORT}`;
    waitForServer(targetUrl, 45000)
      .then(() => resolve(targetUrl))
      .catch(reject);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 950,
    minHeight: 650,
    title: 'WhatsApp Chrome Automation',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  let loadUrl = `http://localhost:${PORT}`;

  if (!isDev) {
    try {
      loadUrl = await startNextProductionServer();
    } catch (err) {
      console.error('Error starting production Next.js server:', err);
      dialog.showErrorBox(
        'Server Initialization Error',
        `Failed to start internal Next.js application server: ${err.message}\n\nPlease check if port ${PORT} is in use.`
      );
    }
  }

  // Load the web application
  mainWindow.loadURL(loadUrl);

  // Open external links in user's default browser instead of electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  // Automatic updates from GitHub Releases
  if (!isDev) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Check 5 seconds after startup
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => {
        console.log('[AutoUpdater] Initial check notice:', e.message);
      });
    }, 5000);

    // Periodically check every 2 hours
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 2 * 60 * 60 * 1000);

    autoUpdater.on('update-downloaded', (info) => {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: `A new version (v${info.version}) has been downloaded automatically!`,
          detail: 'Would you like to restart the application now to install the update?',
          buttons: ['Restart and Update', 'Later'],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextServerProcess) {
    try {
      nextServerProcess.kill();
    } catch (e) {
      // quiet cleanup
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
