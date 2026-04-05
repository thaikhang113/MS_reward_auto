// =============================================
// ELECTRON MAIN PROCESS
// Wraps the Express server + shows built-in window
// No CMD, no external Chrome needed!
// =============================================

import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
const PORT = 3000;

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 800,
        minHeight: 500,
        title: 'Bing Rewards Auto',
        icon: path.join(__dirname, 'public', 'icon.png'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Remove menu bar completely
    mainWindow.setMenu(null);

    // Start the Express server
    try {
        process.env.PORT = PORT;
        await import('./index.js');
        console.log('Express server started');
    } catch (e) {
        console.error('Failed to start server:', e.message);
    }

    // Wait a moment for server to be ready, then load
    await new Promise(r => setTimeout(r, 1500));
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Minimize to tray on close (instead of quitting)
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    // Create a simple tray icon (1x1 blue pixel as fallback)
    const iconPath = path.join(__dirname, 'public', 'icon.png');
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            // Create a simple 16x16 icon programmatically
            trayIcon = nativeImage.createEmpty();
        }
    } catch {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon.isEmpty()
        ? nativeImage.createFromBuffer(Buffer.alloc(16 * 16 * 4, 0xFF))
        : trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '📋 Mở Dashboard',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: '❌ Thoát',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Bing Rewards Auto');
    tray.setContextMenu(contextMenu);

    // Double-click tray icon to show window
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// App ready
app.whenReady().then(() => {
    createTray();
    createWindow();
});

app.on('window-all-closed', () => {
    // Don't quit on window close (tray keeps running)
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
