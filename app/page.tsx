/**
 * Main Dashboard Page - Flowly Focus Assistant
 * - Camera and posture monitoring
 * - Real-time feedback
 * - Work timer and statistics (coming in later phases)
 * - Client component for interactivity
 */

'use client';

import { PostureDetector } from '@/components/posture-detector';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

/**
 * Dashboard page component
 * - Header with branding and status
 * - Two-column layout (camera + sidebar)
 * - shadcn/ui dark mode theme
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* 
        Header Section
        - Sticky header with backdrop blur for modern feel
        - Shows app name, tagline, and connection status
      */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* App branding */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M12 2v20M2 12h20" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Flowly</h1>
                <p className="text-xs text-muted-foreground">
                  Focus & Posture Assistant
                </p>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                Ready
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* 
        Main Content Area
        - Grid layout: camera feed takes 2 columns, sidebar takes 1
        - Responsive: stacks vertically on smaller screens
      */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 
            Posture Detection Section
            - Primary feature, takes up more space
            - Combines camera feed with real-time posture detection
          */}
          <div className="lg:col-span-2">
            <PostureDetector
              onPostureChange={(postureType) => {
                // This callback fires whenever posture status changes
                // We can use this to trigger alerts, update stats, etc.
                console.log('Posture changed to:', postureType);
              }}
              showDebugInfo={false}
            />
          </div>

          {/* 
            Sidebar - Info Cards
            - Contains work timer, posture status, and daily stats
            - Currently shows placeholder content
          */}
          <div className="space-y-6">
            {/* Work Timer Card - Phase 3 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Work Timer</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Coming Soon
                  </Badge>
                </div>
                <CardDescription>
                  Pomodoro-style focus sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-10 w-10 text-muted-foreground"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Timer will be available in Phase 3
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Posture Status Card - NOW ACTIVE! */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Posture Status</CardTitle>
                  <Badge variant="default" className="text-xs">
                    Active
                  </Badge>
                </div>
                <CardDescription>
                  Real-time posture analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-10 w-10 text-primary"
                    >
                      <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" />
                      <path d="M2 22v-5l3-3 2 2 4-4 4 4 2-2 3 3v5" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      MediaPipe Pose Detection Active
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Start the camera to begin monitoring
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Focus Stats - Phase 6 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Today's Focus</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Coming Soon
                  </Badge>
                </div>
                <CardDescription>
                  Your productivity metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Placeholder stats */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sessions</span>
                    <span className="font-medium">--</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Focus Time</span>
                    <span className="font-medium">--</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Posture Score</span>
                    <span className="font-medium">--</span>
                  </div>
                </div>
                <p className="pt-2 text-xs text-muted-foreground text-center">
                  Statistics tracking in Phase 6
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
