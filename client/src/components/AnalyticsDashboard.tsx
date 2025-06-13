import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  Heart, 
  Share, 
  MessageCircle,
  Users,
  DollarSign,
  RefreshCw,
  Download,
  Calendar,
  Target
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from "recharts";
import { format, subDays } from "date-fns";

interface AnalyticsReport {
  dateRange: {
    start: string;
    end: string;
  };
  overview: {
    totalPosts: number;
    totalViews: number;
    totalEngagement: number;
    avgEngagementRate: number;
    topPerformingPlatform: string;
    totalRevenue: number;
  };
  platformBreakdown: Array<{
    platform: string;
    views: number;
    likes: number;
    shares: number;
    comments: number;
    engagementRate: number;
  }>;
  contentPerformance: Array<{
    postId: string;
    platform: string;
    content: string;
    publishedAt: string;
    metrics: {
      views: number;
      likes: number;
      shares: number;
      comments: number;
    };
  }>;
  trends: {
    viewsGrowth: number;
    engagementGrowth: number;
    followerGrowth: number;
    revenueGrowth: number;
  };
  insights: string[];
}

interface HeatmapData {
  hour: number;
  day: string;
  engagement: number;
}

interface FunnelData {
  stages: Array<{
    stage: string;
    count: number;
    conversionRate: number;
  }>;
  platforms: Record<string, {
    views: number;
    clicks: number;
    conversions: number;
  }>;
}

export default function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState("30");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch analytics report
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['/api/analytics/report', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/report?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch analytics report');
      return response.json();
    },
  });

  // Fetch engagement heatmap
  const { data: heatmap = [] } = useQuery({
    queryKey: ['/api/analytics/heatmap', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/heatmap?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch heatmap');
      return response.json();
    },
  });

  // Fetch funnel metrics
  const { data: funnel } = useQuery({
    queryKey: ['/api/analytics/funnel', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/funnel?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch funnel');
      return response.json();
    },
  });

  // Sync analytics mutation
  const syncAnalyticsMutation = useMutation({
    mutationFn: async () => {
      setIsRefreshing(true);
      return apiRequest('/api/analytics/sync', 'POST', {});
    },
    onSuccess: () => {
      toast({ title: "Analytics data synced successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
      setIsRefreshing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sync analytics",
        description: error.message,
        variant: "destructive",
      });
      setIsRefreshing(false);
    },
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTrendIcon = (growth: number) => {
    return growth >= 0 ? 
      <TrendingUp className="h-4 w-4 text-green-500" /> : 
      <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getTrendColor = (growth: number) => {
    return growth >= 0 ? "text-green-500" : "text-red-500";
  };

  const platformColors: Record<string, string> = {
    twitter: "#1DA1F2",
    linkedin: "#0077B5", 
    instagram: "#E4405F",
    tiktok: "#000000",
    youtube: "#FF0000",
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (reportLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <div className="animate-pulse h-10 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  const analyticsReport = report as AnalyticsReport;
  const heatmapData = heatmap as HeatmapData[];
  const funnelData = funnel as FunnelData;

  // Prepare chart data
  const platformData = analyticsReport?.platformBreakdown?.map(platform => ({
    name: platform.platform,
    views: platform.views,
    engagement: platform.likes + platform.shares + platform.comments,
    engagementRate: platform.engagementRate,
  })) || [];

  const contentTrendData = analyticsReport?.contentPerformance
    ?.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
    ?.map(content => ({
      date: format(new Date(content.publishedAt), 'MM/dd'),
      views: content.metrics.views,
      engagement: content.metrics.likes + content.metrics.shares + content.metrics.comments,
    })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">
            Track performance across all your social media platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={() => syncAnalyticsMutation.mutate()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync Data
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Views</p>
                <p className="text-2xl font-bold">{formatNumber(analyticsReport?.overview?.totalViews || 0)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analyticsReport?.trends?.viewsGrowth || 0)}
                  <span className={`text-sm ${getTrendColor(analyticsReport?.trends?.viewsGrowth || 0)}`}>
                    {analyticsReport?.trends?.viewsGrowth >= 0 ? '+' : ''}{analyticsReport?.trends?.viewsGrowth?.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
              <Eye className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Engagement</p>
                <p className="text-2xl font-bold">{formatNumber(analyticsReport?.overview?.totalEngagement || 0)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analyticsReport?.trends?.engagementGrowth || 0)}
                  <span className={`text-sm ${getTrendColor(analyticsReport?.trends?.engagementGrowth || 0)}`}>
                    {analyticsReport?.trends?.engagementGrowth >= 0 ? '+' : ''}{analyticsReport?.trends?.engagementGrowth?.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
              <Heart className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Engagement Rate</p>
                <p className="text-2xl font-bold">{analyticsReport?.overview?.avgEngagementRate?.toFixed(1) || 0}%</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Best: {analyticsReport?.overview?.topPerformingPlatform || 'N/A'}
                </p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Posts Published</p>
                <p className="text-2xl font-bold">{analyticsReport?.overview?.totalPosts || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Last {dateRange} days
                </p>
              </div>
              <Calendar className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Platform Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="views" fill="#8884d8" name="Views" />
                <Bar dataKey="engagement" fill="#82ca9d" name="Engagement" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Engagement Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Engagement Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="engagement"
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={platformColors[entry.name] || '#8884d8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Content Performance Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Content Performance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={contentTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="views" stackId="1" stroke="#8884d8" fill="#8884d8" name="Views" />
              <Area type="monotone" dataKey="engagement" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Engagement" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        {funnelData && (
          <Card>
            <CardHeader>
              <CardTitle>Content Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {funnelData.stages.map((stage, index) => (
                  <div key={stage.stage} className="relative">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{stage.stage}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatNumber(stage.count)} {index === 0 ? 'uploads' : index === 1 ? 'posts' : 'interactions'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{stage.conversionRate.toFixed(1)}%</p>
                        <p className="text-sm text-muted-foreground">conversion</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Insights */}
        <Card>
          <CardHeader>
            <CardTitle>AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsReport?.insights?.length > 0 ? (
                analyticsReport.insights.map((insight, index) => (
                  <div key={index} className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                    <p className="text-sm">{insight}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No insights available yet</p>
                  <p className="text-xs">Publish more content to get AI-powered insights</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Content */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsReport?.contentPerformance
              ?.sort((a, b) => b.metrics.views - a.metrics.views)
              ?.slice(0, 5)
              ?.map((content) => (
                <div key={content.postId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge style={{ backgroundColor: platformColors[content.platform] }}>
                        {content.platform.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(content.publishedAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{content.content}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        <span className="font-medium">{formatNumber(content.metrics.views)}</span>
                      </div>
                      <span className="text-muted-foreground">views</span>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        <span className="font-medium">{formatNumber(content.metrics.likes)}</span>
                      </div>
                      <span className="text-muted-foreground">likes</span>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Share className="h-3 w-3" />
                        <span className="font-medium">{formatNumber(content.metrics.shares)}</span>
                      </div>
                      <span className="text-muted-foreground">shares</span>
                    </div>
                  </div>
                </div>
              )) || (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No content performance data available</p>
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}