import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Navigation } from '@/components/Navigation';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  MessageCircle, 
  Heart, 
  Share2, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Edit3,
  Zap,
  Bell,
  Target,
  DollarSign
} from 'lucide-react';

interface ReplyDraft {
  id: string;
  originalCommentId: string;
  content: string;
  tone: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  confidence: number;
  createdAt: string;
  platform: string;
  authorUsername: string;
  originalComment: string;
}

interface BreakoutPost {
  id: string;
  platform: string;
  content: string;
  engagementScore: number;
  totalEngagement: number;
  isBreakout: boolean;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
}

interface EngagementDigest {
  pendingReplies: number;
  newComments: number;
  newLikes: number;
  newShares: number;
  breakoutPosts: number;
  highPriorityEvents: Array<{
    type: string;
    platform: string;
    message: string;
    timestamp: string;
  }>;
}

export default function Engagement() {
  const [selectedReply, setSelectedReply] = useState<ReplyDraft | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [boostBudget, setBoostBudget] = useState(50);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram']);

  const { data: pendingReplies, refetch: refetchReplies } = useQuery({
    queryKey: ['/api/engagement/replies/pending'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: breakoutData } = useQuery({
    queryKey: ['/api/engagement/breakouts'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: engagementDigest } = useQuery({
    queryKey: ['/api/engagement/digest'],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const approveReplyMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return apiRequest(`/api/engagement/replies/${replyId}/approve`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      refetchReplies();
      setSelectedReply(null);
    },
  });

  const rejectReplyMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return apiRequest(`/api/engagement/replies/${replyId}/reject`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      refetchReplies();
      setSelectedReply(null);
    },
  });

  const editReplyMutation = useMutation({
    mutationFn: async ({ replyId, content }: { replyId: string; content: string }) => {
      return apiRequest(`/api/engagement/replies/${replyId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      refetchReplies();
      setSelectedReply(null);
      setEditedContent('');
    },
  });

  const boostPostMutation = useMutation({
    mutationFn: async ({ postId, budget, platforms }: { postId: string; budget: number; platforms: string[] }) => {
      return apiRequest(`/api/engagement/boost/${postId}`, {
        method: 'POST',
        body: JSON.stringify({ budget, platforms }),
      });
    },
  });

  useEffect(() => {
    if (selectedReply) {
      setEditedContent(selectedReply.content);
    }
  }, [selectedReply]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Navigation title="Engagement Dashboard" />
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="h-6 w-6" />
      </div>

      {/* Real-time Digest */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Live Activity Feed
          </CardTitle>
          <CardDescription>Real-time engagement monitoring across all platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {engagementDigest?.pendingReplies || 0}
              </div>
              <div className="text-sm text-blue-600">Pending Replies</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {engagementDigest?.newComments || 0}
              </div>
              <div className="text-sm text-green-600">New Comments</div>
            </div>
            <div className="text-center p-3 bg-pink-50 rounded-lg">
              <div className="text-2xl font-bold text-pink-600">
                {engagementDigest?.newLikes || 0}
              </div>
              <div className="text-sm text-pink-600">New Likes</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {engagementDigest?.breakoutPosts || 0}
              </div>
              <div className="text-sm text-purple-600">Breakout Posts</div>
            </div>
          </div>

          {engagementDigest?.highPriorityEvents && engagementDigest.highPriorityEvents.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">High Priority Events</h4>
              {engagementDigest.highPriorityEvents.map((event, index) => (
                <Alert key={index}>
                  <Zap className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">{event.platform}:</span> {event.message}
                    <span className="text-muted-foreground ml-2">
                      {formatTimeAgo(event.timestamp)}
                    </span>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Reply Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            AI Reply Drafts
            {pendingReplies && pendingReplies.length > 0 && (
              <Badge variant="secondary">{pendingReplies.length} pending</Badge>
            )}
          </CardTitle>
          <CardDescription>Review and approve GPT-4o generated responses</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingReplies && pendingReplies.length > 0 ? (
            <div className="space-y-4">
              {pendingReplies.map((reply: ReplyDraft) => (
                <div key={reply.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {reply.platform}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {reply.tone}
                      </Badge>
                      <div 
                        className={`w-2 h-2 rounded-full ${getConfidenceColor(reply.confidence)}`}
                        title={`${Math.round(reply.confidence * 100)}% confidence`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(reply.createdAt)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Original Comment by @{reply.authorUsername}</h4>
                      <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                        {reply.originalComment}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-1">Suggested Reply</h4>
                      {selectedReply?.id === reply.id ? (
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="min-h-[80px]"
                        />
                      ) : (
                        <p className="text-sm p-2 bg-blue-50 rounded">
                          {reply.content}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {selectedReply?.id === reply.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => editReplyMutation.mutate({ 
                              replyId: reply.id, 
                              content: editedContent 
                            })}
                            disabled={editReplyMutation.isPending}
                          >
                            Save Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedReply(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveReplyMutation.mutate(reply.id)}
                            disabled={approveReplyMutation.isPending}
                            className="flex items-center gap-1"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Approve & Post
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedReply(reply)}
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectReplyMutation.mutate(reply.id)}
                            disabled={rejectReplyMutation.isPending}
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No pending replies. AI will generate drafts for new comments automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakout Content Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Breakout Content Detection
            {breakoutData?.breakoutCount > 0 && (
              <Badge variant="default">{breakoutData.breakoutCount} detected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Top 10% performing content with ad boost recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakoutData?.breakoutPosts && breakoutData.breakoutPosts.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-green-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {breakoutData.breakoutCount}
                  </div>
                  <div className="text-sm text-green-600">Breakout Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {breakoutData.totalPosts}
                  </div>
                  <div className="text-sm text-green-600">Total Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(breakoutData.averageEngagement * 10) / 10}%
                  </div>
                  <div className="text-sm text-green-600">Avg Engagement</div>
                </div>
              </div>

              {breakoutData.breakoutPosts.map((post: BreakoutPost) => (
                <div key={post.id} className="border border-green-200 rounded-lg p-4 bg-green-25">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-500">
                        <Target className="h-3 w-3 mr-1" />
                        Breakout Content
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {post.platform}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        {Math.round(post.engagementScore * 10) / 10}%
                      </div>
                      <div className="text-xs text-muted-foreground">Engagement Rate</div>
                    </div>
                  </div>

                  <p className="text-sm mb-3 line-clamp-2">{post.content}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {post.metrics.likes}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {post.metrics.comments}
                      </div>
                      <div className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" />
                        {post.metrics.shares}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={boostBudget.toString()} onValueChange={(value) => setBoostBudget(parseInt(value))}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">$25</SelectItem>
                          <SelectItem value="50">$50</SelectItem>
                          <SelectItem value="100">$100</SelectItem>
                          <SelectItem value="250">$250</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        onClick={() => boostPostMutation.mutate({
                          postId: post.id,
                          budget: boostBudget,
                          platforms: selectedPlatforms
                        })}
                        disabled={boostPostMutation.isPending}
                        className="flex items-center gap-1"
                      >
                        <DollarSign className="h-3 w-3" />
                        Boost Ad
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No breakout content detected yet. Keep posting to identify viral opportunities!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}