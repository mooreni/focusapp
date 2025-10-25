/**
 * Pose detection management hook
 * - Wraps MediaPipe detector for React
 * - Loads model, runs detection loop, manages state
 * - Handles cleanup automatically
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MediaPipePoseDetector } from '@/lib/mediapipe-pose';
import type {
  PoseDetectorState,
  PoseDetectionResult,
  UsePostureReturn,
  PoseDetectorConfig,
} from '@/types/pose';

// Detection loop FPS (10 FPS for reliability and CPU efficiency)
// - Posture changes slowly, high FPS not needed
// - Gives MediaPipe 100ms per frame (prevents memory errors)
const DEFAULT_DETECTION_FPS = 10;

// UI update throttling settings (prevents screen shaking from constant re-renders)
const ANGLE_CHANGE_THRESHOLD = 2; // Degrees - only update if angle changes by 2+ degrees
const CONFIDENCE_CHANGE_THRESHOLD = 0.1; // 10% confidence change to trigger update
const MAX_UPDATE_INTERVAL = 1000; // Force update every 1 second (keeps UI fresh)

/**
 * Checks if posture results have changed significantly
 * - Compares angles and confidence levels
 * - Only returns true if meaningful change detected
 * - Prevents UI updates on tiny fluctuations
 */
function hasSignificantChange(
  current: PoseDetectionResult,
  previous: PoseDetectionResult | null
): boolean {
  // First result always updates
  if (!previous) return true;

  // Posture type changed (slouching -> good, etc)
  if (current.posture.type !== previous.posture.type) return true;

  const currPosture = current.posture;
  const prevPosture = previous.posture;

  // Check if any angle changed significantly
  const slouchDiff = Math.abs(currPosture.slouchAngle - prevPosture.slouchAngle);
  const headTiltDiff = Math.abs(currPosture.headTiltAngle - prevPosture.headTiltAngle);
  const shoulderDiff = Math.abs(currPosture.shoulderAlignment - prevPosture.shoulderAlignment);
  const headYawDiff = Math.abs(currPosture.headYaw - prevPosture.headYaw); // NEW: yaw change
  const headPitchDiff = Math.abs(currPosture.headPitch - prevPosture.headPitch); // NEW: pitch change
  const confidenceDiff = Math.abs(currPosture.confidence - prevPosture.confidence);

  // Update if any metric changed beyond threshold
  return (
    slouchDiff >= ANGLE_CHANGE_THRESHOLD ||
    headTiltDiff >= ANGLE_CHANGE_THRESHOLD ||
    shoulderDiff >= ANGLE_CHANGE_THRESHOLD ||
    headYawDiff >= ANGLE_CHANGE_THRESHOLD || // NEW: check yaw changes
    headPitchDiff >= ANGLE_CHANGE_THRESHOLD || // NEW: check pitch changes
    confidenceDiff >= CONFIDENCE_CHANGE_THRESHOLD
  );
}

/**
 * Pose detection lifecycle hook
 * @param config - Optional detector configuration
 * @returns State, results, and control functions
 */
