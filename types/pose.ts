/**
 * Pose detection and posture analysis types
 * - MediaPipe 33-point body landmark definitions
 * - Posture analysis result structures
 * - Detector state and configuration interfaces
 */

/**
 * Single 3D landmark point from MediaPipe
 * - x: Horizontal (0=left, 1=right)
 * - y: Vertical (0=top, 1=bottom)
 * - z: Depth (negative=closer to camera)
 * - visibility: Detection confidence (0-1)
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/**
 * Array of 33 body landmarks from MediaPipe
 * - Key points: nose(0), shoulders(11,12), hips(23,24)
 */
export type PoseLandmarks = PoseLandmark[];

/**
 * Posture issue types
 * - slouching, looking-away, looking-down, no-person, good-posture
 */
export type PostureIssueType = 
  | 'slouching' 
  | 'looking-away' 
  | 'looking-down' 
  | 'no-person'
  | 'good-posture';

/**
 * Posture analysis result
 * - type: Issue detected
 * - confidence: Detection certainty (0-1)
 * - slouchAngle: Forward lean angle (degrees)
 * - headTiltAngle: Downward tilt angle (degrees)
 * - shoulderAlignment: Shoulder levelness (degrees)
 * - headYaw: Left/right head rotation (degrees, 0=center, +/-=turned)
 * - headPitch: Up/down head tilt (degrees, 0=level, +=down, -=up)
 */
export interface PostureAnalysis {
  type: PostureIssueType;
  confidence: number;
  slouchAngle: number;
  headTiltAngle: number;
  shoulderAlignment: number;
  headYaw: number; // NEW: left/right rotation
  headPitch: number; // NEW: up/down tilt
}

/**
 * Pose detector lifecycle states
 * - idle, loading, ready, detecting, error
 */
export type PoseDetectorState = 
  | 'idle' 
  | 'loading' 
  | 'ready' 
  | 'detecting' 
  | 'error';

/**
 * Pose detector configuration
 * - modelComplexity: 0(fast), 1(balanced), 2(accurate)
 * - smoothLandmarks: Reduce jitter
 * - minDetectionConfidence, minTrackingConfidence: Thresholds (0-1)
 */
export interface PoseDetectorConfig {
  modelComplexity?: 0 | 1 | 2;
  smoothLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Single pose detection result
 * - landmarks: 33 body points (null if no person)
 * - posture: Analysis with issue type and metrics
 * - timestamp: Detection time (ms)
 */
export interface PoseDetectionResult {
  landmarks: PoseLandmarks | null;
  posture: PostureAnalysis;
  timestamp: number;
}

/**
 * Calibration baseline data
 * - User's good posture reference metrics
 */
export interface CalibrationData {
  slouchAngle: number;
  headTiltAngle: number;
  shoulderAlignment: number;
  shoulderHeight: number; // NEW: Baseline shoulder height for detecting slipping down
  headYaw: number; // Baseline left/right head rotation
  headPitch: number; // Baseline up/down head tilt
  timestamp: number;
}

/**
 * usePosture hook return value
 * - state, error, result: Current detector status and results
 * - startDetection, stopDetection: Control functions
 * - calibrate, clearCalibration: Calibration functions
 * - isCalibrated: Whether baseline exists
 * - isReady: Convenience flag (detector loaded)
 */
export interface UsePostureReturn {
  state: PoseDetectorState;
  error: string | null;
  result: PoseDetectionResult | null;
  startDetection: (videoElement: HTMLVideoElement) => Promise<void>;
  stopDetection: () => void;
  calibrate: () => void;
  clearCalibration: () => void;
  isCalibrated: boolean;
  calibrationData: CalibrationData | null;
  isReady: boolean;
}

