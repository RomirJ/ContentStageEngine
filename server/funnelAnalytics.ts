import { storage } from './storage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface FunnelMetrics {
  platform: string;
  stage: 'views' | 'likes' | 'comments' | 'shares' | 'follows' | 'clicks' | 'conversions';
  count: number;
  conversionRate: number;
  dropOffRate: number;
  timestamp: Date;
}

interface FunnelReport {
  period: {
    start: Date;
    end: Date;
  };
  overview: {
    totalViews: number;
    totalEngagement: number;
    totalFollows: number;
    totalRevenue: number;
    overallConversionRate: number;
  };
  platformFunnels: Array<{
    platform: string;
    stages: {
      views: { count: number; rate: number };
      likes: { count: number; rate: number };
      comments: { count: number; rate: number };
      shares: { count: number; rate: number };
      follows: { count: number; rate: number };
      clicks: { count: number; rate: number };
      conversions: { count: number; rate: number };
    };
    topDropOffStage: string;
    revenueGenerated: number;
  }>;
  insights: string[];
  recommendations: string[];
}

export class FunnelAnalyticsService {
  async generateFunnelReport(userId: string, startDate: Date, endDate: Date): Promise<FunnelReport> {
    const posts = await storage.getSocialPostsByUserId(userId);
    const filteredPosts = posts.filter(post => {
      const postDate = new Date(post.createdAt || '');
      return postDate >= startDate && postDate <= endDate;
    });

    const platformFunnels = await this.calculatePlatformFunnels(filteredPosts);
    const overview = this.calculateOverview(platformFunnels);
    const insights = await this.generateInsights(platformFunnels, overview);
    const recommendations = await this.generateRecommendations(platformFunnels, insights);

    return {
      period: { start: startDate, end: endDate },
      overview,
      platformFunnels,
      insights,
      recommendations
    };
  }

  private async calculatePlatformFunnels(posts: any[]): Promise<FunnelReport['platformFunnels']> {
    const platforms = ['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin'];
    const funnels = [];

    for (const platform of platforms) {
      const platformPosts = posts.filter(post => post.platform === platform);
      if (platformPosts.length === 0) {
        continue;
      }

      const metrics = this.aggregateMetrics(platformPosts);
      const stages = this.calculateConversionRates(metrics);
      const topDropOffStage = this.findTopDropOff(stages);
      const revenueGenerated = this.calculateRevenue(platformPosts);

      funnels.push({
        platform,
        stages,
        topDropOffStage,
        revenueGenerated
      });
    }

    return funnels;
  }

  private aggregateMetrics(posts: any[]): Record<string, number> {
    const totals = {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      follows: 0,
      clicks: 0,
      conversions: 0
    };

    for (const post of posts) {
      const engagement = (post.engagement as any) || {};
      const metrics = engagement.metrics || {};
      
      totals.views += metrics.views || 0;
      totals.likes += metrics.likes || 0;
      totals.comments += metrics.comments || 0;
      totals.shares += metrics.shares || 0;
      totals.follows += metrics.follows || 0;
      totals.clicks += metrics.clicks || 0;
      totals.conversions += metrics.conversions || 0;
    }

    return totals;
  }

  private calculateConversionRates(metrics: Record<string, number>) {
    const views = metrics.views || 1; // Avoid division by zero

    return {
      views: { count: metrics.views, rate: 100 },
      likes: { count: metrics.likes, rate: (metrics.likes / views) * 100 },
      comments: { count: metrics.comments, rate: (metrics.comments / views) * 100 },
      shares: { count: metrics.shares, rate: (metrics.shares / views) * 100 },
      follows: { count: metrics.follows, rate: (metrics.follows / views) * 100 },
      clicks: { count: metrics.clicks, rate: (metrics.clicks / views) * 100 },
      conversions: { count: metrics.conversions, rate: (metrics.conversions / views) * 100 }
    };
  }

  private findTopDropOff(stages: any): string {
    const rates = [
      { stage: 'likes', rate: stages.likes.rate },
      { stage: 'comments', rate: stages.comments.rate },
      { stage: 'shares', rate: stages.shares.rate },
      { stage: 'follows', rate: stages.follows.rate },
      { stage: 'clicks', rate: stages.clicks.rate },
      { stage: 'conversions', rate: stages.conversions.rate }
    ];

    let maxDropOff = 0;
    let topDropOffStage = 'none';
    
    for (let i = 0; i < rates.length - 1; i++) {
      const dropOff = rates[i].rate - rates[i + 1].rate;
      if (dropOff > maxDropOff) {
        maxDropOff = dropOff;
        topDropOffStage = rates[i + 1].stage;
      }
    }

    return topDropOffStage;
  }

  private calculateRevenue(posts: any[]): number {
    return posts.reduce((total, post) => {
      const engagement = (post.engagement as any) || {};
      const revenue = engagement.revenue || {};
      return total + (revenue.earnings || 0);
    }, 0);
  }

  private calculateOverview(platformFunnels: any[]): FunnelReport['overview'] {
    const totals = platformFunnels.reduce((acc, platform) => {
      acc.totalViews += platform.stages.views.count;
      acc.totalEngagement += platform.stages.likes.count + platform.stages.comments.count + platform.stages.shares.count;
      acc.totalFollows += platform.stages.follows.count;
      acc.totalRevenue += platform.revenueGenerated;
      return acc;
    }, {
      totalViews: 0,
      totalEngagement: 0,
      totalFollows: 0,
      totalRevenue: 0
    });

    const totalConversions = platformFunnels.reduce((sum, platform) => 
      sum + platform.stages.conversions.count, 0
    );

    return {
      ...totals,
      overallConversionRate: totals.totalViews > 0 ? (totalConversions / totals.totalViews) * 100 : 0
    };
  }

