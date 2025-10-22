/**
 * Electron Main Process
 * Entry point for the desktop application. Manages window creation,
 * system-level operations, and IPC communication with the renderer.
 */

const { app, BrowserWindow, systemPreferences, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

/**
 * Creates the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Flowly',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableWebRTC: true,
    },
  });

  // Load Next.js app
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  // Show window when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Clean up reference when window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Request camera and microphone permissions
 * Handles platform-specific permission requirements
 */
async function requestMediaPermissions() {
  if (process.platform === 'darwin') {
    try {
      const cameraStatus = await systemPreferences.getMediaAccessStatus('camera');
      console.log('Camera permission status:', cameraStatus);
      
      if (cameraStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        console.log(granted ? 'Camera permission granted' : 'Camera permission denied');
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
    }
  } else if (process.platform === 'win32') {
    console.log('Windows platform detected - camera permissions handled by browser');
  } else {
    console.log('Linux platform detected - no system-level camera permissions needed');
  }
}

/**
 * App ready - initialize permissions and create window
 */
app.whenReady().then(async () => {
  await requestMediaPermissions();
  createWindow();
  
  // macOS: recreate window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Quit when all windows are closed (except on macOS)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Handle media permission requests from web pages
 */
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    
    // Allow camera/microphone access for posture detection
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
});

/**
 * IPC Handlers - respond to requests from renderer process
 */

ipcMain.handle('request-camera-permission', async () => {
  return await requestMediaPermissions();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('is-camera-available', async () => {
  try {
    if (process.platform === 'darwin') {
      const status = await systemPreferences.getMediaAccessStatus('camera');
      return status === 'granted';
    }
    return true;
  } catch (error) {
    console.error('Error checking camera availability:', error);
    return false;
  }
});

ipcMain.on('log', (event, message) => {
  console.log('[Renderer]:', message);
});
