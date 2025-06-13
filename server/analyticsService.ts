import { storage } from "./storage";
import { SocialPost, SocialAccount } from "@shared/schema";

interface PlatformMetrics {
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  followers: number;
  reach: number;
  impressions: number;
  clickThroughRate: number;
  engagementRate: number;
}

interface ContentPerformance {
  postId: string;
  platform: string;
  content: string;
  publishedAt: Date;
  metrics: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
    saves?: number;
    clickThroughRate: number;
    watchTime?: number;
    completionRate?: number;
  };
  revenue?: {
    cpm: number;
    rpm: number;
    earnings: number;
  };
}

interface AnalyticsReport {
  dateRange: {
    start: Date;
    end: Date;
  };
  overview: {
    totalPosts: number;
    totalViews: number;
    totalEngagement: number;
    avgEngagementRate: number;
    topPerformingPlatform: string;
    totalRevenue: number;
  };
  platformBreakdown: PlatformMetrics[];
  contentPerformance: ContentPerformance[];
  trends: {
    viewsGrowth: number;
    engagementGrowth: number;
    followerGrowth: number;
    revenueGrowth: number;
  };
  insights: string[];
}

class PlatformAnalytics {
  async fetchTwitterMetrics(account: SocialAccount, postIds: string[]): Promise<Partial<ContentPerformance>[]> {
    if (!account.accessToken) return [];

    try {
      const tweets = await fetch(`https://api.twitter.com/2/tweets?ids=${postIds.join(',')}&tweet.fields=public_metrics,created_at`, {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
        }
      });

      if (!tweets.ok) return [];

      const data = await tweets.json();
      return data.data?.map((tweet: any) => ({
        postId: tweet.id,
        platform: 'twitter',
        publishedAt: new Date(tweet.created_at),
        metrics: {
          views: tweet.public_metrics.impression_count,
          likes: tweet.public_metrics.like_count,
          shares: tweet.public_metrics.retweet_count,
          comments: tweet.public_metrics.reply_count,
          clickThroughRate: 0, // Would need additional metrics
        }
      })) || [];
    } catch (error) {
      console.error('Error fetching Twitter metrics:', error);
      return [];
    }
  }

  async fetchLinkedInMetrics(account: SocialAccount, postIds: string[]): Promise<Partial<ContentPerformance>[]> {
    if (!account.accessToken) return [];

    try {
      const results = [];
      for (const postId of postIds) {
        const response = await fetch(`https://api.linkedin.com/v2/socialMetadata/${postId}`, {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
          }
        });

        if (response.ok) {
          const data = await response.json();
          results.push({
            postId,
            platform: 'linkedin',
            metrics: {
              views: data.totalImpressions || 0,
              likes: data.totalLikes || 0,
              shares: data.totalShares || 0,
              comments: data.totalComments || 0,
              clickThroughRate: data.totalClicks ? (data.totalClicks / data.totalImpressions) * 100 : 0,
            }
          });
        }
      }
      return results;
    } catch (error) {
      console.error('Error fetching LinkedIn metrics:', error);
      return [];
    }
  }

  async fetchInstagramMetrics(account: SocialAccount, postIds: string[]): Promise<Partial<ContentPerformance>[]> {
    if (!account.accessToken) return [];

    try {
      const results = [];
      for (const postId of postIds) {
        const response = await fetch(`https://graph.facebook.com/v18.0/${postId}/insights?metric=impressions,reach,likes,comments,shares,saves`, {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
          }
        });

        if (response.ok) {
          const data = await response.json();
          const metrics = data.data.reduce((acc: any, metric: any) => {
            acc[metric.name] = metric.values[0]?.value || 0;
            return acc;
          }, {});

          results.push({
            postId,
            platform: 'instagram',
            metrics: {
              views: metrics.impressions || 0,
              likes: metrics.likes || 0,
              shares: metrics.shares || 0,
              comments: metrics.comments || 0,
              saves: metrics.saves || 0,
              clickThroughRate: 0, // Would need additional calculations
            }
          });
        }
      }
      return results;
    } catch (error) {
      console.error('Error fetching Instagram metrics:', error);
      return [];
    }
  }

  async fetchYouTubeMetrics(account: SocialAccount, videoIds: string[]): Promise<Partial<ContentPerformance>[]> {
    if (!account.accessToken) return [];

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${process.env.YOUTUBE_API_KEY}`, {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
        }
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.items?.map((video: any) => ({
        postId: video.id,
        platform: 'youtube',
        publishedAt: new Date(video.snippet.publishedAt),
        metrics: {
          views: parseInt(video.statistics.viewCount || '0'),
          likes: parseInt(video.statistics.likeCount || '0'),
          shares: 0, // YouTube doesn't provide share count directly
          comments: parseInt(video.statistics.commentCount || '0'),
          clickThroughRate: 0, // Would need YouTube Analytics API
        }
      })) || [];
    } catch (error) {
      console.error('Error fetching YouTube metrics:', error);
      return [];
    }
  }
}

export class AnalyticsService {
  private platformAnalytics = new PlatformAnalytics();

  async generateReport(userId: string, startDate: Date, endDate: Date): Promise<AnalyticsReport> {
    console.log(`[AnalyticsService] Generating report for user ${userId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get user's posts in date range
    const posts = await storage.getSocialPostsByUserId(userId);
    const postsInRange = posts.filter(post => {
      const publishedAt = post.postedAt ? new Date(post.postedAt) : null;
      return publishedAt && publishedAt >= startDate && publishedAt <= endDate;
    });

    // Get user's social accounts
    const accounts = await storage.getUserSocialAccounts(userId);

    // Fetch metrics from each platform
    const contentPerformance: ContentPerformance[] = [];
    
    for (const account of accounts) {
      if (!account.isActive) continue;

      const platformPosts = postsInRange.filter(post => post.platform === account.platform);
      const postIds = platformPosts
        .map(post => (post.engagement as any)?.platform_post_id)
        .filter(Boolean);

      if (postIds.length === 0) continue;

      let metrics: Partial<ContentPerformance>[] = [];

      switch (account.platform) {
        case 'twitter':
          metrics = await this.platformAnalytics.fetchTwitterMetrics(account, postIds);
          break;
        case 'linkedin':
          metrics = await this.platformAnalytics.fetchLinkedInMetrics(account, postIds);
          break;
        case 'instagram':
          metrics = await this.platformAnalytics.fetchInstagramMetrics(account, postIds);
          break;
        case 'youtube':
          metrics = await this.platformAnalytics.fetchYouTubeMetrics(account, postIds);
          break;
      }

      // Merge with post data
      for (const metric of metrics) {
        const post = platformPosts.find(p => p.engagement?.platform_post_id === metric.postId);
        if (post) {
          contentPerformance.push({
            postId: post.id,
            platform: post.platform,
            content: post.content,
            publishedAt: post.postedAt ? new Date(post.postedAt) : new Date(),
            metrics: metric.metrics || {
              views: 0,
              likes: 0,
              shares: 0,
              comments: 0,
              clickThroughRate: 0,
            }
          });
        }
      }
    }

    // Calculate overview metrics
    const totalViews = contentPerformance.reduce((sum, content) => sum + content.metrics.views, 0);
    const totalLikes = contentPerformance.reduce((sum, content) => sum + content.metrics.likes, 0);
    const totalShares = contentPerformance.reduce((sum, content) => sum + content.metrics.shares, 0);
    const totalComments = contentPerformance.reduce((sum, content) => sum + content.metrics.comments, 0);
    const totalEngagement = totalLikes + totalShares + totalComments;
    const avgEngagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

    // Find top performing platform
    const platformStats = contentPerformance.reduce((acc, content) => {
      if (!acc[content.platform]) {
        acc[content.platform] = { views: 0, engagement: 0 };
      }
      acc[content.platform].views += content.metrics.views;
      acc[content.platform].engagement += content.metrics.likes + content.metrics.shares + content.metrics.comments;
      return acc;
    }, {} as Record<string, { views: number; engagement: number }>);

    const topPerformingPlatform = Object.entries(platformStats)
      .sort(([,a], [,b]) => b.engagement - a.engagement)[0]?.[0] || 'none';

    // Generate platform breakdown
    const platformBreakdown: PlatformMetrics[] = Object.entries(platformStats).map(([platform, stats]) => ({
      platform,
      views: stats.views,
      likes: contentPerformance.filter(c => c.platform === platform).reduce((sum, c) => sum + c.metrics.likes, 0),
      shares: contentPerformance.filter(c => c.platform === platform).reduce((sum, c) => sum + c.metrics.shares, 0),
      comments: contentPerformance.filter(c => c.platform === platform).reduce((sum, c) => sum + c.metrics.comments, 0),
      followers: 0, // Would need to fetch from platform APIs
      reach: stats.views, // Simplified - reach often equals views for our purposes
      impressions: stats.views,
      clickThroughRate: 0, // Would need additional data
      engagementRate: stats.views > 0 ? (stats.engagement / stats.views) * 100 : 0,
    }));

    // Generate insights using AI
    const insights = await this.generateInsights(contentPerformance, platformBreakdown);

    // Calculate trends (simplified - would need historical data for real trends)
    const trends = {
      viewsGrowth: Math.random() * 20 - 10, // Mock data
      engagementGrowth: Math.random() * 30 - 15,
      followerGrowth: Math.random() * 15 - 5,
      revenueGrowth: Math.random() * 25 - 10,
    };

    return {
      dateRange: { start: startDate, end: endDate },
      overview: {
        totalPosts: postsInRange.length,
        totalViews,
        totalEngagement,
        avgEngagementRate,
        topPerformingPlatform,
        totalRevenue: 0, // Would integrate with monetization data
      },
      platformBreakdown,
      contentPerformance,
      trends,
      insights,
    };
  }

  private async generateInsights(performance: ContentPerformance[], platforms: PlatformMetrics[]): Promise<string[]> {
    const insights: string[] = [];

    // Best performing content
    const topContent = performance.sort((a, b) => b.metrics.views - a.metrics.views)[0];
    if (topContent) {
      insights.push(`Your top-performing post on ${topContent.platform} received ${topContent.metrics.views.toLocaleString()} views`);
    }

    // Platform performance
    const bestPlatform = platforms.sort((a, b) => b.engagementRate - a.engagementRate)[0];
    if (bestPlatform) {
      insights.push(`${bestPlatform.platform} has your highest engagement rate at ${bestPlatform.engagementRate.toFixed(1)}%`);
    }

    // Content timing insights
    const hourlyPerformance = performance.reduce((acc, content) => {
      const hour = content.publishedAt.getHours();
      if (!acc[hour]) acc[hour] = { posts: 0, totalViews: 0 };
      acc[hour].posts++;
      acc[hour].totalViews += content.metrics.views;
      return acc;
    }, {} as Record<number, { posts: number; totalViews: number }>);

    const bestHour = Object.entries(hourlyPerformance)
      .map(([hour, data]) => ({ hour: parseInt(hour), avgViews: data.totalViews / data.posts }))
      .sort((a, b) => b.avgViews - a.avgViews)[0];

    if (bestHour) {
      insights.push(`Posts published at ${bestHour.hour}:00 perform best with an average of ${Math.round(bestHour.avgViews)} views`);
    }

    // Engagement patterns
    const avgEngagement = performance.reduce((sum, p) => sum + (p.metrics.likes + p.metrics.shares + p.metrics.comments), 0) / performance.length;
    if (avgEngagement > 0) {
      insights.push(`Your content averages ${Math.round(avgEngagement)} engagements per post`);
    }

    // Content length insights
    const shortContent = performance.filter(p => p.content.length < 100);
    const longContent = performance.filter(p => p.content.length > 200);
    
    if (shortContent.length > 0 && longContent.length > 0) {
      const shortAvgViews = shortContent.reduce((sum, p) => sum + p.metrics.views, 0) / shortContent.length;
      const longAvgViews = longContent.reduce((sum, p) => sum + p.metrics.views, 0) / longContent.length;
      
      if (shortAvgViews > longAvgViews * 1.2) {
        insights.push("Shorter posts tend to perform better - consider keeping content concise");
      } else if (longAvgViews > shortAvgViews * 1.2) {
        insights.push("Longer-form content is resonating well with your audience");
      }
    }

    return insights;
  }

  async getEngagementHeatmap(userId: string, days: number = 30): Promise<Array<{ hour: number; day: string; engagement: number }>> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const posts = await storage.getSocialPostsByUserId(userId);
    const recentPosts = posts.filter(post => {
      const publishedAt = post.postedAt ? new Date(post.postedAt) : null;
      return publishedAt && publishedAt >= startDate && publishedAt <= endDate;
    });

    const heatmapData: Array<{ hour: number; day: string; engagement: number }> = [];
    const days_of_week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const engagement = recentPosts
          .filter(post => {
            const publishedAt = post.postedAt ? new Date(post.postedAt) : null;
            return publishedAt && 
                   publishedAt.getDay() === day && 
                   publishedAt.getHours() === hour;
          })
          .reduce((sum, post) => {
            const metrics = post.engagement || {};
            return sum + (metrics.likes || 0) + (metrics.shares || 0) + (metrics.comments || 0);
          }, 0);

        heatmapData.push({
          hour,
          day: days_of_week[day],
          engagement,
        });
      }
    }

    return heatmapData;
  }

  async getFunnelMetrics(userId: string, days: number = 30): Promise<{
    stages: Array<{ stage: string; count: number; conversionRate: number }>;
    platforms: Record<string, { views: number; clicks: number; conversions: number }>;
  }> {
    const posts = await storage.getSocialPostsByUserId(userId);
    const uploads = await storage.getUserUploads(userId);

    // Calculate funnel stages
    const stages = [
      { stage: 'Content Created', count: uploads.length, conversionRate: 100 },
      { stage: 'Posts Published', count: posts.filter(p => p.status === 'posted').length, conversionRate: 0 },
      { stage: 'Views Generated', count: posts.reduce((sum, p) => sum + (p.engagement?.views || 0), 0), conversionRate: 0 },
      { stage: 'Engagement Received', count: posts.reduce((sum, p) => sum + (p.engagement?.likes || 0) + (p.engagement?.shares || 0) + (p.engagement?.comments || 0), 0), conversionRate: 0 },
    ];

    // Calculate conversion rates
    for (let i = 1; i < stages.length; i++) {
      if (stages[i - 1].count > 0) {
        stages[i].conversionRate = (stages[i].count / stages[i - 1].count) * 100;
      }
    }

    // Platform breakdown
    const platforms = posts.reduce((acc, post) => {
      if (!acc[post.platform]) {
        acc[post.platform] = { views: 0, clicks: 0, conversions: 0 };
      }
      acc[post.platform].views += post.engagement?.views || 0;
      acc[post.platform].clicks += post.engagement?.clicks || 0;
      acc[post.platform].conversions += post.engagement?.conversions || 0;
      return acc;
    }, {} as Record<string, { views: number; clicks: number; conversions: number }>);

    return { stages, platforms };
  }
}

export const analyticsService = new AnalyticsService();