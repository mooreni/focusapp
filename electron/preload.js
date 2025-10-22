/**
 * Electron Preload Script
 * Creates a secure bridge between the main process and renderer process.
 * Exposes specific safe functions to the web page via window.electronAPI
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose safe APIs to renderer process
 * Available in Next.js via window.electronAPI
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Request camera permission from the OS
   * @returns {Promise<boolean>} True if permission granted
   */
  requestCameraPermission: () => {
    return ipcRenderer.invoke('request-camera-permission');
  },

  /**
   * Get current platform
   * @returns {Promise<string>} 'win32', 'darwin', or 'linux'
   */
  getPlatform: () => {
    return ipcRenderer.invoke('get-platform');
  },

  /**
   * Check if camera is available
   * @returns {Promise<boolean>} True if camera is available
   */
  isCameraAvailable: () => {
    return ipcRenderer.invoke('is-camera-available');
  },

  /**
   * Listen for app events from main process
   * @param {Function} callback - Called when events occur
   * @returns {Function} Cleanup function to remove listener
   */
  onAppEvent: (callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('app-event', subscription);
    return () => ipcRenderer.removeListener('app-event', subscription);
  },

  /**
   * Send log message to main process console
   * @param {string} message - Message to log
   */
  log: (message) => {
    ipcRenderer.send('log', message);
  },
});
