import { oauthService } from './oauthService';
import { storage } from './storage';

interface RevenueMetrics {
  platform: string;
  period: string; // YYYY-MM-DD
  views: number;
  cpm: number; // Cost per mille (1000 views)
  rpm: number; // Revenue per mille (1000 views)
  earnings: number;
  adImpressions: number;
  clickThroughRate: number;
  estimatedWatchTime: number; // in minutes
}

interface PlatformRevenueAPI {
  fetchRevenue(accessToken: string, startDate: Date, endDate: Date): Promise<RevenueMetrics[]>;
}

class YouTubeRevenueAPI implements PlatformRevenueAPI {
  async fetchRevenue(accessToken: string, startDate: Date, endDate: Date): Promise<RevenueMetrics[]> {
    try {
      // YouTube Analytics API v2
      const response = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?` +
        new URLSearchParams({
          ids: 'channel==MINE',
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          metrics: 'views,estimatedRevenue,cpm,playbackBasedCpm,adImpressions,grossRevenue,estimatedWatchTimeMinutes',
          dimensions: 'day',
          sort: 'day'
        }), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.rows?.map((row: any[]) => ({
        platform: 'youtube',
        period: row[0], // date
        views: row[1] || 0,
        earnings: row[2] || 0,
        cpm: row[3] || 0,
        rpm: row[4] || 0,
        adImpressions: row[5] || 0,
        clickThroughRate: row[5] > 0 ? (row[1] / row[5]) * 100 : 0,
        estimatedWatchTime: row[7] || 0
      })) || [];
    } catch (error) {
      console.error('[YouTubeRevenue] Error fetching revenue:', error);
      return [];
    }
  }
}

class TikTokRevenueAPI implements PlatformRevenueAPI {
  async fetchRevenue(accessToken: string, startDate: Date, endDate: Date): Promise<RevenueMetrics[]> {
    try {
      // TikTok Creator Center API
      const response = await fetch(
        'https://open-api.tiktok.com/research/analytics/revenue/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_date: Math.floor(startDate.getTime() / 1000),
          end_date: Math.floor(endDate.getTime() / 1000),
          granularity: 'DAY',
          metrics: ['video_view', 'creator_fund_revenue', 'live_gift_revenue']
        })
      });

      if (!response.ok) {
        throw new Error(`TikTok API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.data?.map((item: any) => ({
        platform: 'tiktok',
        period: new Date(item.date * 1000).toISOString().split('T')[0],
        views: item.video_view || 0,
        earnings: (item.creator_fund_revenue || 0) + (item.live_gift_revenue || 0),
        cpm: item.video_view > 0 ? ((item.creator_fund_revenue || 0) / item.video_view) * 1000 : 0,
        rpm: item.video_view > 0 ? (((item.creator_fund_revenue || 0) + (item.live_gift_revenue || 0)) / item.video_view) * 1000 : 0,
        adImpressions: 0, // TikTok doesn't provide this metric
        clickThroughRate: 0,
        estimatedWatchTime: 0
      })) || [];
    } catch (error) {
      console.error('[TikTokRevenue] Error fetching revenue:', error);
      return [];
    }
  }
}

class InstagramRevenueAPI implements PlatformRevenueAPI {
  async fetchRevenue(accessToken: string, startDate: Date, endDate: Date): Promise<RevenueMetrics[]> {
    try {
      // Instagram Business API (Reels monetization)
      const response = await fetch(
        `https://graph.facebook.com/v18.0/me/insights?` +
        new URLSearchParams({
          metric: 'reach,impressions,video_views',
          period: 'day',
          since: Math.floor(startDate.getTime() / 1000).toString(),
          until: Math.floor(endDate.getTime() / 1000).toString()
        }), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Instagram API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Instagram revenue tracking is limited, mostly engagement-based
      return data.data?.map((item: any) => ({
        platform: 'instagram',
        period: item.end_time?.split('T')[0] || '',
        views: item.values?.[0]?.value || 0,
        earnings: 0, // Instagram doesn't directly provide revenue data
        cpm: 0,
        rpm: 0,
        adImpressions: item.values?.[1]?.value || 0,
        clickThroughRate: 0,
        estimatedWatchTime: 0
      })) || [];
    } catch (error) {
      console.error('[InstagramRevenue] Error fetching revenue:', error);
      return [];
    }
  }
}

export class RevenueTrackingService {
  private platformAPIs: Map<string, PlatformRevenueAPI> = new Map([
    ['youtube', new YouTubeRevenueAPI()],
    ['tiktok', new TikTokRevenueAPI()],
    ['instagram', new InstagramRevenueAPI()]
  ]);

