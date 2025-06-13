import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Navigation } from '@/components/Navigation';
import { apiRequest } from '@/lib/queryClient';
import { Video, Download, Clock, FileVideo, Settings } from 'lucide-react';

interface ShortsResult {
  segmentId: string;
  outputPath: string;
  duration: number;
  size: number;
  format: string;
  resolution: string;
}

interface ShortsConfig {
  width: number;
  height: number;
  subtitleStyle: {
    fontsize: number;
    fontcolor: string;
    fontfamily: string;
  };
}

export default function ShortsGenerator() {
  const [selectedUpload, setSelectedUpload] = useState<string>('');
  const [shortsConfig, setShortsConfig] = useState<ShortsConfig>({
    width: 1080,
    height: 1920,
    subtitleStyle: {
      fontsize: 48,
      fontcolor: 'white',
      fontfamily: 'Arial'
    }
  });

  const { data: uploads } = useQuery({
    queryKey: ['/api/uploads'],
  });

  const { data: queueMetrics } = useQuery({
    queryKey: ['/api/queues/metrics'],
    refetchInterval: 5000,
  });

  const { data: verticals } = useQuery({
    queryKey: ['/api/scheduling/verticals'],
  });

  const generateShortsMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      return apiRequest(`/api/shorts/generate/${uploadId}`, {
        method: 'POST',
        body: JSON.stringify({ config: shortsConfig }),
      });
    },
    onSuccess: () => {
      console.log('Shorts generation started successfully');
    },
  });

  const schedulePostMutation = useMutation({
    mutationFn: async (data: { platform: string; postId: string; scheduledTime?: string }) => {
      return apiRequest('/api/queues/schedule', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      console.log('Post scheduled successfully');
    },
  });

  const getOptimalTimeMutation = useMutation({
    mutationFn: async (platform: string) => {
      const params = new URLSearchParams({ platform });
      return apiRequest(`/api/scheduling/optimal-time?${params}`);
    },
  });

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Navigation title="Vertical Shorts Generator" />
      <div className="flex items-center gap-2 mb-6">
        <Video className="h-6 w-6" />
      </div>

      {/* Upload Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Content</CardTitle>
          <CardDescription>Choose an upload to generate vertical shorts from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedUpload} onValueChange={setSelectedUpload}>
            <SelectTrigger>
              <SelectValue placeholder="Select an upload" />
            </SelectTrigger>
            <SelectContent>
              {uploads?.map((upload: any) => (
                <SelectItem key={upload.id} value={upload.id}>
                  {upload.filename} ({formatDuration(upload.duration || 0)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedUpload && (
            <div className="flex gap-2">
              <Button
                onClick={() => generateShortsMutation.mutate(selectedUpload)}
                disabled={generateShortsMutation.isPending}
                className="flex items-center gap-2"
              >
                <FileVideo className="h-4 w-4" />
                {generateShortsMutation.isPending ? 'Generating...' : 'Generate Shorts'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shorts Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Shorts Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Resolution</label>
              <p className="text-lg font-mono">{shortsConfig.width}x{shortsConfig.height}</p>
              <p className="text-xs text-muted-foreground">9:16 aspect ratio optimized</p>
            </div>
            <div>
              <label className="text-sm font-medium">Subtitle Font Size</label>
              <p className="text-lg">{shortsConfig.subtitleStyle.fontsize}px</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Management Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Queue Status</CardTitle>
          <CardDescription>Real-time publishing queue metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {queueMetrics && Object.entries(queueMetrics).map(([platform, metrics]: [string, any]) => (
              <div key={platform} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium capitalize">{platform}</h3>
                  <Badge variant={metrics.failed > 0 ? "destructive" : "default"}>
                    {metrics.active > 0 ? 'Active' : 'Idle'}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Waiting:</span>
                    <span className="font-mono">{metrics.waiting}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active:</span>
                    <span className="font-mono">{metrics.active}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed:</span>
                    <span className="font-mono text-green-600">{metrics.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed:</span>
                    <span className="font-mono text-red-600">{metrics.failed}</span>
                  </div>
                  {metrics.delayed > 0 && (
                    <div className="flex justify-between">
                      <span>Delayed:</span>
                      <span className="font-mono text-yellow-600">{metrics.delayed}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scheduling Intelligence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Optimal Posting Times
          </CardTitle>
          <CardDescription>AI-powered scheduling recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {['youtube', 'tiktok', 'twitter', 'instagram', 'linkedin'].map((platform) => (
              <Button
                key={platform}
                variant="outline"
                onClick={() => getOptimalTimeMutation.mutate(platform)}
                disabled={getOptimalTimeMutation.isPending}
                className="flex flex-col items-center gap-2 h-auto py-4"
              >
                <span className="capitalize font-medium">{platform}</span>
                <span className="text-xs text-muted-foreground">Get optimal time</span>
              </Button>
            ))}
          </div>

          {getOptimalTimeMutation.data && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Recommendation</h4>
              <p className="text-sm mb-1">
                <strong>Suggested Time:</strong> {new Date(getOptimalTimeMutation.data.suggestedTime).toLocaleString()}
              </p>
              <p className="text-sm mb-1">
                <strong>Confidence:</strong> {Math.round(getOptimalTimeMutation.data.confidence * 100)}%
              </p>
              <p className="text-sm text-muted-foreground">{getOptimalTimeMutation.data.reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content Verticals */}
      {verticals && (
        <Card>
          <CardHeader>
            <CardTitle>Available Content Verticals</CardTitle>
            <CardDescription>Scheduling optimized for different content types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {verticals.map((vertical: string) => (
                <Badge key={vertical} variant="secondary" className="capitalize">
                  {vertical}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demo Results */}
      {generateShortsMutation.isSuccess && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Generated Shorts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="default">Completed</Badge>
                <span className="text-sm text-muted-foreground">
                  {generateShortsMutation.data?.totalShorts || 0} shorts generated
                </span>
              </div>
              
              <div className="grid gap-3">
                {generateShortsMutation.data?.results?.map((result: ShortsResult, index: number) => (
                  <div key={result.segmentId} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">Short #{index + 1}</h4>
                      <Badge variant="outline">{result.resolution}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <p className="font-mono">{formatDuration(result.duration)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Size:</span>
                        <p className="font-mono">{formatFileSize(result.size)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Format:</span>
                        <p className="font-mono uppercase">{result.format}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => schedulePostMutation.mutate({
                          platform: 'youtube',
                          postId: result.segmentId
                        })}
                        disabled={schedulePostMutation.isPending}
                      >
                        Schedule to YouTube
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => schedulePostMutation.mutate({
                          platform: 'tiktok',
                          postId: result.segmentId
                        })}
                        disabled={schedulePostMutation.isPending}
                      >
                        Schedule to TikTok
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}