import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CalendarIcon, Clock, Plus, Edit } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";

interface ScheduledPost {
  id: string;
  content: string;
  platform: string;
  scheduledFor: string;
  status: string;
  segmentTitle?: string;
}

interface SchedulingCalendarProps {
  uploadId?: string;
}

export default function SchedulingCalendar({ uploadId }: SchedulingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [postContent, setPostContent] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch scheduled posts
  const { data: scheduledPosts = [] } = useQuery({
    queryKey: ['/api/scheduled-posts'],
    queryFn: async () => {
      const response = await fetch('/api/scheduled-posts');
      if (!response.ok) throw new Error('Failed to fetch scheduled posts');
      return response.json();
    },
  });

  // Fetch available posts for scheduling
  const { data: availablePosts = [] } = useQuery({
    queryKey: ['/api/social-posts', 'unscheduled'],
    queryFn: async () => {
      const response = await fetch('/api/social-posts?status=draft');
      if (!response.ok) throw new Error('Failed to fetch available posts');
      return response.json();
    },
  });

  // Schedule post mutation
  const schedulePostMutation = useMutation({
    mutationFn: async (data: {
      postId?: string;
      content: string;
      platform: string;
      scheduledFor: string;
    }) => {
      if (data.postId) {
        return apiRequest(`/api/social-posts/${data.postId}/schedule`, 'PATCH', {
          scheduledFor: data.scheduledFor,
        });
      } else {
        return apiRequest('/api/social-posts', 'POST', data);
      }
    },
    onSuccess: () => {
      toast({ title: "Post scheduled successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social-posts'] });
      setIsScheduleDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to schedule post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedPost(null);
    setPostContent("");
    setSelectedPlatform("");
    setScheduledTime("09:00");
  };

  const handleSchedulePost = () => {
    const scheduledDateTime = new Date(selectedDate);
    const [hours, minutes] = scheduledTime.split(':');
    scheduledDateTime.setHours(parseInt(hours), parseInt(minutes));

    schedulePostMutation.mutate({
      postId: selectedPost?.id,
      content: postContent,
      platform: selectedPlatform,
      scheduledFor: scheduledDateTime.toISOString(),
    });
  };

  const openScheduleDialog = (post?: any) => {
    if (post) {
      setSelectedPost(post);
      setPostContent(post.content);
      setSelectedPlatform(post.platform);
    } else {
      resetForm();
    }
    setIsScheduleDialogOpen(true);
  };

  // Get posts for selected date
  const postsForDate = scheduledPosts.filter((post: ScheduledPost) => {
    const postDate = new Date(post.scheduledFor);
    return format(postDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  });

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

  const generateOptimalTimes = () => {
    const times = [
      { time: "09:00", label: "9:00 AM - Morning Engagement" },
      { time: "12:00", label: "12:00 PM - Lunch Break" },
      { time: "15:00", label: "3:00 PM - Afternoon Peak" },
      { time: "18:00", label: "6:00 PM - Evening Rush" },
      { time: "20:00", label: "8:00 PM - Prime Time" },
    ];
    return times;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Calendar Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Content Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="rounded-md border"
            modifiers={{
              hasContent: scheduledPosts.map((post: ScheduledPost) => new Date(post.scheduledFor))
            }}
            modifiersStyles={{
              hasContent: { backgroundColor: 'hsl(var(--primary))', color: 'white' }
            }}
          />
          
          <div className="mt-4">
            <Button 
              onClick={() => openScheduleDialog()} 
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Schedule New Post
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Schedule Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {postsForDate.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No posts scheduled for this date</p>
            </div>
          ) : (
            <div className="space-y-3">
              {postsForDate
                .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
                .map((post) => (
                  <div key={post.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getPlatformColor(post.platform)}>
                          {post.platform.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {format(new Date(post.scheduledFor), 'HH:mm')}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openScheduleDialog(post)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.content}
                    </p>
                    {post.segmentTitle && (
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {post.segmentTitle}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Quick Schedule Available Posts */}
          {availablePosts.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <h4 className="font-medium mb-3">Quick Schedule</h4>
              <div className="space-y-2">
                {availablePosts.slice(0, 3).map((post: any) => (
                  <div key={post.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{post.platform}</Badge>
                      <span className="truncate max-w-32">{post.content}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openScheduleDialog(post)}
                    >
                      Schedule
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedPost ? 'Reschedule Post' : 'Schedule New Post'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {!selectedPost && (
              <div>
                <Label htmlFor="platform">Platform</Label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twitter">Twitter</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
              />
            </div>

            <div>
              <Label htmlFor="time">Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>

            {!selectedPost && (
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Enter post content..."
                  rows={4}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSchedulePost}
                disabled={schedulePostMutation.isPending}
                className="flex-1"
              >
                {schedulePostMutation.isPending ? 'Scheduling...' : 'Schedule Post'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsScheduleDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}