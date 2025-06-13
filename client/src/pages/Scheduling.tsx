import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SchedulingCalendar from "@/components/SchedulingCalendar";
import SocialAccountsManager from "@/components/SocialAccountsManager";
import PostingStatus from "@/components/PostingStatus";
import EngagementDashboard from "@/components/EngagementDashboard";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, Settings, BarChart3, Clock, Users } from "lucide-react";
import { format, isToday, isTomorrow, addDays } from "date-fns";

interface ScheduledPost {
  id: string;
  content: string;
  platform: string;
  scheduledFor: string;
  status: string;
  segmentTitle?: string;
}

export default function Scheduling() {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState("calendar");

  // Fetch upcoming posts
  const { data: upcomingPosts = [] } = useQuery({
    queryKey: ['/api/scheduled-posts'],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await fetch('/api/scheduled-posts');
      if (!response.ok) throw new Error('Failed to fetch scheduled posts');
      return response.json();
    },
  });

  // Fetch connected accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['/api/social-accounts'],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await fetch('/api/social-accounts');
      if (!response.ok) throw new Error('Failed to fetch social accounts');
      return response.json();
    },
  });

  const getUpcomingPosts = () => {
    const now = new Date();
    const next7Days = addDays(now, 7);
    
    return (upcomingPosts as ScheduledPost[])
      .filter(post => {
        const postDate = new Date(post.scheduledFor);
        return postDate >= now && postDate <= next7Days;
      })
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  };

  const getPostLabel = (scheduledFor: string) => {
    const postDate = new Date(scheduledFor);
    if (isToday(postDate)) return "Today";
    if (isTomorrow(postDate)) return "Tomorrow";
    return format(postDate, "MMM dd");
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

  const connectedAccountsCount = accounts.filter((account: any) => account.isActive).length;
  const totalScheduledPosts = upcomingPosts.length;
  const postsToday = upcomingPosts.filter((post: ScheduledPost) => 
    isToday(new Date(post.scheduledFor))
  ).length;

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Sign In Required</h2>
            <p className="text-muted-foreground mb-6">
              Please sign in to access your scheduling dashboard.
            </p>
            <Button onClick={() => window.location.href = '/api/login'}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Navigation title="Content Scheduling" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground mt-1">
            Manage your social media calendar and connected accounts
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Welcome back</div>
            <div className="font-medium">{(user as any)?.firstName || (user as any)?.email}</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 text-white rounded-lg">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{connectedAccountsCount}</div>
                <div className="text-sm text-muted-foreground">Connected Accounts</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 text-white rounded-lg">
                <CalendarIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalScheduledPosts}</div>
                <div className="text-sm text-muted-foreground">Scheduled Posts</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{postsToday}</div>
                <div className="text-sm text-muted-foreground">Posts Today</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 text-white rounded-lg">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.round(totalScheduledPosts / 7)}</div>
                <div className="text-sm text-muted-foreground">Avg/Week</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Calendar and Settings */}
        <div className="xl:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="accounts" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Accounts
              </TabsTrigger>
              <TabsTrigger value="status" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Status
              </TabsTrigger>
              <TabsTrigger value="engagement" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Engagement
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-6">
              <SchedulingCalendar />
            </TabsContent>

            <TabsContent value="accounts" className="mt-6">
              <SocialAccountsManager />
            </TabsContent>

            <TabsContent value="status" className="mt-6">
              <PostingStatus />
            </TabsContent>

            <TabsContent value="engagement" className="mt-6">
              <EngagementDashboard />
            </TabsContent>
          </Tabs>
        </div>

        {/* Upcoming Posts Sidebar */}
        <div className="xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Upcoming Posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {getUpcomingPosts().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No upcoming posts</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => setActiveTab("calendar")}
                  >
                    Schedule Content
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {getUpcomingPosts().slice(0, 8).map((post) => (
                    <div key={post.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={getPlatformColor(post.platform)}>
                          {post.platform.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {getPostLabel(post.scheduledFor)}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2 mb-2">
                        {post.content}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{format(new Date(post.scheduledFor), 'HH:mm')}</span>
                        {post.segmentTitle && (
                          <span className="truncate max-w-24">
                            {post.segmentTitle}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {getUpcomingPosts().length > 8 && (
                    <div className="text-center pt-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setActiveTab("calendar")}
                      >
                        View All ({getUpcomingPosts().length - 8} more)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={() => setActiveTab("calendar")}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                Schedule New Post
              </Button>
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={() => setActiveTab("accounts")}
              >
                <Settings className="h-4 w-4 mr-2" />
                Connect Account
              </Button>
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                View Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}