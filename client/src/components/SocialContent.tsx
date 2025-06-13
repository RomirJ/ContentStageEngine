import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Edit, Calendar, Share2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SocialPost {
  id: string;
  segmentId: string;
  platform: string;
  content: string;
  status: string;
  scheduledFor: string | null;
  postedAt: string | null;
  engagement: any;
  createdAt: string;
  updatedAt: string;
}

interface SocialContentProps {
  uploadId: string;
}

export default function SocialContent({ uploadId }: SocialContentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");

  const { data: socialPosts, isLoading } = useQuery({
    queryKey: ['/api/uploads', uploadId, 'social-posts'],
    queryFn: async () => {
      const response = await fetch(`/api/uploads/${uploadId}/social-posts`);
      if (!response.ok) throw new Error('Failed to fetch social posts');
      return response.json();
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ postId, status }: { postId: string; status: string }) => {
      return apiRequest(`/api/social-posts/${postId}`, 'PATCH', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploads', uploadId, 'social-posts'] });
      toast({ title: "Post updated successfully" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Social Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!socialPosts || !Array.isArray(socialPosts) || socialPosts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Social Content</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No social content generated yet. Content will appear here once processing is complete.</p>
        </CardContent>
      </Card>
    );
  }

  const platformPosts = (socialPosts as SocialPost[]).reduce((acc: Record<string, SocialPost[]>, post: SocialPost) => {
    const platform = post.platform.replace('_graphic', '');
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(post);
    return acc;
  }, {});

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const handleEdit = (post: SocialPost) => {
    setEditingPost(post.id);
    setEditedContent(post.content);
  };

  const handleSave = () => {
    // TODO: Implement content update
    setEditingPost(null);
    toast({ title: "Content updated" });
  };

  const handleSchedule = (postId: string) => {
    updatePostMutation.mutate({ postId, status: 'scheduled' });
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      tiktok: "🎵",
      instagram: "📷", 
      linkedin: "💼",
      twitter: "🐦",
    };
    return icons[platform] || "📱";
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      tiktok: "bg-black text-white",
      instagram: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
      linkedin: "bg-blue-600 text-white",
      twitter: "bg-blue-400 text-white",
    };
    return colors[platform] || "bg-gray-500 text-white";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Generated Social Content ({(socialPosts as SocialPost[]).length} posts)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={Object.keys(platformPosts)[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {Object.keys(platformPosts).map((platform) => (
              <TabsTrigger key={platform} value={platform} className="flex items-center gap-2">
                <span>{getPlatformIcon(platform)}</span>
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {Object.entries(platformPosts).map(([platform, posts]) => (
            <TabsContent key={platform} value={platform} className="space-y-4">
              {(posts as SocialPost[]).map((post) => (
                <Card key={post.id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Badge className={getPlatformColor(platform)}>
                        {getPlatformIcon(platform)} {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        {post.platform.includes('_graphic') && ' • Graphic'}
                      </Badge>
                      <Badge variant={post.status === 'draft' ? 'secondary' : 'default'}>
                        {post.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {editingPost === post.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="min-h-24"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSave}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingPost(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(post.content)}
                            className="flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(post)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          {post.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => handleSchedule(post.id)}
                              className="flex items-center gap-1"
                              disabled={updatePostMutation.isPending}
                            >
                              <Calendar className="h-3 w-3" />
                              Schedule
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}