export function usePosture(config?: PoseDetectorConfig): UsePostureReturn {
  // Detector state
  const [state, setState] = useState<PoseDetectorState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PoseDetectionResult | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationData, setCalibrationData] = useState<any>(null);

  // Refs
  const detectorRef = useRef<MediaPipePoseDetector | null>(null); // MediaPipe instance
  const detectionIntervalRef = useRef<number | null>(null); // Interval ID
  const videoElementRef = useRef<HTMLVideoElement | null>(null); // Video element
  const isMountedRef = useRef(true); // Mount status
  const lastUpdateRef = useRef<PoseDetectionResult | null>(null); // Previous result for comparison
  const lastUpdateTimeRef = useRef<number>(0); // Last UI update timestamp
  const isCalibratedRef = useRef(false); // Ref version of isCalibrated (avoids closure issues)

  // Initialize detector on mount (loads ML model automatically)
  useEffect(() => {
    const initializeDetector = async () => {
      if (detectorRef.current) {
        return; // Skip if already initialized
      }

      setState('loading');
      setError(null);

      try {
        // Create and initialize (downloads ML model)
        const detector = new MediaPipePoseDetector(config);
        await detector.initialize();

        if (isMountedRef.current) {
          detectorRef.current = detector;
          setState('ready');
        } else {
          await detector.dispose(); // Cleanup if unmounted during init
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(errorMessage);
          setState('error');
        }
      }
    };

    initializeDetector();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  /**
   * Detection loop function (runs repeatedly per FPS setting)
   * - Processes current video frame
   * - Updates result state ONLY if meaningful change detected
   * - Prevents screen shaking from constant re-renders
   * - ALWAYS captures landmarks (needed for calibration)
   * - ONLY shows posture analysis results if calibration is complete
   * - Uses ref for calibration check to avoid closure issues
   */
  const runDetection = useCallback(async () => {
    if (!detectorRef.current || !videoElementRef.current || !isMountedRef.current) {
      return; // Safety checks
    }

    try {
      // ALWAYS process video frame to capture landmarks
      // - Needed so user can calibrate
      // - MediaPipe runs regardless of calibration state
      const detectionResult = await detectorRef.current.detectPose(
        videoElementRef.current
      );

      if (isMountedRef.current) {
        // ONLY update UI with posture results if calibrated
        // - Before calibration: detection runs silently in background
        // - After calibration: results are displayed to user
        // - Uses REF (not state) to avoid closure issues with setInterval
        if (isCalibratedRef.current) {
          const now = Date.now();
          const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
          
          // Only update UI if:
          // 1. Significant change in posture metrics, OR
          // 2. 1+ second has passed since last update (keeps UI fresh)
          const shouldUpdate = 
            hasSignificantChange(detectionResult, lastUpdateRef.current) ||
            timeSinceLastUpdate >= MAX_UPDATE_INTERVAL;

          if (shouldUpdate) {
            console.log('Posture update:', detectionResult.posture.type, 'confidence:', detectionResult.posture.confidence);
            setResult(detectionResult);
            lastUpdateRef.current = detectionResult;
            lastUpdateTimeRef.current = now;
          }
          // If no significant change: detection continues but UI doesn't re-render
        }
        // If not calibrated: landmarks are being captured but not analyzed
        // This allows calibration to work when user clicks the button
      }
    } catch (err) {
      console.error('Pose detection error:', err); // Log but don't stop loop
      
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Detection failed';
        setError(errorMessage);
      }
    }
  }, []); // No dependencies - uses refs for all dynamic values

  /**
   * Starts pose detection on video element
   * - Begins continuous analysis loop
   * @param videoElement - Video element to analyze
   */
  const startDetection = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (!detectorRef.current || state !== 'ready') {
        setError('Detector not ready. Please wait for initialization to complete.');
        return;
      }

      // Stop existing loop if any
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }

      videoElementRef.current = videoElement;
      setState('detecting');
      setError(null);

      // Run immediately, then start interval
      await runDetection();
      const intervalMs = 1000 / DEFAULT_DETECTION_FPS;
      detectionIntervalRef.current = window.setInterval(runDetection, intervalMs);
    },
    [state, runDetection]
  );

  /**
   * Stops pose detection
   * - Stops loop, detector remains ready for restart
   */
  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    videoElementRef.current = null;

    if (state === 'detecting') {
      setState('ready');
    }
    setResult(null);
  }, [state]);

  /**
   * Calibrates posture detector with current pose
   * - Captures current pose as "good posture" baseline
   * - User should sit with good posture before calling this
   * - Automatically starts detection after successful calibration
   */
  const calibrate = useCallback(() => {
    if (!detectorRef.current) {
      setError('Detector not initialized');
      return;
    }

    if (!videoElementRef.current) {
      setError('Camera not started. Please start the camera first.');
      return;
    }

    // For initial calibration, we need to get current pose first
    // We'll do a one-time detection to capture landmarks for calibration
    const performCalibration = async () => {
      if (!detectorRef.current || !videoElementRef.current) {
        return;
      }

      try {
        // Get current pose for calibration (one-time detection)
        const detectionResult = await detectorRef.current.detectPose(
          videoElementRef.current
        );

        if (!detectionResult.landmarks) {
          setError('No pose detected. Make sure you are visible in the camera.');
          return;
        }

        // Call detector's calibrate method with current landmarks
        detectorRef.current.calibrate(detectionResult.landmarks);
        
        // Get calibration data to display in UI
        const calibData = detectorRef.current.getCalibration();
        setCalibrationData(calibData);
        
        // Update BOTH state and ref for calibration
        // - State: triggers UI re-render to show "Calibrated" badge
        // - Ref: allows detection loop to immediately start analyzing
        setIsCalibrated(true);
        isCalibratedRef.current = true; // Critical: Update ref so detection loop sees it
        setError(null);
        
        console.log('Calibration successful! Detection will now start.');
        
        // NOTE: Detection loop will automatically start analyzing on next interval
        // because isCalibratedRef.current is now true and runDetection checks this flag
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Calibration failed';
        setError(errorMsg);
        console.error('Calibration error:', err);
      }
    };

    performCalibration();
  }, []);

  /**
   * Clears calibration baseline
   * - Resets to uncalibrated state
   * - Detection will stop showing posture analysis
   */
  const clearCalibration = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.clearCalibration();
      
      // Update BOTH state and ref
      // - State: triggers UI re-render to show "Not Calibrated" badge
      // - Ref: stops detection loop from analyzing posture
      setIsCalibrated(false);
      isCalibratedRef.current = false; // Stop detection analysis
      setCalibrationData(null);
      setResult(null); // Clear any existing results
      console.log('Calibration cleared');
    }
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  return {
    state,
    error,
    result,
    startDetection,
    stopDetection,
    calibrate,
    clearCalibration,
    isCalibrated,
    calibrationData,
    isReady: state === 'ready' || state === 'detecting',
  };
}