  async fetchAllPlatformRevenue(userId: string, startDate: Date, endDate: Date): Promise<{
    totalRevenue: number;
    platformBreakdown: Record<string, RevenueMetrics[]>;
    topPerformingPlatform: string;
    revenueGrowth: number;
    insights: string[];
  }> {
    const platformBreakdown: Record<string, RevenueMetrics[]> = {};
    let totalRevenue = 0;
    let bestPlatformRevenue = 0;
    let topPerformingPlatform = '';

    for (const [platform, api] of this.platformAPIs.entries()) {
      try {
        const accessToken = await oauthService.getValidToken(userId, platform);
        if (!accessToken) {
          console.warn(`[RevenueTracking] No valid token for ${platform}`);
          continue;
        }

        const metrics = await api.fetchRevenue(accessToken, startDate, endDate);
        platformBreakdown[platform] = metrics;

        const platformTotal = metrics.reduce(
          (sum: number, metric: RevenueMetrics) => sum + metric.earnings,
          0
        );
        totalRevenue += platformTotal;

        if (platformTotal > bestPlatformRevenue) {
          bestPlatformRevenue = platformTotal;
          topPerformingPlatform = platform;
        }

        console.log(`[RevenueTracking] Fetched ${metrics.length} revenue records for ${platform}: $${platformTotal.toFixed(2)}`);
      } catch (error) {
        console.error(`[RevenueTracking] Error fetching revenue for ${platform}:`, error);
        platformBreakdown[platform] = [];
      }
    }

    // Calculate revenue growth (compare with previous period)
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodLength);
    const prevRevenue = await this.calculatePreviousPeriodRevenue(userId, prevStartDate, startDate);
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const insights = this.generateRevenueInsights(platformBreakdown, totalRevenue, revenueGrowth);

    return {
      totalRevenue,
      platformBreakdown,
      topPerformingPlatform,
      revenueGrowth,
      insights
    };
  }

