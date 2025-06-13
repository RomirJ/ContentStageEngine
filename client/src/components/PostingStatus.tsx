import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Play, 
  Pause, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  Send
} from "lucide-react";
import { format, isToday } from "date-fns";

interface PostingStats {
  totalScheduled: number;
  postsToday: number;
  activeAccounts: number;
  recentlyPosted: any[];
}

interface PostingStatusProps {
  className?: string;
}

export default function PostingStatus({ className }: PostingStatusProps) {
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch posting status
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/posting/status'],
    queryFn: async () => {
      const response = await fetch('/api/posting/status');
      if (!response.ok) throw new Error('Failed to fetch posting status');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent posts with posting status
  const { data: recentPosts = [] } = useQuery({
    queryKey: ['/api/social-posts', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/social-posts?limit=10');
      if (!response.ok) throw new Error('Failed to fetch recent posts');
      return response.json();
    },
  });

  // Manual publish mutation
  const publishPostMutation = useMutation({
    mutationFn: async (postId: string) => {
      setIsPublishing(postId);
      return apiRequest(`/api/social-posts/${postId}/publish`, 'POST');
    },
    onSuccess: (_, postId) => {
      toast({ title: "Post published successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/posting/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social-posts'] });
      setIsPublishing(null);
    },
    onError: (error: Error, postId) => {
      toast({
        title: "Failed to publish post",
        description: error.message,
        variant: "destructive",
      });
      setIsPublishing(null);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'posted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'posting':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'scheduled':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'posted':
        return 'bg-green-500';
      case 'posting':
        return 'bg-blue-500';
      case 'scheduled':
        return 'bg-orange-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      twitter: "bg-blue-500",
      linkedin: "bg-blue-700",
      instagram: "bg-pink-500",
      tiktok: "bg-black",
      youtube: "bg-red-500",
    };
    return colors[platform] || "bg-gray-500";
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const postingStats = stats as PostingStats;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{postingStats?.totalScheduled || 0}</div>
                <div className="text-sm text-muted-foreground">Scheduled Posts</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 text-white rounded-lg">
                <Send className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{postingStats?.postsToday || 0}</div>
                <div className="text-sm text-muted-foreground">Posts Today</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 text-white rounded-lg">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{postingStats?.activeAccounts || 0}</div>
                <div className="text-sm text-muted-foreground">Active Accounts</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Posts Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recent Posting Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent posting activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPosts.slice(0, 5).map((post: any) => (
                <div key={post.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(post.status)}
                        <Badge className={getPlatformColor(post.platform)}>
                          {post.platform.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm line-clamp-1 font-medium">
                          {post.content}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="capitalize">{post.status}</span>
                          {post.scheduledFor && (
                            <>
                              <span>•</span>
                              <span>
                                {isToday(new Date(post.scheduledFor)) 
                                  ? format(new Date(post.scheduledFor), 'HH:mm')
                                  : format(new Date(post.scheduledFor), 'MMM dd, HH:mm')
                                }
                              </span>
                            </>
                          )}
                          {post.postedAt && (
                            <>
                              <span>•</span>
                              <span>Posted {format(new Date(post.postedAt), 'HH:mm')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {post.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => publishPostMutation.mutate(post.id)}
                          disabled={isPublishing === post.id}
                        >
                          {isPublishing === post.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      {post.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => publishPostMutation.mutate(post.id)}
                          disabled={isPublishing === post.id}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automation Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Automation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 text-white rounded-lg">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Automated Posting Active</div>
                <div className="text-sm text-muted-foreground">
                  Checking for scheduled posts every 5 minutes
                </div>
              </div>
            </div>
            <Badge variant="default" className="bg-green-500">
              Running
            </Badge>
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">How it works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Posts are automatically published at their scheduled time</li>
              <li>• Failed posts are marked and can be retried manually</li>
              <li>• Account tokens are refreshed automatically when needed</li>
              <li>• Real-time status updates show posting progress</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}