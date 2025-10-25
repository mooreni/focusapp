/**
 * MediaPipe Pose Detection Library
 * - Loads ML model and processes video frames
 * - Analyzes posture (slouch, head tilt, etc.)
 * - Runs locally in browser (privacy-first)
 * - Uses dynamic imports to prevent Next.js SSR errors
 */

import type {
  PoseLandmarks,
  PostureAnalysis,
  PostureIssueType,
  PoseDetectorConfig,
  PoseDetectionResult,
} from '@/types/pose';

// MediaPipe types (loaded dynamically at runtime to avoid SSR issues)
type Pose = any;
type Results = any;

// Default detector configuration (balances accuracy and performance)
const DEFAULT_CONFIG: Required<PoseDetectorConfig> = {
  modelComplexity: 1, // 0=fast, 1=balanced, 2=accurate
  smoothLandmarks: true, // Reduces jitter
  minDetectionConfidence: 0.5, // 50% min to detect
  minTrackingConfidence: 0.5, // 50% min to track
};

// Key landmark indices (fixed by MediaPipe model)
const LANDMARK_INDICES = {
  NOSE: 0, // Head position
  LEFT_EYE: 2, // Head orientation
  RIGHT_EYE: 5,
  LEFT_EAR: 7, // Head rotation detection
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9, // Head tilt reference
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, // Slouch calculation
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, // Body baseline
  RIGHT_HIP: 24,
} as const;

// Posture issue detection thresholds (based on clinical research)
// Reference: https://pmc.ncbi.nlm.nih.gov/articles/PMC5446097/
const POSTURE_THRESHOLDS = {
  SLOUCH_ANGLE_THRESHOLD: 40, // degrees - CVA below this = forward head posture (normal: 48-54°)
  HEAD_TILT_THRESHOLD: 20, // degrees - sagittal tilt above this = looking down significantly
  HEAD_TURN_THRESHOLD: 30, // degrees - yaw beyond this = looking away from screen
  EYE_VISIBILITY_THRESHOLD: 0.6, // 0-1 - eyes must be 60%+ visible to be "facing camera"
  CONFIDENCE_THRESHOLD: 0.6, // 0-1 - minimum detection confidence
} as const;

// Calibration baseline type (stores user's good posture)
interface CalibrationBaseline {
  slouchAngle: number; // User's neutral slouch angle
  headTiltAngle: number; // User's neutral head position
  shoulderAlignment: number; // User's neutral shoulder position
  shoulderHeight: number; // NEW: User's neutral shoulder height
  headYaw: number; // User's neutral head yaw (left/right)
  headPitch: number; // User's neutral head pitch (up/down)
  timestamp: number; // When calibration was done
}

// Temporal smoothing settings (reduces jitter from frame-to-frame)
const SMOOTHING_WINDOW_SIZE = 5; // Average over last 5 frames
const DEVIATION_THRESHOLD_MULTIPLIER = 1.5; // How much deviation from baseline = issue

/**
 * MediaPipe Pose Detector
 * - Wraps MediaPipe with custom posture analysis
 * - Loads ML model, processes frames, analyzes posture
 */
export class MediaPipePoseDetector {
  private pose: Pose | null = null;
  private config: Required<PoseDetectorConfig>;
  private isInitialized = false;
  private lastResult: Results | null = null;
  private isProcessing = false; // Prevents simultaneous frame processing (WebAssembly safety)
  
  // Calibration baseline (user's good posture reference)
  private calibrationBaseline: CalibrationBaseline | null = null;
  
  // Temporal smoothing (rolling average of recent frames)
  private smoothingBuffer: {
    slouchAngles: number[];
    headTiltAngles: number[];
    shoulderAlignments: number[];
    shoulderHeights: number[]; // NEW: shoulder height smoothing
    headYaws: number[]; // NEW: yaw smoothing
    headPitches: number[]; // NEW: pitch smoothing
  } = {
    slouchAngles: [],
    headTiltAngles: [],
    shoulderAlignments: [],
    shoulderHeights: [], // NEW: shoulder height buffer
    headYaws: [],
    headPitches: [],
  };

