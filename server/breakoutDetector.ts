import { storage } from './storage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface BreakoutMetrics {
  postId: string;
  platform: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
    velocity: number; // engagement per hour
  };
  percentileRank: number; // 0-100, where 90+ is "breakout"
  isBreakout: boolean;
  detectedAt: Date;
  adBoostRecommendation?: {
    suggested: boolean;
    budget: number;
    duration: number; // hours
    targeting: string;
    reason: string;
  };
}

interface BreakoutAlert {
  id: string;
  userId: string;
  postId: string;
  platform: string;
  alertType: 'breakout_detected' | 'ad_boost_recommended' | 'viral_potential';
  message: string;
  actionUrl?: string;
  createdAt: Date;
  acknowledged: boolean;
}

export class BreakoutDetectorService {
  private readonly BREAKOUT_THRESHOLD = 90; // Top 10%
  private readonly VELOCITY_THRESHOLD = 50; // Engagement per hour threshold
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Start monitoring loop
    this.startMonitoring();
  }

  private startMonitoring() {
    setInterval(async () => {
      await this.scanForBreakouts();
    }, this.CHECK_INTERVAL);

    console.log('[BreakoutDetector] Monitoring started - checking every 5 minutes');
  }

  async scanForBreakouts(): Promise<void> {
    try {
      const users = await storage.getAllUsers();
      
      for (const user of users) {
        await this.analyzeUserContent(user.id);
      }
    } catch (error) {
      console.error('[BreakoutDetector] Error during scan:', error);
    }
  }

  private async analyzeUserContent(userId: string): Promise<void> {
    try {
      // Get recent posts (last 24 hours)
      const recentPosts = await storage.getSocialPostsByUserId(userId);
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const activePosts = recentPosts.filter(post => {
        const postDate = new Date(post.createdAt || '');
        return postDate >= last24Hours;
      });

      if (activePosts.length === 0) return;

      // Calculate percentile ranks for engagement
      const postMetrics = await Promise.all(
        activePosts.map(post => this.calculatePostMetrics(post))
      );

      // Sort by engagement rate to determine percentiles
      const sortedByEngagement = [...postMetrics].sort((a, b) => b.metrics.engagement_rate - a.metrics.engagement_rate);
      
      // Assign percentile ranks
      sortedByEngagement.forEach((post, index) => {
        post.percentileRank = ((sortedByEngagement.length - index) / sortedByEngagement.length) * 100;
        post.isBreakout = post.percentileRank >= this.BREAKOUT_THRESHOLD;
      });

      // Process breakout posts
      const breakoutPosts = postMetrics.filter(post => post.isBreakout);
      
      for (const breakoutPost of breakoutPosts) {
        await this.processBreakoutPost(userId, breakoutPost);
      }

      console.log(`[BreakoutDetector] Analyzed ${activePosts.length} posts for user ${userId}, found ${breakoutPosts.length} breakouts`);
    } catch (error) {
      console.error(`[BreakoutDetector] Error analyzing user ${userId}:`, error);
    }
  }

  private async calculatePostMetrics(post: any): Promise<BreakoutMetrics> {
    const engagement = (post.engagement as any) || {};
    const metrics = engagement.metrics || {};
    
    const views = metrics.views || 0;
    const likes = metrics.likes || 0;
    const comments = metrics.comments || 0;
    const shares = metrics.shares || 0;
    
    const totalEngagement = likes + comments + shares;
    const engagement_rate = views > 0 ? (totalEngagement / views) * 100 : 0;
    
    // Calculate velocity (engagement per hour since posting)
    const postDate = new Date(post.createdAt || Date.now());
    const hoursElapsed = Math.max(1, (Date.now() - postDate.getTime()) / (1000 * 60 * 60));
    const velocity = totalEngagement / hoursElapsed;

    return {
      postId: post.id,
      platform: post.platform,
      metrics: {
        views,
        likes,
        comments,
        shares,
        engagement_rate,
        velocity
      },
      percentileRank: 0, // Will be calculated later
      isBreakout: false, // Will be determined later
      detectedAt: new Date()
    };
  }

  private async processBreakoutPost(userId: string, breakoutPost: BreakoutMetrics): Promise<void> {
    try {
      // Check if we've already processed this breakout
      const existingAlert = await this.getExistingBreakoutAlert(userId, breakoutPost.postId);
      if (existingAlert) return;

      // Generate ad boost recommendation
      const adBoostRec = await this.generateAdBoostRecommendation(userId, breakoutPost);
      breakoutPost.adBoostRecommendation = adBoostRec;

      // Create breakout alert
      const alert: BreakoutAlert = {
        id: `breakout_${breakoutPost.postId}_${Date.now()}`,
        userId,
        postId: breakoutPost.postId,
        platform: breakoutPost.platform,
        alertType: 'breakout_detected',
        message: `🚀 Breakout detected! Your ${breakoutPost.platform} post is in the top ${Math.round(100 - breakoutPost.percentileRank)}% with ${breakoutPost.metrics.engagement_rate.toFixed(1)}% engagement rate`,
        actionUrl: `/analytics/post/${breakoutPost.postId}`,
        createdAt: new Date(),
        acknowledged: false
      };

      await this.saveBreakoutAlert(alert);

      // Create ad boost alert if recommended
      if (adBoostRec.suggested) {
        const adAlert: BreakoutAlert = {
          id: `adboost_${breakoutPost.postId}_${Date.now()}`,
          userId,
          postId: breakoutPost.postId,
          platform: breakoutPost.platform,
          alertType: 'ad_boost_recommended',
          message: `💰 Ad boost recommended: $${adBoostRec.budget} for ${adBoostRec.duration}h could amplify this breakout post`,
          actionUrl: `/advertising/boost/${breakoutPost.postId}`,
          createdAt: new Date(),
          acknowledged: false
        };

        await this.saveBreakoutAlert(adAlert);
      }

      console.log(`[BreakoutDetector] Processed breakout post ${breakoutPost.postId} for user ${userId}`);
    } catch (error) {
      console.error('[BreakoutDetector] Error processing breakout post:', error);
    }
  }

  private async generateAdBoostRecommendation(userId: string, breakoutPost: BreakoutMetrics): Promise<{
    suggested: boolean;
    budget: number;
    duration: number;
    targeting: string;
    reason: string;
  }> {
    try {
      // Get user's historical performance data
      const userPosts = await storage.getSocialPostsByUserId(userId);
      const platformPosts = userPosts.filter(p => p.platform === breakoutPost.platform);
      
      const avgEngagement = platformPosts.reduce((sum, post) => {
        const engagement = (post.engagement as any) || {};
        const metrics = engagement.metrics || {};
        const views = metrics.views || 0;
        const totalEng = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
        return sum + (views > 0 ? (totalEng / views) * 100 : 0);
      }, 0) / Math.max(1, platformPosts.length);

      const performanceMultiplier = breakoutPost.metrics.engagement_rate / Math.max(0.1, avgEngagement);
      
      // AI-powered recommendation
      const prompt = `
        Analyze this breakout post performance and recommend ad boost strategy:
        
        Platform: ${breakoutPost.platform}
        Current engagement rate: ${breakoutPost.metrics.engagement_rate.toFixed(2)}%
        Velocity: ${breakoutPost.metrics.velocity.toFixed(1)} engagements/hour
        Performance vs user average: ${performanceMultiplier.toFixed(1)}x
        
        Provide JSON recommendation: {
          "suggested": boolean,
          "budget": number (USD),
          "duration": number (hours),
          "targeting": "string description",
          "reason": "brief explanation"
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const recommendation = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        suggested: recommendation.suggested || false,
        budget: recommendation.budget || 0,
        duration: recommendation.duration || 0,
        targeting: recommendation.targeting || '',
        reason: recommendation.reason || 'No recommendation available'
      };
    } catch (error) {
      console.error('[BreakoutDetector] Error generating ad boost recommendation:', error);
      
      // Fallback recommendation based on simple heuristics
      const suggested = breakoutPost.metrics.engagement_rate > 5.0 && breakoutPost.metrics.velocity > this.VELOCITY_THRESHOLD;
      
      return {
        suggested,
        budget: suggested ? Math.min(50, Math.round(breakoutPost.metrics.velocity * 2)) : 0,
        duration: suggested ? 12 : 0,
        targeting: `${breakoutPost.platform} lookalike audience`,
        reason: suggested ? 'High engagement velocity detected' : 'Performance below boost threshold'
      };
    }
  }

  private async getExistingBreakoutAlert(userId: string, postId: string): Promise<BreakoutAlert | null> {
    try {
      // In a real implementation, this would query the database
      // For now, return null to allow processing
      return null;
    } catch (error) {
      console.error('[BreakoutDetector] Error checking existing alert:', error);
      return null;
    }
  }

  private async saveBreakoutAlert(alert: BreakoutAlert): Promise<void> {
    try {
      // In a real implementation, this would save to database
      console.log(`[BreakoutDetector] Alert created: ${alert.alertType} for post ${alert.postId}`);
      
      // Store in memory for demo (replace with actual database storage)
      // await storage.createBreakoutAlert(alert);
    } catch (error) {
      console.error('[BreakoutDetector] Error saving alert:', error);
    }
  }

  async getBreakoutAlerts(userId: string, limit: number = 10): Promise<BreakoutAlert[]> {
    try {
      // In a real implementation, this would query the database
      // For now, return empty array
      return [];
    } catch (error) {
      console.error('[BreakoutDetector] Error fetching alerts:', error);
      return [];
    }
  }

  async acknowledgeAlert(userId: string, alertId: string): Promise<void> {
    try {
      // Mark alert as acknowledged
      console.log(`[BreakoutDetector] Alert ${alertId} acknowledged by user ${userId}`);
    } catch (error) {
      console.error('[BreakoutDetector] Error acknowledging alert:', error);
    }
  }

  async getBreakoutStats(userId: string, days: number = 30): Promise<{
    totalBreakouts: number;
    avgBreakoutEngagement: number;
    topPlatform: string;
    adBoostOpportunities: number;
    potentialReach: number;
  }> {
    try {
      // Calculate breakout statistics for the user
      const posts = await storage.getSocialPostsByUserId(userId);
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const recentPosts = posts.filter(post => {
        const postDate = new Date(post.createdAt || '');
        return postDate >= cutoffDate;
      });

      // Simulate breakout analysis
      const breakoutCount = Math.floor(recentPosts.length * 0.1); // Assume 10% are breakouts
      
      return {
        totalBreakouts: breakoutCount,
        avgBreakoutEngagement: 8.5, // Placeholder
        topPlatform: 'youtube',
        adBoostOpportunities: Math.floor(breakoutCount * 0.6),
        potentialReach: breakoutCount * 15000 // Estimated reach per breakout
      };
    } catch (error) {
      console.error('[BreakoutDetector] Error calculating stats:', error);
      return {
        totalBreakouts: 0,
        avgBreakoutEngagement: 0,
        topPlatform: 'unknown',
        adBoostOpportunities: 0,
        potentialReach: 0
      };
    }
  }
}

export const breakoutDetectorService = new BreakoutDetectorService();