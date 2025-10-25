/**
 * Camera access and streaming hook
 * - Requests browser permissions
 * - Manages video stream lifecycle
 * - Handles errors and state
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  CameraState,
  CameraError,
  CameraConfig,
  UseCameraReturn,
} from '@/types/camera';

// Default camera configuration (balances quality and performance)
const DEFAULT_CONFIG: Required<CameraConfig> = {
  width: 640, // Standard definition
  height: 480,
  frameRate: 30, // 30 FPS
};

/**
 * Camera access and control hook
 * @param config - Optional video quality/performance settings
 * @returns Camera state, stream, and control functions
 */
export function useCamera(config: CameraConfig = {}): UseCameraReturn {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Camera state
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<CameraError | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const isMountedRef = useRef(true); // Prevents state updates after unmount

  // Browser support check (uses state to avoid SSR hydration errors)
  const [isSupported, setIsSupported] = useState(true);

  // Check browser support on mount (client-side only)
  useEffect(() => {
    const supported = typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;
    
    setIsSupported(supported);
  }, []);

  /**
   * Converts browser error to user-friendly format
   * @param err - getUserMedia error
   * @returns Standardized camera error
   */
  const handleCameraError = useCallback((err: Error): CameraError => {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return {
        type: 'permission-denied',
        message: 'Camera access was denied. Please allow camera permissions in your browser settings.',
      };
    }

    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return {
        type: 'not-found',
        message: 'No camera was found on your device. Please connect a camera and try again.',
      };
    }

    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return {
        type: 'not-readable',
        message: 'Camera is already in use by another application. Please close other apps using the camera.',
      };
    }

    return {
      type: 'unknown',
      message: `An unexpected error occurred: ${err.message}`,
    };
  }, []);

  /**
   * Starts camera and requests permissions
   * - Shows browser permission dialog
   * - Initializes video stream
   * - Has 10-second timeout to detect stuck requests
   */
  const startCamera = useCallback(async () => {
    if (!isSupported) {
      const err: CameraError = {
        type: 'unknown',
        message: 'Your browser does not support camera access.',
      };
      setError(err);
      setState('error');
      return;
    }

    console.log('Starting camera...');
    setState('requesting');
    setError(null);

    try {
      // Create a timeout promise (10 seconds)
      // - Detects if getUserMedia hangs (e.g., permission dialog dismissed)
      const timeoutPromise = new Promise<MediaStream>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Camera permission request timed out. Please check your browser permissions.'));
        }, 10000); // 10 second timeout
      });

      // Request camera access (shows browser permission dialog)
      const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: finalConfig.width },
          height: { ideal: finalConfig.height },
          frameRate: { ideal: finalConfig.frameRate },
        },
        audio: false, // No audio needed
      });

      console.log('Waiting for camera permission...');
      
      // Race between actual request and timeout
      // - Whichever resolves/rejects first wins
      const mediaStream = await Promise.race([
        getUserMediaPromise,
        timeoutPromise
      ]);

      console.log('Camera permission granted, stream acquired');

      // Update state only if component still mounted
      if (isMountedRef.current) {
        setStream(mediaStream);
        setState('active');
        console.log('Camera now active');
      } else {
        console.log('Component unmounted, cleaning up stream');
        mediaStream.getTracks().forEach(track => track.stop()); // Cleanup if unmounted
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (isMountedRef.current) {
        const cameraError = handleCameraError(err as Error);
        setError(cameraError);
        setState('error');
      }
    }
  }, [isSupported, finalConfig, handleCameraError]);

  /**
   * Stops camera and releases resources
   * - Turns off camera light
   * - Important for privacy and battery
   */
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setState('idle');
      setError(null);
    }
  }, [stream]);

  /**
   * Temporarily pauses camera without stopping
   * - Disables video track
   * - Keeps stream for quick resume
   */
  const pauseCamera = useCallback(() => {
    if (stream && state === 'active') {
      stream.getVideoTracks().forEach(track => {
        track.enabled = false;
      });
      setState('paused');
    }
  }, [stream, state]);

  /**
   * Resumes camera from paused state
   * - Re-enables video track
   */
  const resumeCamera = useCallback(() => {
    if (stream && state === 'paused') {
      stream.getVideoTracks().forEach(track => {
        track.enabled = true;
      });
      setState('active');
    }
  }, [stream, state]);

  // Cleanup on unmount (prevents memory leaks)
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return {
    state,
    error,
    stream,
    startCamera,
    stopCamera,
    pauseCamera,
    resumeCamera,
    isSupported,
  };
}

