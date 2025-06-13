import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  MessageCircle, 
  Heart, 
  Share, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit,
  Send,
  Clock,
  Users,
  Zap
} from "lucide-react";
import { format } from "date-fns";

interface ReplyDraft {
  id: string;
  originalCommentId: string;
  content: string;
  tone: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  confidence: number;
  createdAt: string;
}

interface EngagementDigest {
  summary: string;
  pendingReplies: number;
  topEngagements: Array<{
    id: string;
    platform: string;
    content: string;
    postedAt: string;
    engagement?: any;
  }>;
  breakoutPosts: Array<{
    id: string;
    platform: string;
    content: string;
    engagement?: any;
  }>;
  notifications: any[];
}

export default function EngagementDashboard() {
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch engagement digest
  const { data: digest, isLoading: digestLoading } = useQuery({
    queryKey: ['/api/engagement/digest'],
    queryFn: async () => {
      const response = await fetch('/api/engagement/digest?hours=24');
      if (!response.ok) throw new Error('Failed to fetch engagement digest');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch reply drafts
  const { data: replyDrafts = [], isLoading: repliesLoading } = useQuery({
    queryKey: ['/api/engagement/replies'],
    queryFn: async () => {
      const response = await fetch('/api/engagement/replies');
      if (!response.ok) throw new Error('Failed to fetch reply drafts');
      return response.json();
    },
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Approve reply mutation
  const approveReplyMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return apiRequest(`/api/engagement/replies/${replyId}/approve`, 'POST');
    },
    onSuccess: () => {
      toast({ title: "Reply approved and posted" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/replies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/digest'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to approve reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reject reply mutation
  const rejectReplyMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return apiRequest(`/api/engagement/replies/${replyId}/reject`, 'POST');
    },
    onSuccess: () => {
      toast({ title: "Reply rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/replies'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reject reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit reply mutation
  const editReplyMutation = useMutation({
    mutationFn: async ({ replyId, content }: { replyId: string; content: string }) => {
      return apiRequest(`/api/engagement/replies/${replyId}`, 'PATCH', { content });
    },
    onSuccess: () => {
      toast({ title: "Reply updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/replies'] });
      setEditingReply(null);
      setEditedContent("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditReply = (reply: ReplyDraft) => {
    setEditingReply(reply.id);
    setEditedContent(reply.content);
  };

  const handleSaveEdit = (replyId: string) => {
    editReplyMutation.mutate({ replyId, content: editedContent });
  };

  const formatEngagementCount = (engagement: any) => {
    if (!engagement || !engagement.metrics) return 0;
    const metrics = engagement.metrics;
    return (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
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

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  if (digestLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const engagementDigest = digest as EngagementDigest;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Engagement Dashboard</h2>
        <p className="text-muted-foreground">
          Monitor and respond to audience interactions across all platforms
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 text-white rounded-lg">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{engagementDigest?.pendingReplies || 0}</div>
                <div className="text-sm text-muted-foreground">Pending Replies</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 text-white rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{engagementDigest?.topEngagements?.length || 0}</div>
                <div className="text-sm text-muted-foreground">Top Performing</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white rounded-lg">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{engagementDigest?.breakoutPosts?.length || 0}</div>
                <div className="text-sm text-muted-foreground">Breakout Posts</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Summary */}
      {engagementDigest?.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              24-Hour Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{engagementDigest.summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pending Replies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Pending Replies
              {replyDrafts.length > 0 && (
                <Badge variant="destructive">{replyDrafts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repliesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-3 border rounded-lg p-4">
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : replyDrafts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No pending replies</p>
                <p className="text-xs">AI-generated replies will appear here when comments are received</p>
              </div>
            ) : (
              <div className="space-y-4">
                {replyDrafts.map((reply: ReplyDraft) => (
                  <div key={reply.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">AI Generated</Badge>
                        <span className={`text-xs ${getConfidenceColor(reply.confidence)}`}>
                          {Math.round(reply.confidence * 100)}% confidence
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(reply.createdAt), 'MMM dd, HH:mm')}
                      </span>
                    </div>

                    {editingReply === reply.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          rows={3}
                          placeholder="Edit reply content..."
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleSaveEdit(reply.id)}
                            disabled={editReplyMutation.isPending}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setEditingReply(null);
                              setEditedContent("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-gray-50 p-3 rounded border-l-4 border-blue-500">
                          <p className="text-sm">{reply.content}</p>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditReply(reply)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectReplyMutation.mutate(reply.id)}
                              disabled={rejectReplyMutation.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => approveReplyMutation.mutate(reply.id)}
                              disabled={approveReplyMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve & Post
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performing Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Performing Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            {engagementDigest?.topEngagements?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No performance data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {engagementDigest?.topEngagements?.slice(0, 5).map((post) => (
                  <div key={post.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={getPlatformColor(post.platform)}>
                        {post.platform.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(post.postedAt), 'MMM dd')}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 mb-2">{post.content}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        <span>{formatEngagementCount(post.engagement)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        <span>{post.engagement?.metrics?.comments || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Share className="h-3 w-3" />
                        <span>{post.engagement?.metrics?.shares || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakout Posts Alert */}
      {engagementDigest?.breakoutPosts?.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              Breakout Performance Detected!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-600 mb-4">
              {engagementDigest.breakoutPosts.length} of your posts are performing exceptionally well. 
              Consider boosting these posts with paid promotion.
            </p>
            <div className="space-y-3">
              {engagementDigest.breakoutPosts.map((post) => (
                <div key={post.id} className="bg-white border border-orange-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={getPlatformColor(post.platform)}>
                      {post.platform.toUpperCase()}
                    </Badge>
                    <Button size="sm" variant="outline" className="border-orange-300">
                      <Zap className="h-3 w-3 mr-1" />
                      Boost Post
                    </Button>
                  </div>
                  <p className="text-sm">{post.content}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                    <span>🔥 {formatEngagementCount(post.engagement)} engagements</span>
                    <span>📈 Top 10% performance</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}