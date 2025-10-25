/**
 * Camera Feed Component
 * - Displays live camera stream
 * - Start/stop/pause controls
 * - Error handling and privacy indicators
 */

'use client';

import { useEffect, useRef } from 'react';
import { useCamera } from '@/hooks/use-camera';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, CameraOff, Pause, Play, AlertCircle } from 'lucide-react';

/**
 * CameraFeed component props
 * - width, height: Video display dimensions (px)
 * - onStreamReady: Callback when stream starts (for MediaPipe)
 * - showControls: Show start/stop buttons
 */
interface CameraFeedProps {
  width?: number;
  height?: number;
  onStreamReady?: (stream: MediaStream) => void;
  showControls?: boolean;
}

/**
 * Camera feed with controls
 */
export function CameraFeed({
  width = 640,
  height = 480,
  onStreamReady,
  showControls = true,
}: CameraFeedProps) {
  const {
    state,
    error,
    stream,
    startCamera,
    stopCamera,
    pauseCamera,
    resumeCamera,
    isSupported,
  } = useCamera({ width, height });

  const videoRef = useRef<HTMLVideoElement>(null); // Video element ref for stream connection

  // Connect stream to video element when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream; // Connect MediaStream to video
      
      // Notify parent (for MediaPipe integration)
      if (onStreamReady) {
        onStreamReady(stream);
      }
    }
  }, [stream, onStreamReady]);

  // Error state (user-friendly message with retry)
  if (state === 'error' && error) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Camera Error
          </CardTitle>
          <CardDescription>Unable to access camera</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          
          {/* Instructions for fixing permission issues */}
          {error.type === 'permission-denied' && (
            <Alert>
              <AlertDescription>
                <strong>How to fix camera permissions:</strong>
                <ol className="mt-2 ml-4 list-decimal space-y-1 text-sm">
                  <li>Click the camera icon in your browser's address bar</li>
                  <li>Change camera permission to "Allow"</li>
                  <li>Refresh the page or click "Try Again" below</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
          
          <Button onClick={startCamera} variant="outline">
            <Camera className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Unsupported browser
  if (!isSupported) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Camera Not Supported</CardTitle>
          <CardDescription>
            Your browser does not support camera access. Please use a modern browser like Chrome, Firefox, or Edge.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Main UI: Camera feed with controls
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera Feed
          </span>
          {/* Privacy indicator - shows red dot when camera is active */}
          {state === 'active' && (
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              Recording
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {state === 'idle' && 'Click "Start Camera" to begin monitoring'}
          {state === 'requesting' && 'Requesting camera permission...'}
          {state === 'active' && 'Camera is active and monitoring your posture'}
          {state === 'paused' && 'Camera is paused'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Video display area */}
        <div className="relative bg-muted rounded-lg overflow-hidden" style={{ width, height }}>
          {state === 'idle' && (
            // Placeholder when camera is off
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <CameraOff className="h-16 w-16 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Camera is off</p>
              </div>
            </div>
          )}
          {state === 'requesting' && (
            // Loading state while requesting permission
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Camera className="h-16 w-16 mx-auto text-muted-foreground animate-pulse" />
                <p className="text-sm text-muted-foreground">Requesting permission...</p>
              </div>
            </div>
          )}
          {/* The actual video element - hidden until stream is active */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={state === 'active' || state === 'paused' ? 'block w-full h-full' : 'hidden'}
            style={{ objectFit: 'cover' }}
          />
          {state === 'paused' && (
            // Overlay when paused
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Pause className="h-16 w-16 mx-auto text-white" />
                <p className="text-sm text-white">Paused</p>
              </div>
            </div>
          )}
        </div>

        {/* Control buttons */}
        {showControls && (
          <div className="flex gap-2 flex-wrap">
            {state === 'idle' && (
              <Button onClick={startCamera}>
                <Camera className="h-4 w-4 mr-2" />
                Start Camera
              </Button>
            )}
            {state === 'active' && (
              <>
                <Button onClick={pauseCamera} variant="outline">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
                <Button onClick={stopCamera} variant="destructive">
                  <CameraOff className="h-4 w-4 mr-2" />
                  Stop Camera
                </Button>
              </>
            )}
            {state === 'paused' && (
              <>
                <Button onClick={resumeCamera}>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
                <Button onClick={stopCamera} variant="destructive">
                  <CameraOff className="h-4 w-4 mr-2" />
                  Stop Camera
                </Button>
              </>
            )}
          </div>
        )}

        {/* Privacy notice */}
        <div className="text-xs text-muted-foreground border-t pt-4">
          <p>
            🔒 <strong>Privacy First:</strong> All video processing happens locally on your device.
            No video data is ever sent to any server or stored anywhere.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

