/**
 * TypeScript definitions for Electron API
 * Provides type safety and auto-completion for window.electronAPI
 */

export interface ElectronAPI {
  /**
   * Request camera permission from the operating system
   * @returns Promise that resolves to true if permission granted
   */
  requestCameraPermission: () => Promise<boolean>;

  /**
   * Get the current operating system platform
   * @returns 'win32' (Windows), 'darwin' (macOS), or 'linux'
   */
  getPlatform: () => Promise<'win32' | 'darwin' | 'linux'>;

  /**
   * Check if a camera is available on the system
   * @returns Promise that resolves to true if camera is available
   */
  isCameraAvailable: () => Promise<boolean>;

  /**
   * Listen for events from the main process
   * @param callback - Function called when events occur
   * @returns Cleanup function to remove the listener
   */
  onAppEvent: (callback: (event: string, data: any) => void) => () => void;

  /**
   * Send a log message to the main process console
   * @param message - The message to log
   */
  log: (message: string) => void;
}

/**
 * Extend Window interface to include Electron API
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