  private async generateInsights(platformFunnels: any[], overview: any): Promise<string[]> {
    try {
      const prompt = `
        Analyze this social media funnel data and provide 3-4 key insights:
        
        Overview:
        - Total Views: ${overview.totalViews}
        - Total Engagement: ${overview.totalEngagement}
        - Total Follows: ${overview.totalFollows}
        - Total Revenue: $${overview.totalRevenue}
        - Conversion Rate: ${overview.overallConversionRate.toFixed(2)}%
        
        Platform Performance:
        ${platformFunnels.map(p => `
        ${p.platform.toUpperCase()}:
        - Views: ${p.stages.views.count}
        - Engagement Rate: ${((p.stages.likes.count + p.stages.comments.count + p.stages.shares.count) / p.stages.views.count * 100).toFixed(1)}%
        - Conversion Rate: ${p.stages.conversions.rate.toFixed(2)}%
        - Top Drop-off: ${p.topDropOffStage}
        - Revenue: $${p.revenueGenerated}
        `).join('')}
        
        Provide actionable insights in JSON format: {"insights": ["insight1", "insight2", "insight3"]}
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.insights || [
        'Insufficient data for detailed insights',
        'Continue posting consistently to gather more analytics',
        'Focus on engagement optimization'
      ];
    } catch (error) {
      console.error('Error generating funnel insights:', error);
      return [
        'Analytics data collected successfully',
        'Monitor engagement trends across platforms',
        'Optimize content for better conversion rates'
      ];
    }
  }

  private async generateRecommendations(platformFunnels: any[], insights: string[]): Promise<string[]> {
    try {
      const prompt = `
        Based on these funnel insights and platform performance, provide 3-4 specific recommendations:
        
        Insights: ${insights.join('; ')}
        
        Platform Drop-offs:
        ${platformFunnels.map(p => `${p.platform}: ${p.topDropOffStage}`).join(', ')}
        
        Best Performing Platform: ${platformFunnels.reduce((best, current) => 
          current.stages.conversions.rate > (best?.stages?.conversions?.rate || 0) ? current : best, null
        )?.platform || 'none'}
        
        Provide actionable recommendations in JSON format: {"recommendations": ["rec1", "rec2", "rec3"]}
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.recommendations || [
        'Increase posting frequency on best-performing platforms',
        'Optimize content hooks to reduce drop-off rates',
        'Add clear calls-to-action to improve conversions',
        'A/B test different content formats'
      ];
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [
        'Focus on platforms with highest engagement',
        'Improve content quality and consistency',
        'Add clear calls-to-action to posts',
        'Monitor and respond to comments promptly'
      ];
    }
  }

  async exportFunnelData(userId: string, format: 'csv' | 'json', startDate: Date, endDate: Date): Promise<{
    data: string;
    filename: string;
    contentType: string;
  }> {
    const report = await this.generateFunnelReport(userId, startDate, endDate);
    
    if (format === 'csv') {
      const csvData = this.convertToCSV(report);
      return {
        data: csvData,
        filename: `funnel-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`,
        contentType: 'text/csv'
      };
    } else {
      return {
        data: JSON.stringify(report, null, 2),
        filename: `funnel-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.json`,
        contentType: 'application/json'
      };
    }
  }

  private convertToCSV(report: FunnelReport): string {
    const headers = [
      'Platform',
      'Views',
      'Likes',
      'Likes Rate (%)',
      'Comments',
      'Comments Rate (%)',
      'Shares',
      'Shares Rate (%)',
      'Follows',
      'Follows Rate (%)',
      'Clicks',
      'Clicks Rate (%)',
      'Conversions',
      'Conversions Rate (%)',
      'Revenue ($)',
      'Top Drop-off Stage'
    ];

    const rows = report.platformFunnels.map(platform => [
      platform.platform,
      platform.stages.views.count,
      platform.stages.likes.count,
      platform.stages.likes.rate.toFixed(2),
      platform.stages.comments.count,
      platform.stages.comments.rate.toFixed(2),
      platform.stages.shares.count,
      platform.stages.shares.rate.toFixed(2),
      platform.stages.follows.count,
      platform.stages.follows.rate.toFixed(2),
      platform.stages.clicks.count,
      platform.stages.clicks.rate.toFixed(2),
      platform.stages.conversions.count,
      platform.stages.conversions.rate.toFixed(2),
      platform.revenueGenerated.toFixed(2),
      platform.topDropOffStage
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  async getRealtimeMetrics(userId: string): Promise<{
    activeViews: number;
    recentEngagement: number;
    conversionRate: number;
    revenueToday: number;
  }> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const posts = await storage.getSocialPostsByUserId(userId);
    const todayPosts = posts.filter(post => {
      const postDate = new Date(post.createdAt || '');
      return postDate >= startOfDay;
    });

    const metrics = this.aggregateMetrics(todayPosts);
    
    return {
      activeViews: metrics.views,
      recentEngagement: metrics.likes + metrics.comments + metrics.shares,
      conversionRate: metrics.views > 0 ? (metrics.conversions / metrics.views) * 100 : 0,
      revenueToday: this.calculateRevenue(todayPosts)
    };
  }
}

export const funnelAnalyticsService = new FunnelAnalyticsService();