  /**
   * Creates new detector instance
   * - config: Optional settings override
   */
  constructor(config: PoseDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initializes MediaPipe detector
   * - Loads ML model from CDN (~5-10 MB, takes few seconds)
   * - Uses dynamic import to prevent Next.js SSR errors
   * - Configures detector with settings from constructor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return; // Skip if already initialized
    }

    try {
      // Dynamic import (client-side only, prevents SSR errors)
      const { Pose } = await import('@mediapipe/pose');

      // Create MediaPipe instance (loads model files from CDN)
      this.pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        },
      });

      // Apply configuration
      this.pose.setOptions({
        modelComplexity: this.config.modelComplexity,
        smoothLandmarks: this.config.smoothLandmarks,
        minDetectionConfidence: this.config.minDetectionConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });

      // Set up results callback (receives detected landmarks)
      this.pose.onResults((results: any) => {
        this.lastResult = results;
      });

      this.isInitialized = true;
    } catch (error) {
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize MediaPipe Pose: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Processes single video frame for pose detection
   * - Called repeatedly to analyze video feed
   * - Skips if already processing (prevents WebAssembly memory errors)
   * - Validates video element before processing
   * @param videoElement - Video element to analyze
   * @returns Detection result with landmarks and posture analysis
   */
  async detectPose(videoElement: HTMLVideoElement): Promise<PoseDetectionResult> {
    if (!this.isInitialized || !this.pose) {
      throw new Error('Pose detector not initialized. Call initialize() first.');
    }

    // Skip if already processing a frame (prevents memory errors)
    if (this.isProcessing) {
      const landmarks = this.lastResult?.poseLandmarks || null;
      const posture = landmarks 
        ? this.analyzePosture(landmarks)
        : this.createNoPersonAnalysis();
      
      return {
        landmarks,
        posture,
        timestamp: performance.now(),
      };
    }

    // Validate video dimensions are available
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
      return {
        landmarks: null,
        posture: this.createNoPersonAnalysis(),
        timestamp: performance.now(),
      };
    }

    // Check if video is playing
    if (videoElement.paused || videoElement.ended) {
      return {
        landmarks: null,
        posture: this.createNoPersonAnalysis(),
        timestamp: performance.now(),
      };
    }

    try {
      this.isProcessing = true;

      // Send frame to MediaPipe for ML processing
      await this.pose.send({ image: videoElement });

      // Get landmarks from processed frame
      const landmarks = this.lastResult?.poseLandmarks || null;

      // Analyze posture from landmarks
      const posture = landmarks 
        ? this.analyzePosture(landmarks)
        : this.createNoPersonAnalysis();

      return {
        landmarks,
        posture,
        timestamp: performance.now(),
      };
    } catch (error) {
      console.error('Error during pose detection:', error);
      return {
        landmarks: null,
        posture: this.createNoPersonAnalysis(),
        timestamp: performance.now(),
      };
    } finally {
      // Always clear processing flag (critical for preventing stuck state)
      this.isProcessing = false;
    }
  }

  /**
   * Calibrates detector with user's good posture
   * - Captures current pose as baseline reference
   * - All future detection compares against this
   * - User should sit with good posture during calibration
   * @param landmarks - Landmarks from current good posture
   */
  calibrate(landmarks: PoseLandmarks): void {
    const nose = landmarks[LANDMARK_INDICES.NOSE];
    const leftShoulder = landmarks[LANDMARK_INDICES.LEFT_SHOULDER];
    const rightShoulder = landmarks[LANDMARK_INDICES.RIGHT_SHOULDER];
    const leftEar = landmarks[LANDMARK_INDICES.LEFT_EAR];
    const rightEar = landmarks[LANDMARK_INDICES.RIGHT_EAR];
    const leftEye = landmarks[LANDMARK_INDICES.LEFT_EYE];
    const rightEye = landmarks[LANDMARK_INDICES.RIGHT_EYE];

    // Check if landmarks are visible enough for calibration (chest-up frame)
    // - Only checks upper body landmarks (no hips needed)
    // - Perfect for desk setup where user is visible from chest-up
    const hasGoodVisibility = 
      (nose.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (leftShoulder.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (rightShoulder.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (leftEar.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (rightEar.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (leftEye.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (rightEye.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD;

    if (!hasGoodVisibility) {
      throw new Error('Cannot calibrate: Person not clearly visible in frame. Make sure your face and shoulders are fully visible.');
    }

    // Analyze eye visibility for logging
    const eyeData = this.analyzeEyeVisibility(landmarks);

    // Calculate baseline metrics using STANDARD methods
    const slouchAngle = this.calculateSlouchAngle(leftShoulder, rightShoulder, leftEar, rightEar);
    
    // Use improved sagittal head tilt with eyes (more accurate than nose)
    const headTiltAngle = this.calculateSagittalHeadTilt(leftEye, rightEye, leftEar, rightEar);
    
    const shoulderAlignment = this.calculateShoulderAlignment(leftShoulder, rightShoulder);
    const shoulderHeight = this.calculateShoulderHeight(leftShoulder, rightShoulder); // NEW: Capture shoulder height
    const headOrientation = this.calculateHeadOrientation(landmarks);

    // Store baseline - ACCEPTS ANY VALUES (no validation)
    // - Your specific camera setup, body proportions, and desk configuration determine these values
    // - Detection works by measuring DEVIATION from YOUR baseline, not absolute angles
    // - This makes the system work for everyone regardless of camera position
    this.calibrationBaseline = {
      slouchAngle,
      headTiltAngle,
      shoulderAlignment,
      shoulderHeight, // NEW: Track shoulder height baseline
      headYaw: headOrientation.yaw,
      headPitch: headOrientation.pitch,
      timestamp: Date.now(),
    };

    // Clear smoothing buffer on new calibration
    this.smoothingBuffer = {
      slouchAngles: [],
      headTiltAngles: [],
      shoulderAlignments: [],
      shoulderHeights: [], // NEW: clear shoulder height buffer
      headYaws: [],
      headPitches: [],
    };

    // Log calibration for debugging (informative, not blocking)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CALIBRATION COMPLETE - Your Baseline Captured');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Your Baseline Values (Standard Biomechanical Methods):');
    console.log(`   CVA (Slouch):        ${slouchAngle.toFixed(1)}° (normal: 48-54°, <40° = slouching)`);
    console.log(`   Sagittal Tilt:       ${headTiltAngle.toFixed(1)}° (positive = looking down)`);
    console.log(`   Shoulder Alignment:  ${shoulderAlignment.toFixed(1)}° (0° = level)`);
    console.log(`   Shoulder Height:      ${shoulderHeight.toFixed(3)} (detects slipping down)`);
    console.log(`   Head Yaw (L/R):      ${headOrientation.yaw.toFixed(1)}° (0° = facing forward)`);
    console.log(`   Head Pitch (U/D):    ${headOrientation.pitch.toFixed(1)}° (0° = level)`);
    console.log('');
    console.log('👁️  Eye Tracking Status:');
    console.log(`   Eyes Visible:        ${eyeData.eyesVisible ? '✅ Yes' : '❌ No'}`);
    console.log(`   Left Eye Confidence: ${(eyeData.leftEyeConfidence * 100).toFixed(0)}%`);
    console.log(`   Right Eye Confidence: ${(eyeData.rightEyeConfidence * 100).toFixed(0)}%`);
    console.log('');
    console.log('💡 These values are YOUR personal baseline for good posture.');
    console.log('   The system will alert you when you deviate significantly from these.');
    console.log('   Eye tracking provides robust detection of looking away/down.');
    console.log('   Shoulder height detects when you slip down in your chair.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * Gets current calibration baseline
   * @returns Calibration data or null if not calibrated
   */
  getCalibration(): CalibrationBaseline | null {
    return this.calibrationBaseline;
  }

  /**
   * Clears calibration (resets to uncalibrated state)
   */
  clearCalibration(): void {
    this.calibrationBaseline = null;
    this.smoothingBuffer = {
      slouchAngles: [],
      headTiltAngles: [],
      shoulderAlignments: [],
      shoulderHeights: [], // NEW: clear shoulder height buffer
      headYaws: [],
      headPitches: [],
    };
  }

  /**
   * Adds value to smoothing buffer and returns rolling average
   * - Maintains fixed-size buffer (FIFO)
   * - Returns average of recent values
   * @param buffer - Buffer to update
   * @param newValue - New value to add
   * @returns Smoothed average
   */
  private addToSmoothingBuffer(buffer: number[], newValue: number): number {
    buffer.push(newValue);
    
    // Keep only recent values (FIFO - first in, first out)
    if (buffer.length > SMOOTHING_WINDOW_SIZE) {
      buffer.shift(); // Remove oldest value
    }

    // Return average of buffer
    const sum = buffer.reduce((acc, val) => acc + val, 0);
    return sum / buffer.length;
  }

  /**
   * Analyzes landmarks to determine posture quality
   * - Calculates slouch angle, head tilt, shoulder alignment
   * - Applies temporal smoothing to reduce jitter
   * - Compares against calibration baseline (if available)
   * - Detects issues (slouching, looking-away, looking-down)
   * @param landmarks - 33 body points from MediaPipe
   * @returns Posture analysis with issue type and metrics
   */
  private analyzePosture(landmarks: PoseLandmarks): PostureAnalysis {
    // Extract key landmarks (chest-up frame - upper body only)
    const nose = landmarks[LANDMARK_INDICES.NOSE];
    const leftShoulder = landmarks[LANDMARK_INDICES.LEFT_SHOULDER];
    const rightShoulder = landmarks[LANDMARK_INDICES.RIGHT_SHOULDER];
    const leftEar = landmarks[LANDMARK_INDICES.LEFT_EAR];
    const rightEar = landmarks[LANDMARK_INDICES.RIGHT_EAR];
    const leftEye = landmarks[LANDMARK_INDICES.LEFT_EYE]; // NEW: for eye tracking
    const rightEye = landmarks[LANDMARK_INDICES.RIGHT_EYE]; // NEW: for eye tracking

    // Check landmark visibility (0-1 confidence score)
    const hasGoodVisibility = 
      (nose.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (leftShoulder.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (rightShoulder.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (leftEar.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      (rightEar.visibility || 0) > POSTURE_THRESHOLDS.CONFIDENCE_THRESHOLD;

    if (!hasGoodVisibility) {
      return this.createNoPersonAnalysis(); // Can't analyze with poor visibility
    }

    // NEW: Analyze eye visibility FIRST (strong distraction signal)
    // Eye tracking provides robust detection of looking away/down
    const eyeData = this.analyzeEyeVisibility(landmarks);

    // Calculate RAW posture metrics (before smoothing)
    // Uses STANDARD biomechanical methods with eye tracking
    const rawSlouchAngle = this.calculateSlouchAngle(
      leftShoulder,
      rightShoulder,
      leftEar,
      rightEar
    );
    
    // Use improved sagittal head tilt if eyes are visible, fallback to nose-based
    const rawHeadTiltAngle = eyeData.eyesVisible
      ? this.calculateSagittalHeadTilt(leftEye, rightEye, leftEar, rightEar)
      : this.calculateHeadTilt(nose, leftShoulder, rightShoulder);
    
    const rawShoulderAlignment = this.calculateShoulderAlignment(leftShoulder, rightShoulder);
    const rawShoulderHeight = this.calculateShoulderHeight(leftShoulder, rightShoulder); // NEW: Calculate shoulder height
    const rawHeadOrientation = this.calculateHeadOrientation(landmarks);

    // Apply temporal smoothing (averages last 5 frames to reduce jitter)
    const slouchAngle = this.addToSmoothingBuffer(this.smoothingBuffer.slouchAngles, rawSlouchAngle);
    const headTiltAngle = this.addToSmoothingBuffer(this.smoothingBuffer.headTiltAngles, rawHeadTiltAngle);
    const shoulderAlignment = this.addToSmoothingBuffer(this.smoothingBuffer.shoulderAlignments, rawShoulderAlignment);
    const shoulderHeight = this.addToSmoothingBuffer(this.smoothingBuffer.shoulderHeights, rawShoulderHeight); // NEW: smooth shoulder height
    const headYaw = this.addToSmoothingBuffer(this.smoothingBuffer.headYaws, rawHeadOrientation.yaw); // NEW: smooth yaw
    const headPitch = this.addToSmoothingBuffer(this.smoothingBuffer.headPitches, rawHeadOrientation.pitch); // NEW: smooth pitch

    // Determine posture issue
    let issueType: PostureIssueType = 'good-posture';
    let confidence = 0.9;

    // NEW: PRIORITY 1 - Eye visibility check (strongest signal)
    // If eyes disappear, user is definitely looking away or very far down
    // This overrides other measurements for more reliable detection
    if (!eyeData.eyesVisible) {
      // Eyes disappeared = high confidence distraction
      // Determine if looking away (low pitch) or down (high pitch)
      if (Math.abs(headPitch) > 15 || headTiltAngle > 15) {
        issueType = 'looking-down';
        confidence = 0.9;
      } else {
        issueType = 'looking-away';
        confidence = 0.9;
      }
    }
    // PRIORITY 2 - Use calibration-based detection if available
    else if (this.calibrationBaseline) {
      // Compare current values to calibrated baseline
      const slouchDeviation = Math.abs(slouchAngle - this.calibrationBaseline.slouchAngle);
      const headTiltDeviation = Math.abs(headTiltAngle - this.calibrationBaseline.headTiltAngle);
      const shoulderDeviation = Math.abs(shoulderAlignment - this.calibrationBaseline.shoulderAlignment);
      const shoulderHeightDeviation = Math.abs(shoulderHeight - this.calibrationBaseline.shoulderHeight); // NEW: shoulder height deviation
      const yawDeviation = Math.abs(headYaw - this.calibrationBaseline.headYaw);
      const pitchDeviation = Math.abs(headPitch - this.calibrationBaseline.headPitch);

      // Define dynamic thresholds based on baseline (allows for individual body differences)
      const slouchThreshold = POSTURE_THRESHOLDS.SLOUCH_ANGLE_THRESHOLD * DEVIATION_THRESHOLD_MULTIPLIER;
      const headTiltThreshold = POSTURE_THRESHOLDS.HEAD_TILT_THRESHOLD * DEVIATION_THRESHOLD_MULTIPLIER;
      const headYawThreshold = POSTURE_THRESHOLDS.HEAD_TURN_THRESHOLD * DEVIATION_THRESHOLD_MULTIPLIER;
      const headPitchThreshold = POSTURE_THRESHOLDS.HEAD_TILT_THRESHOLD * DEVIATION_THRESHOLD_MULTIPLIER;
      const shoulderHeightThreshold = 0.05; // NEW: 5% change in shoulder height = slipping down

      // IMPROVED: Detect different types of slouching with multiple methods
      // Priority order: slouching (CVA) > slouching (slipping down) > looking-away > looking-down
      if (slouchAngle < 40 || slouchDeviation > slouchThreshold) {
        // Forward head posture detected (CVA method)
        issueType = 'slouching';
        confidence = Math.min(0.95, 0.6 + Math.max(40 - slouchAngle, slouchDeviation) / 10);
      }
      else if (shoulderHeightDeviation > shoulderHeightThreshold) {
        // Slipping down in chair detected (shoulder height method)
        issueType = 'slouching';
        confidence = Math.min(0.95, 0.6 + shoulderHeightDeviation * 10);
      }
      else if (yawDeviation > headYawThreshold) {
        issueType = 'looking-away';
        confidence = Math.min(0.95, 0.6 + yawDeviation / 60);
      }
      else if (pitchDeviation > headPitchThreshold || headTiltDeviation > headTiltThreshold) {
        issueType = 'looking-down';
        confidence = Math.min(0.95, 0.6 + Math.max(pitchDeviation, headTiltDeviation) / 40);
      }
    } 
    // PRIORITY 3 - Fallback to fixed thresholds (no calibration)
    else {
      // IMPROVED: Multiple slouching detection methods even without calibration
      if (slouchAngle < POSTURE_THRESHOLDS.SLOUCH_ANGLE_THRESHOLD) {
        // Forward head posture detected (CVA method)
        issueType = 'slouching';
        confidence = Math.min(0.95, 0.6 + (POSTURE_THRESHOLDS.SLOUCH_ANGLE_THRESHOLD - slouchAngle) / 10);
      }
      else if (Math.abs(headYaw) > POSTURE_THRESHOLDS.HEAD_TURN_THRESHOLD) {
        issueType = 'looking-away';
        confidence = Math.min(0.95, 0.6 + Math.abs(headYaw) / 60);
      }
      else if (headTiltAngle > POSTURE_THRESHOLDS.HEAD_TILT_THRESHOLD) {
        issueType = 'looking-down';
        confidence = Math.min(0.95, 0.6 + headTiltAngle / 40);
      }
    }

    return {
      type: issueType,
      confidence,
      slouchAngle,
      headTiltAngle,
      shoulderAlignment,
      headYaw, // NEW: left/right rotation angle
      headPitch, // NEW: up/down tilt angle
    };
  }

  /**
   * CORRECTED: Craniovertebral Angle (CVA) calculation
   * - Gold standard for forward head posture in biomechanics research
   * - Measures angle between ear-shoulder line and horizontal
   * - Normal range: 48-54°, Below 40° = forward head posture/slouching
   * - Uses proper 2D coordinate system (X-Y plane)
   * 
   * Clinical Reference: Photogrammetric assessment of upper body posture
   * https://pmc.ncbi.nlm.nih.gov/articles/PMC5446097/
   * 
   * @returns CVA in degrees (48-54° normal, <40° slouching)
   */
  private calculateSlouchAngle(
    leftShoulder: { x: number; y: number; z: number },
    rightShoulder: { x: number; y: number; z: number },
    leftEar: { x: number; y: number; z: number },
    rightEar: { x: number; y: number; z: number }
  ): number {
    // Calculate midpoints in 2D plane (X-Y coordinates)
    // MediaPipe landmarks are normalized 0-1 coordinates
    const earMidpoint = {
      x: (leftEar.x + rightEar.x) / 2,
      y: (leftEar.y + rightEar.y) / 2,
    };
    const shoulderMidpoint = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    };

    // Calculate horizontal and vertical distances
    const horizontalDistance = Math.abs(earMidpoint.x - shoulderMidpoint.x);
    const verticalDistance = shoulderMidpoint.y - earMidpoint.y; // Positive = ear above shoulder

    // CVA is the angle from horizontal to the ear-shoulder line
    // - Good posture: steep angle (48-54°) - ear well above shoulder
    // - Slouching: shallow angle (<40°) - ear closer to shoulder level
    // - Forward head posture: ear moves forward relative to shoulder
    const angleRadians = Math.atan2(verticalDistance, horizontalDistance + 0.01);
    const angleDegrees = (angleRadians * 180) / Math.PI;

    return angleDegrees;
  }

  /**
   * STANDARD METHOD: Sagittal Head Tilt (basic version using nose)
   * - Clinical measure for detecting looking down (phone usage)
   * - Uses nose as head reference (fallback when eyes not visible)
   * - Positive = looking down, Negative = looking up, ~0-10° = normal screen viewing
   * 
   * Note: This is the FALLBACK method. Use calculateSagittalHeadTilt() with eyes for better accuracy.
   * 
   * Clinical Reference: Sagittal head posture assessment
   * https://pmc.ncbi.nlm.nih.gov/articles/PMC5446097/
   * 
   * @returns Head tilt in degrees (can be negative for looking up)
   */
  private calculateHeadTilt(
    nose: { x: number; y: number; z: number },
    leftShoulder: { x: number; y: number; z: number },
    rightShoulder: { x: number; y: number; z: number }
  ): number {
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const headDrop = nose.y - shoulderY;
    
    // Normalize to typical head-shoulder distance
    const normalizedDrop = headDrop / 0.15;
    
    // REMOVED Math.max(0, ...) to allow negative values for looking up!
    // This was the bug causing head tilt to always be stuck at 0°
    const angleDegrees = normalizedDrop * 20;
    
    return angleDegrees;
  }

  /**
   * STANDARD METHOD: Sagittal Head Tilt (IMPROVED with eye tracking)
   * - More accurate than nose-based method (eyes don't protrude like nose)
   * - Uses eye-to-ear line angle from horizontal
   * - Distinguishes screen viewing (slight downward tilt 5-10°) from phone (>20°)
   * 
   * Clinical Reference: Eye-to-ear sagittal assessment
   * https://pmc.ncbi.nlm.nih.gov/articles/PMC5446097/
   * 
   * @returns Head tilt in degrees (positive=down, negative=up)
   */
  private calculateSagittalHeadTilt(
    leftEye: { x: number; y: number; z: number },
    rightEye: { x: number; y: number; z: number },
    leftEar: { x: number; y: number; z: number },
    rightEar: { x: number; y: number; z: number }
  ): number {
    // Calculate midpoints (including Z for depth - CRITICAL for sagittal plane!)
    const eyeMidpoint = {
      y: (leftEye.y + rightEye.y) / 2,
      z: (leftEye.z + rightEye.z) / 2,
    };
    const earMidpoint = {
      y: (leftEar.y + rightEar.y) / 2,
      z: (leftEar.z + rightEar.z) / 2,
    };

    // Vector from ear to eye in SAGITTAL PLANE (side view: Z-Y axis)
    // Head tilt MUST be measured from side profile, not front view!
    // - Normal: eyes forward (smaller Z) and slightly below (larger Y) ears
    // - Looking down: eyes drop significantly lower (much larger Y) relative to ears
    const dz = Math.abs(eyeMidpoint.z - earMidpoint.z) + 0.01; // Depth distance (avoid zero)
    const dy = eyeMidpoint.y - earMidpoint.y; // Vertical: positive = eyes below ears (looking down)

    // Calculate angle from horizontal in sagittal plane
    // - atan2(vertical, depth) gives head tilt angle
    // - Positive = looking down, Negative = looking up
    // - Normal screen viewing: 5-10° (slight downward tilt)
    // - Phone usage: >20° (significant downward tilt)
    const angleRadians = Math.atan2(dy, dz);
    const angleDegrees = (angleRadians * 180) / Math.PI;

    return angleDegrees;
  }

  /**
   * Calculates shoulder alignment (head turn detection)
   * - Measures shoulder levelness
   * - 0° = level, +/- = tilted (indicates looking away)
   * @returns Alignment angle in degrees with sign
   */
  private calculateShoulderAlignment(
    leftShoulder: { x: number; y: number; z: number },
    rightShoulder: { x: number; y: number; z: number }
  ): number {
    const heightDifference = leftShoulder.y - rightShoulder.y;
    const horizontalDistance = Math.abs(leftShoulder.x - rightShoulder.x);

    const angleRadians = Math.atan2(Math.abs(heightDifference), horizontalDistance);
    const angleDegrees = (angleRadians * 180) / Math.PI;

    return heightDifference > 0 ? angleDegrees : -angleDegrees; // Sign indicates tilt direction
  }

  /**
   * Calculates shoulder height for detecting slipping down in chair
   * - Measures average shoulder height (Y coordinate)
   * - Lower Y values = higher on screen = shoulders dropped down
   * - Detects when user slides down in their chair
   * @returns Shoulder height (0-1 normalized coordinate)
   */
  private calculateShoulderHeight(
    leftShoulder: { x: number; y: number; z: number },
    rightShoulder: { x: number; y: number; z: number }
  ): number {
    // Average shoulder height (Y coordinate)
    // Lower Y values = higher on screen = shoulders dropped down
    return (leftShoulder.y + rightShoulder.y) / 2;
  }

  /**
   * Calculates head orientation (yaw and pitch angles)
   * - Uses proper 3D geometry with multiple landmarks
   * - Yaw: Left/right rotation (negative=left, positive=right)
   * - Pitch: Up/down tilt (negative=up, positive=down)
   * @returns Object with yaw and pitch in degrees
   */
  private calculateHeadOrientation(landmarks: PoseLandmarks): {
    yaw: number;
    pitch: number;
  } {
    const nose = landmarks[LANDMARK_INDICES.NOSE];
    const leftEye = landmarks[LANDMARK_INDICES.LEFT_EYE];
    const rightEye = landmarks[LANDMARK_INDICES.RIGHT_EYE];
    const leftEar = landmarks[LANDMARK_INDICES.LEFT_EAR];
    const rightEar = landmarks[LANDMARK_INDICES.RIGHT_EAR];

    // Calculate YAW (left/right rotation) using ear positions
    // - Uses X-coordinate difference between ears and face center
    // - More geometrically sound than distance ratios
    
    // Calculate face center (average of eyes and nose)
    const faceCenterX = (leftEye.x + rightEye.x + nose.x) / 3;
    const faceCenterZ = (leftEye.z + rightEye.z + nose.z) / 3;
    
    // Calculate ear center
    const earCenterX = (leftEar.x + rightEar.x) / 2;
    const earCenterZ = (leftEar.z + rightEar.z) / 2;
    
    // When facing forward: face center and ear center are aligned in X
    // When turned: face center shifts relative to ear center
    const horizontalOffset = faceCenterX - earCenterX;
    const depthDifference = Math.abs(faceCenterZ - earCenterZ);
    
    // Calculate yaw using arctangent (proper angle calculation)
    const yawRadians = Math.atan2(horizontalOffset, depthDifference + 0.01);
    const yaw = (yawRadians * 180) / Math.PI;
    
    // Calculate PITCH (up/down tilt) using ear-to-eye vertical relationship
    // - When looking down: ears are higher than eyes (relative to camera)
    // - When looking up: ears are lower than eyes
    // - This avoids nose protrusion issues
    
    const earCenterY = (leftEar.y + rightEar.y) / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const eyeCenterZ = (leftEye.z + rightEye.z) / 2;
    
    // Vertical relationship between ears and eyes
    const verticalDifference = eyeCenterY - earCenterY; // Positive = eyes lower than ears (looking down)
    const depthForPitch = Math.abs(earCenterZ - eyeCenterZ) + 0.01;
    
    // Calculate pitch using arctangent
    const pitchRadians = Math.atan2(verticalDifference, depthForPitch);
    const pitch = (pitchRadians * 180) / Math.PI;
    
    return { yaw, pitch };
  }

  /**
   * NEW: Eye Visibility Analysis (Eye Tracking)
   * - Detects when user's eyes are visible to camera
   * - Eyes disappear when looking far away or significantly down
   * - Used as strong signal for distraction detection
   * - More reliable than geometric angles alone for "looking away"
   * 
   * Key insight: When eyes aren't visible, user is definitely not looking at screen!
   * 
   * @returns Object with eye visibility status and confidence scores
   */
  private analyzeEyeVisibility(landmarks: PoseLandmarks): {
    eyesVisible: boolean;
    leftEyeConfidence: number;
    rightEyeConfidence: number;
    averageConfidence: number;
  } {
    const leftEye = landmarks[LANDMARK_INDICES.LEFT_EYE];
    const rightEye = landmarks[LANDMARK_INDICES.RIGHT_EYE];
    
    const leftEyeConfidence = leftEye.visibility || 0;
    const rightEyeConfidence = rightEye.visibility || 0;
    const averageConfidence = (leftEyeConfidence + rightEyeConfidence) / 2;
    
    // Eyes are "visible" if both have confidence above threshold
    // Below threshold means head is turned significantly or looking way down
    const eyesVisible = 
      leftEyeConfidence > POSTURE_THRESHOLDS.EYE_VISIBILITY_THRESHOLD && 
      rightEyeConfidence > POSTURE_THRESHOLDS.EYE_VISIBILITY_THRESHOLD;
    
    return {
      eyesVisible,
      leftEyeConfidence,
      rightEyeConfidence,
      averageConfidence,
    };
  }

  /**
   * Creates no-person analysis result
   * @returns Analysis with no-person type
   */
  private createNoPersonAnalysis(): PostureAnalysis {
    return {
      type: 'no-person',
      confidence: 0.95,
      slouchAngle: 0,
      headTiltAngle: 0,
      shoulderAlignment: 0,
      headYaw: 0, // No person = no head orientation
      headPitch: 0,
    };
  }

  /**
   * Cleans up detector resources
   * - Closes MediaPipe instance
   * - Resets all state
   */
  async dispose(): Promise<void> {
    if (this.pose) {
      this.pose.close();
      this.pose = null;
    }
    this.isInitialized = false;
    this.lastResult = null;
    this.isProcessing = false;
  }

  /**
   * Checks if detector is initialized and ready
   * @returns true if ready to detect poses
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

/**
 * Factory function to create and initialize detector
 * - Creates detector instance and waits for initialization
 * - Returns ready-to-use detector
 * @param config - Optional configuration
 * @returns Initialized detector instance
 */
export async function createPoseDetector(
  config?: PoseDetectorConfig
): Promise<MediaPipePoseDetector> {
  const detector = new MediaPipePoseDetector(config);
  await detector.initialize();
  return detector;
}