  private async calculatePreviousPeriodRevenue(userId: string, startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.fetchAllPlatformRevenue(userId, startDate, endDate);
      return result.totalRevenue;
    } catch (error) {
      console.error('[RevenueTracking] Error calculating previous period revenue:', error);
      return 0;
    }
  }

  private generateRevenueInsights(platformBreakdown: Record<string, RevenueMetrics[]>, totalRevenue: number, revenueGrowth: number): string[] {
    const insights: string[] = [];

    if (totalRevenue > 0) {
      insights.push(`Generated $${totalRevenue.toFixed(2)} in revenue across all platforms`);
    } else {
      insights.push('No revenue data available - ensure monetization is enabled on your platforms');
    }

    if (revenueGrowth > 0) {
      insights.push(`Revenue increased by ${revenueGrowth.toFixed(1)}% compared to previous period`);
    } else if (revenueGrowth < 0) {
      insights.push(`Revenue decreased by ${Math.abs(revenueGrowth).toFixed(1)}% - focus on higher-performing content types`);
    }

    // Platform-specific insights
    const platforms = Object.keys(platformBreakdown).filter(p => platformBreakdown[p].length > 0);
    if (platforms.length > 1) {
      const revenues = platforms.map(p => ({
        platform: p,
        total: platformBreakdown[p].reduce((sum, m) => sum + m.earnings, 0)
      }));
      
      const best = revenues.reduce((a, b) => a.total > b.total ? a : b);
      insights.push(`${best.platform.charAt(0).toUpperCase() + best.platform.slice(1)} is your top revenue platform with $${best.total.toFixed(2)}`);
    }

    // CPM insights
    for (const [platform, metrics] of Object.entries(platformBreakdown)) {
      if (metrics.length > 0) {
        const avgCPM = metrics.reduce((sum, m) => sum + m.cpm, 0) / metrics.length;
        if (avgCPM > 0) {
          insights.push(`${platform.charAt(0).toUpperCase() + platform.slice(1)} average CPM: $${avgCPM.toFixed(2)}`);
        }
      }
    }

    return insights;
  }

  async trackVideoRevenue(userId: string, videoId: string, platform: string): Promise<{
    views: number;
    earnings: number;
    cpm: number;
    lastUpdated: Date;
  }> {
    try {
      const accessToken = await oauthService.getValidToken(userId, platform);
      if (!accessToken) {
        throw new Error(`No valid token for ${platform}`);
      }

      let apiUrl = '';
      let headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      };

      switch (platform) {
        case 'youtube':
          apiUrl = `https://youtubeanalytics.googleapis.com/v2/reports?ids=video==${videoId}&metrics=views,estimatedRevenue,cpm&dimensions=day&sort=day`;
          break;
        case 'tiktok':
          // TikTok video-specific analytics
          apiUrl = `https://open-api.tiktok.com/research/video/info/?video_id=${videoId}`;
          break;
        default:
          throw new Error(`Revenue tracking not supported for ${platform}`);
      }

      const response = await fetch(apiUrl, { headers });
      
      if (!response.ok) {
        throw new Error(`${platform} API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Parse platform-specific response
      let views = 0, earnings = 0, cpm = 0;
      
      if (platform === 'youtube' && data.rows?.length > 0) {
        const latest = data.rows[data.rows.length - 1];
        views = latest[0] || 0;
        earnings = latest[1] || 0;
        cpm = latest[2] || 0;
      } else if (platform === 'tiktok' && data.data) {
        views = data.data.play_count || 0;
        earnings = data.data.creator_fund_revenue || 0;
        cpm = views > 0 ? (earnings / views) * 1000 : 0;
      }

      return {
        views,
        earnings,
        cpm,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`[RevenueTracking] Error tracking video revenue for ${videoId}:`, error);
      return {
        views: 0,
        earnings: 0,
        cpm: 0,
        lastUpdated: new Date()
      };
    }
  }

  async generateRevenueReport(userId: string, startDate: Date, endDate: Date): Promise<{
    summary: {
      totalRevenue: number;
      totalViews: number;
      averageCPM: number;
      averageRPM: number;
      revenueGrowth: number;
    };
    dailyBreakdown: Array<{
      date: string;
      revenue: number;
      views: number;
      cpm: number;
    }>;
    platformComparison: Array<{
      platform: string;
      revenue: number;
      share: number;
      views: number;
      cpm: number;
    }>;
    topPerformingContent: Array<{
      videoId: string;
      title: string;
      revenue: number;
      views: number;
      cpm: number;
    }>;
  }> {
    const revenueData = await this.fetchAllPlatformRevenue(userId, startDate, endDate);
    
    // Aggregate daily data
    const dailyMap = new Map<string, { revenue: number; views: number; cpm: number; count: number }>();
    
    for (const [platform, metrics] of Object.entries(revenueData.platformBreakdown)) {
      for (const metric of metrics) {
        const existing = dailyMap.get(metric.period) || { revenue: 0, views: 0, cpm: 0, count: 0 };
        existing.revenue += metric.earnings;
        existing.views += metric.views;
        existing.cpm += metric.cpm;
        existing.count += 1;
        dailyMap.set(metric.period, existing);
      }
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      views: data.views,
      cpm: data.count > 0 ? data.cpm / data.count : 0
    }));

    // Platform comparison
    const platformComparison = Object.entries(revenueData.platformBreakdown).map(([platform, metrics]) => {
      const revenue = metrics.reduce((sum, m) => sum + m.earnings, 0);
      const views = metrics.reduce((sum, m) => sum + m.views, 0);
      const avgCPM = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.cpm, 0) / metrics.length : 0;
      
      return {
        platform,
        revenue,
        share: revenueData.totalRevenue > 0 ? (revenue / revenueData.totalRevenue) * 100 : 0,
        views,
        cpm: avgCPM
      };
    });

    const totalViews = platformComparison.reduce((sum, p) => sum + p.views, 0);
    const averageCPM = platformComparison.reduce((sum, p, _, arr) => sum + p.cpm / arr.length, 0);

    return {
      summary: {
        totalRevenue: revenueData.totalRevenue,
        totalViews,
        averageCPM,
        averageRPM: totalViews > 0 ? (revenueData.totalRevenue / totalViews) * 1000 : 0,
        revenueGrowth: revenueData.revenueGrowth
      },
      dailyBreakdown: dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)),
      platformComparison: platformComparison.sort((a, b) => b.revenue - a.revenue),
      topPerformingContent: [] // Would require additional video-level tracking
    };
  }
}

export const revenueTrackingService = new RevenueTrackingService();