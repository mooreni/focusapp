/**
 * Camera system type definitions
 * - Camera state management
 * - Error handling
 * - Configuration options
 */

/**
 * Camera lifecycle states
 * - idle, requesting, active, error, paused
 */
export type CameraState = 'idle' | 'requesting' | 'active' | 'error' | 'paused';

/**
 * Camera error types
 * - permission-denied, not-found, not-readable, unknown
 */
export type CameraErrorType = 
  | 'permission-denied' 
  | 'not-found' 
  | 'not-readable' 
  | 'unknown';

/**
 * Camera error details
 * - type: Error category
 * - message: User-friendly description
 */
export interface CameraError {
  type: CameraErrorType;
  message: string;
}

/**
 * Camera stream configuration
 * - width, height: Video resolution (px)
 * - frameRate: FPS (lower = better performance)
 */
export interface CameraConfig {
  width?: number;
  height?: number;
  frameRate?: number;
}

/**
 * useCamera hook return value
 * - state, error, stream: Current camera status
 * - startCamera, stopCamera, pauseCamera, resumeCamera: Controls
 * - isSupported: Browser compatibility check
 */
export interface UseCameraReturn {
  state: CameraState;
  error: CameraError | null;
  stream: MediaStream | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  pauseCamera: () => void;
  resumeCamera: () => void;
  isSupported: boolean;
}

