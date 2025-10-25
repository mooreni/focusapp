/**
 * Posture Detector Component
 * - Combines camera feed with pose detection
 * - Real-time posture analysis and feedback
 * - Status display and optional debug info
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { CameraFeed as CameraFeedComponent } from './camera-feed';
import { usePosture } from '@/hooks/use-posture';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Loader2,
} from 'lucide-react';

/**
 * Memoized CameraFeed component
 * - Prevents re-rendering when parent state changes
 * - Eliminates camera "disco ball" flickering effect
 * - Only re-renders if width, height, or showControls change
 */
const CameraFeed = React.memo(CameraFeedComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these props change
  return (
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.showControls === nextProps.showControls
    // onStreamReady intentionally excluded - function reference, not its behavior
  );
});

/**
 * PostureDetector component props
 * - onPostureChange: Callback when posture changes
 * - showDebugInfo: Show technical debug information
 */
interface PostureDetectorProps {
  onPostureChange?: (postureType: string) => void;
  showDebugInfo?: boolean;
}

/**
 * Posture detector with camera feed integration
 */
export function PostureDetector({
  onPostureChange,
  showDebugInfo = false,
}: PostureDetectorProps) {
  const { 
    state, 
    error, 
    result, 
    startDetection, 
    stopDetection, 
    isReady,
    calibrate,
    clearCalibration,
    isCalibrated,
  } = usePosture();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  
  // Track if camera has been started (for enabling calibration button)
  const [isCameraActive, setIsCameraActive] = React.useState(false);

  // Debug logging removed - feature working as expected

  // Notify parent when posture changes
  useEffect(() => {
    if (result && onPostureChange) {
      onPostureChange(result.posture.type);
    }
  }, [result, onPostureChange]);

  /**
   * Handles calibration button click
   * - Starts detection if not already running
   * - Then performs calibration
   * - This enables the user flow: Start Camera → Calibrate → Detection begins
   */
  const handleCalibrate = () => {
    console.log('🎯 Calibrate button clicked');
    
    // First, ensure detection is running
    if (state !== 'detecting' && videoElementRef.current && isReady) {
      console.log('🚀 Starting detection before calibration...');
      startDetection(videoElementRef.current);
      
      // Give detection a moment to start, then calibrate
      setTimeout(() => {
        console.log('✨ Performing calibration...');
        calibrate();
      }, 500);
    } else if (state === 'detecting') {
      // Detection already running, calibrate immediately
      console.log('✨ Performing calibration (detection already running)...');
      calibrate();
    } else {
      console.error('❌ Cannot calibrate: camera not ready');
    }
  };

  /**
   * Handles camera stream ready event
   * - Waits for video element to be ready
   * - Stores reference for later use (when user clicks calibrate)
   * - Sets camera as active to enable calibration button
   * - Detection will start when user clicks "Calibrate"
   */
  const handleStreamReady = (stream: MediaStream) => {
    console.log('📷 Camera stream ready, waiting for video to initialize...');
    
    // Mark camera as active (enables calibration button)
    setIsCameraActive(true);

    // Store video element reference for calibration
    const waitForVideoReady = () => {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      
      if (!videoElement) {
        console.log('Video element not found, retrying...');
        setTimeout(waitForVideoReady, 100);
        return;
      }

      // Check if video dimensions are available
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.log('Video dimensions not ready, waiting...');
        // Wait for loadedmetadata event (fires when dimensions available)
        videoElement.addEventListener('loadedmetadata', () => {
          console.log(`✅ Video ready: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
          videoElementRef.current = videoElement;
          console.log('✅ Camera ready! User can now calibrate.');
        }, { once: true }); // Auto-remove listener after first call
        return;
      }

      // Video ready, store reference
      console.log(`✅ Video ready: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
      videoElementRef.current = videoElement;
      console.log('✅ Camera ready! User can now calibrate.');
    };

    // Delay first check to allow React to render video element
    setTimeout(waitForVideoReady, 200);
  };

  // Helper: Get status message from detector state
  const getStatusMessage = () => {
    switch (state) {
      case 'idle':
        return 'Pose detector not started';
      case 'loading':
        return 'Loading AI model...';
      case 'ready':
        // Show different message based on camera state
        if (isCameraActive) {
          return 'Camera ready - Click "Calibrate Now" to begin monitoring';
        }
        return 'Ready - Start the camera to begin';
      case 'detecting':
        // Different message based on calibration status
        if (!isCalibrated) {
          return 'Waiting for calibration - Click "Calibrate Now" below';
        }
        return 'Actively monitoring your posture';
      case 'error':
        return `Error: ${error}`;
      default:
        return 'Unknown state';
    }
  };

  // Helper: Get badge variant for posture type
  const getPostureBadgeVariant = (postureType: string) => {
    switch (postureType) {
      case 'good-posture':
        return 'default';
      case 'slouching':
      case 'looking-away':
      case 'looking-down':
        return 'destructive';
      case 'no-person':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Helper: Get user-friendly label for posture type
  const getPostureLabel = (postureType: string) => {
    switch (postureType) {
      case 'good-posture':
        return 'Good Posture';
      case 'slouching':
        return 'Slouching Detected';
      case 'looking-away':
        return 'Looking Away';
      case 'looking-down':
        return 'Looking Down';
      case 'no-person':
        return 'No Person Detected';
      default:
        return postureType;
    }
  };

  // Helper: Get icon for posture type
  const getPostureIcon = (postureType: string) => {
    switch (postureType) {
      case 'good-posture':
        return <CheckCircle className="h-4 w-4" />;
      case 'slouching':
      case 'looking-away':
      case 'looking-down':
        return <AlertCircle className="h-4 w-4" />;
      case 'no-person':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Camera Feed Section */}
      <CameraFeed
        width={640}
        height={480}
        onStreamReady={handleStreamReady}
        showControls={true}
      />

      {/* Pose Detection Status Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Posture Detection
          </CardTitle>
          <CardDescription>
            {getStatusMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Loading State - ALWAYS present, visibility controlled by CSS */}
          <div className={state === 'loading' ? 'flex items-center gap-2 text-muted-foreground' : 'hidden'}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading MediaPipe AI model...</span>
          </div>

          {/* Error State - ALWAYS present, visibility controlled by CSS */}
          <div className={state === 'error' && error ? 'block' : 'hidden'}>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || 'Unknown error'}</AlertDescription>
            </Alert>
          </div>

          {/* Calibration Reminder Alert - ALWAYS present, visibility controlled by CSS */}
          <div className={state === 'detecting' && !isCalibrated ? 'block' : 'hidden'}>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Complete Calibration</strong>
                <p className="mt-1">
                  Sit with your best posture and click "Calibrate Now" below to begin posture monitoring.
                </p>
              </AlertDescription>
            </Alert>
          </div>

          {/* Ready State Message - ALWAYS present, visibility controlled by CSS */}
          <div className={state === 'ready' && !result ? 'text-sm text-muted-foreground block' : 'hidden'}>
            {isCameraActive 
              ? 'Ready! Scroll down and click "Calibrate Now" to start monitoring.'
              : 'Start the camera, then calibrate to begin posture detection.'}
          </div>
          
          {/* Main Detection Display - ALWAYS present, visibility controlled by CSS */}
          {/* DOM structure NEVER changes, preventing screen shake */}
          <div className={state === 'detecting' && isCalibrated ? 'space-y-4 block' : 'hidden'}>
            {/* Posture Status Badge - ALWAYS rendered */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Current Status:</span>
              <Badge 
                variant={result ? getPostureBadgeVariant(result.posture.type) : 'outline'}
                className="flex items-center gap-1"
              >
                {result ? getPostureIcon(result.posture.type) : <Activity className="h-4 w-4" />}
                {result ? getPostureLabel(result.posture.type) : 'Waiting...'}
              </Badge>
            </div>

            {/* Separator - ALWAYS rendered */}
            <Separator />

            {/* Posture Metrics - ALWAYS rendered, show placeholders when no person */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Posture Metrics</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Slouch Angle:</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${result.posture.slouchAngle.toFixed(1)}°` 
                      : '---'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Head Tilt:</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${result.posture.headTiltAngle.toFixed(1)}°` 
                      : '---'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Shoulder Alignment:</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${result.posture.shoulderAlignment.toFixed(1)}°` 
                      : '---'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Head Yaw (L/R):</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${result.posture.headYaw.toFixed(1)}°` 
                      : '---'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Head Pitch (U/D):</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${result.posture.headPitch.toFixed(1)}°` 
                      : '---'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Confidence:</span>
                  <div className="font-medium">
                    {result && result.posture.type !== 'no-person' 
                      ? `${(result.posture.confidence * 100).toFixed(0)}%` 
                      : '---'}
                  </div>
                </div>
              </div>
            </div>

            {/* Debug Information - ALWAYS present, visibility controlled by CSS */}
            <div className={showDebugInfo && result?.landmarks ? 'block' : 'hidden'}>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Debug Info</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Landmarks detected: {result?.landmarks?.length || 0}</div>
                  <div>Timestamp: {result?.timestamp.toFixed(0) || 0}ms</div>
                  <div>Detector state: {state}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calibration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Posture Calibration
            </span>
            {/* Badge - ALWAYS present, just change variant based on calibration state */}
            <Badge 
              variant={isCalibrated ? 'default' : 'secondary'} 
              className="flex items-center gap-1"
            >
              {isCalibrated ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {isCalibrated ? 'Calibrated' : 'Not Calibrated'}
            </Badge>
          </CardTitle>
          <CardDescription>
            {isCalibrated 
              ? 'System is calibrated to your posture. Detection is personalized to your body.'
              : 'Calibrate the system with your good posture for accurate detection.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Calibration Instructions - ALWAYS present, visibility controlled by CSS */}
          <div className={!isCalibrated ? 'block' : 'hidden'}>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>📸 How to Calibrate Your Good Posture:</strong>
                <div className="mt-3 space-y-3">
                  <div>
                    <strong className="text-sm">1. Position Yourself:</strong>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5 text-sm">
                      <li>Sit in your normal working position (at your desk, facing your screen)</li>
                      <li>Your face and shoulders must be fully visible in the camera</li>
                      <li>Distance: About 2-3 feet (60-90cm) from camera</li>
                    </ul>
                  </div>
                  
                  <div>
                    <strong className="text-sm">2. Adopt Your Best Posture:</strong>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5 text-sm">
                      <li><strong>Back:</strong> Straight against chair back (not leaning forward)</li>
                      <li><strong>Shoulders:</strong> Relaxed and back (not hunched or rounded forward)</li>
                      <li><strong>Head:</strong> Level and looking straight at your screen (not tilted down)</li>
                      <li><strong>Neck:</strong> Aligned with spine (ears roughly over shoulders)</li>
                      <li><strong>Face:</strong> Looking directly at camera (not turned to the side)</li>
                    </ul>
                  </div>

                  <div>
                    <strong className="text-sm">3. Click "Calibrate Now"</strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The system will capture YOUR good posture as the baseline. Detection will alert you 
                      when you deviate significantly from this position (slouching, looking away, etc).
                    </p>
                  </div>

                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    💡 <strong>Tip:</strong> Calibrate while sitting how you SHOULD sit while working, 
                    not how you currently sit. The app works best when calibrated with proper ergonomic posture.
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          {/* Calibration Controls - ALWAYS present, visibility controlled by CSS */}
          <div className="flex gap-2">
            {/* Buttons when camera is active - ALWAYS present */}
            <div className={isCameraActive ? 'flex gap-2 flex-1' : 'hidden'}>
              <Button 
                onClick={handleCalibrate}
                className="flex-1"
                variant={!isCalibrated ? 'default' : 'outline'}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isCalibrated ? 'Recalibrate' : 'Calibrate Now'}
              </Button>
              {/* Clear button - ALWAYS present, visibility controlled by CSS */}
              <Button 
                onClick={clearCalibration}
                variant="outline"
                className={isCalibrated ? 'block' : 'hidden'}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
            {/* Message when camera not active - ALWAYS present */}
            <div className={!isCameraActive ? 'text-sm text-muted-foreground text-center w-full py-2' : 'hidden'}>
              Start the camera to enable calibration
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Helpful Tips - ALWAYS present, visibility controlled by CSS */}
      <div className={
        state === 'detecting' && 
        isCalibrated && 
        result && 
        result.posture.type !== 'good-posture' && 
        result.posture.type !== 'no-person' 
          ? 'block' 
          : 'hidden'
      }>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {result?.posture.type === 'slouching' && (
              'Try sitting up straight with your shoulders back and aligned over your hips.'
            )}
            {result?.posture.type === 'looking-down' && (
              'Raise your screen to eye level to avoid neck strain.'
            )}
            {result?.posture.type === 'looking-away' && (
              'Face your screen directly for better posture and focus.'
            )}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

