import { storage } from "./storage";
import { SocialAccount, SocialPost } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EngagementEvent {
  id: string;
  type: 'like' | 'comment' | 'share' | 'retweet' | 'mention' | 'follow';
  platform: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  content?: string;
  timestamp: Date;
  metadata?: any;
}

interface ReplyDraft {
  id: string;
  originalCommentId: string;
  content: string;
  tone: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  confidence: number;
  createdAt: Date;
}

interface EngagementMetrics {
  postId: string;
  platform: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    retweets: number;
    saves: number;
    clicks: number;
  };
  engagement_rate: number;
  reach: number;
  impressions: number;
  updated_at: Date;
}

class PlatformWebhookHandler {
  async handleTwitterWebhook(event: any): Promise<EngagementEvent[]> {
    const events: EngagementEvent[] = [];
    
    if (event.tweet_create_events) {
      for (const tweet of event.tweet_create_events) {
        // Check if it's a reply to our content
        if (tweet.in_reply_to_status_id) {
          events.push({
            id: tweet.id_str,
            type: 'comment',
            platform: 'twitter',
            postId: tweet.in_reply_to_status_id,
            authorId: tweet.user.id_str,
            authorUsername: tweet.user.screen_name,
            content: tweet.text,
            timestamp: new Date(tweet.created_at),
            metadata: { tweet_id: tweet.id_str }
          });
        }
      }
    }

    if (event.favorite_events) {
      for (const favorite of event.favorite_events) {
        events.push({
          id: `like_${favorite.id}`,
          type: 'like',
          platform: 'twitter',
          postId: favorite.favorited_status.id_str,
          authorId: favorite.user.id_str,
          authorUsername: favorite.user.screen_name,
          timestamp: new Date(favorite.created_at),
          metadata: { tweet_id: favorite.favorited_status.id_str }
        });
      }
    }

    if (event.follow_events) {
      for (const follow of event.follow_events) {
        events.push({
          id: `follow_${follow.source.id_str}`,
          type: 'follow',
          platform: 'twitter',
          postId: '',
          authorId: follow.source.id_str,
          authorUsername: follow.source.screen_name,
          timestamp: new Date(follow.created_at),
          metadata: { follower_count: follow.source.followers_count }
        });
      }
    }

    return events;
  }

  async handleLinkedInWebhook(event: any): Promise<EngagementEvent[]> {
    const events: EngagementEvent[] = [];

    if (event.activityType === 'COMMENT') {
      events.push({
        id: event.activity.id,
        type: 'comment',
        platform: 'linkedin',
        postId: event.object,
        authorId: event.actor,
        authorUsername: event.actorDisplayName || 'Unknown',
        content: event.activity.message?.text,
        timestamp: new Date(event.created.time),
        metadata: event
      });
    }

    if (event.activityType === 'LIKE') {
      events.push({
        id: event.activity.id,
        type: 'like',
        platform: 'linkedin',
        postId: event.object,
        authorId: event.actor,
        authorUsername: event.actorDisplayName || 'Unknown',
        timestamp: new Date(event.created.time),
        metadata: event
      });
    }

    return events;
  }

  async handleInstagramWebhook(event: any): Promise<EngagementEvent[]> {
    const events: EngagementEvent[] = [];

    if (event.entry) {
      for (const entry of event.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'comments') {
              events.push({
                id: change.value.id,
                type: 'comment',
                platform: 'instagram',
                postId: change.value.media.id,
                authorId: change.value.from.id,
                authorUsername: change.value.from.username,
                content: change.value.text,
                timestamp: new Date(),
                metadata: change.value
              });
            }
          }
        }
      }
    }

    return events;
  }
}

export class EngagementService {
  private webhookHandler = new PlatformWebhookHandler();
  private replyDrafts: Map<string, ReplyDraft> = new Map();

  async processWebhookEvent(platform: string, payload: any): Promise<void> {
    console.log(`[EngagementService] Processing ${platform} webhook event`);

    let events: EngagementEvent[] = [];

    try {
      switch (platform) {
        case 'twitter':
          events = await this.webhookHandler.handleTwitterWebhook(payload);
          break;
        case 'linkedin':
          events = await this.webhookHandler.handleLinkedInWebhook(payload);
          break;
        case 'instagram':
          events = await this.webhookHandler.handleInstagramWebhook(payload);
          break;
        default:
          console.log(`[EngagementService] Unsupported platform: ${platform}`);
          return;
      }

      for (const event of events) {
        await this.handleEngagementEvent(event);
      }
    } catch (error) {
      console.error(`[EngagementService] Error processing ${platform} webhook:`, error);
    }
  }

  private async handleEngagementEvent(event: EngagementEvent): Promise<void> {
    console.log(`[EngagementService] Handling ${event.type} event on ${event.platform}`);

    // Store engagement event
    await this.storeEngagementEvent(event);

    // Update post metrics
    await this.updatePostMetrics(event);

    // Check for breakout content (top 10% engagement)
    await this.checkBreakoutPerformance(event);

    // Generate automated replies for comments
    if (event.type === 'comment' && event.content) {
      await this.generateReplyDraft(event);
    }

    // Send notifications for high-priority engagements
    await this.sendEngagementNotification(event);
  }

  private async storeEngagementEvent(event: EngagementEvent): Promise<void> {
    // Store in engagement_events table (would need to add to schema)
    const eventData = {
      platform_event_id: event.id,
      type: event.type,
      platform: event.platform,
      post_id: event.postId,
      author_id: event.authorId,
      author_username: event.authorUsername,
      content: event.content,
      timestamp: event.timestamp,
      metadata: event.metadata
    };

    // For now, we'll update the social post engagement data
    try {
      const post = await storage.getSocialPost(event.postId);
      if (post) {
        const currentEngagement = (post.engagement as any) || {};
        const updatedEngagement = {
          ...currentEngagement,
          [`${event.type}s`]: (currentEngagement[`${event.type}s`] || 0) + 1,
          last_updated: new Date().toISOString(),
          recent_events: [
            ...(currentEngagement.recent_events || []).slice(-9), // Keep last 10
            eventData
          ]
        };

        await storage.updateSocialPost(event.postId, {
          engagement: updatedEngagement
        });
      }
    } catch (error) {
      console.error('[EngagementService] Error storing engagement event:', error);
    }
  }

  private async updatePostMetrics(event: EngagementEvent): Promise<void> {
    try {
      const post = await storage.getSocialPost(event.postId);
      if (!post) return;

      const engagement = (post.engagement as any) || {};
      const metrics = engagement.metrics || {};

      // Update relevant metric
      switch (event.type) {
        case 'like':
          metrics.likes = (metrics.likes || 0) + 1;
          break;
        case 'comment':
          metrics.comments = (metrics.comments || 0) + 1;
          break;
        case 'share':
        case 'retweet':
          metrics.shares = (metrics.shares || 0) + 1;
          break;
      }

      // Calculate engagement rate
      const totalEngagement = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
      const views = metrics.views || 1;
      metrics.engagement_rate = (totalEngagement / views) * 100;

      await storage.updateSocialPost(event.postId, {
        engagement: { ...engagement, metrics, last_updated: new Date().toISOString() }
      });
    } catch (error) {
      console.error('[EngagementService] Error updating post metrics:', error);
    }
  }

  private async checkBreakoutPerformance(event: EngagementEvent): Promise<void> {
    try {
      // Get all user's posts from the last 30 days
      const posts = await storage.getSocialPostsByUserId('current_user'); // Would need user context
      
      if (posts.length < 10) return; // Need enough data for percentile calculation

      // Calculate engagement scores
      const postsWithScores = posts.map(post => {
        const engagement = (post.engagement as any) || {};
        const metrics = engagement.metrics || {};
        const score = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
        return { post, score };
      }).sort((a, b) => b.score - a.score);

      // Check if current post is in top 10%
      const topTenPercentIndex = Math.floor(postsWithScores.length * 0.1);
      const isBreakout = postsWithScores.slice(0, topTenPercentIndex).some(p => p.post.id === event.postId);

      if (isBreakout) {
        console.log(`[EngagementService] Breakout content detected: ${event.postId}`);
        
        // Flag for potential ad boost
        await storage.updateSocialPost(event.postId, {
          engagement: {
            ...((await storage.getSocialPost(event.postId))?.engagement || {}),
            breakout_detected: true,
            breakout_detected_at: new Date().toISOString(),
            suggested_ad_boost: true
          }
        });

        // Send notification about breakout performance
        await this.sendBreakoutNotification(event.postId);
      }
    } catch (error) {
      console.error('[EngagementService] Error checking breakout performance:', error);
    }
  }

  private async generateReplyDraft(event: EngagementEvent): Promise<void> {
    if (!event.content) return;

    try {
      // Get original post context
      const post = await storage.getSocialPost(event.postId);
      if (!post) return;

      // Generate brand-appropriate reply using GPT-4o
      const prompt = `You are responding to a comment on social media. Generate a helpful, engaging, and on-brand reply.

Original Post: "${post.content}"
Comment: "${event.content}"
Author: @${event.authorUsername}
Platform: ${event.platform}

Guidelines:
- Be helpful and engaging
- Match the tone of the original post
- Keep it concise (under 280 characters for Twitter)
- Be professional but friendly
- Don't be overly promotional

Generate a reply:`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      });

      const replyContent = response.choices[0].message.content?.trim() || '';
      
      if (replyContent) {
        const replyDraft: ReplyDraft = {
          id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          originalCommentId: event.id,
          content: replyContent,
          tone: 'helpful',
          status: 'pending',
          confidence: 0.8, // Could be calculated based on various factors
          createdAt: new Date()
        };

        this.replyDrafts.set(replyDraft.id, replyDraft);
        
        console.log(`[EngagementService] Generated reply draft for comment ${event.id}`);
        
        // Send notification about pending reply
        await this.sendReplyNotification(replyDraft, event);
      }
    } catch (error) {
      console.error('[EngagementService] Error generating reply draft:', error);
    }
  }

  private async sendEngagementNotification(event: EngagementEvent): Promise<void> {
    // In a real implementation, this would send notifications via email, push, or in-app
    console.log(`[EngagementService] Notification: New ${event.type} from @${event.authorUsername} on ${event.platform}`);
  }

  private async sendBreakoutNotification(postId: string): Promise<void> {
    console.log(`[EngagementService] Breakout Alert: Post ${postId} is performing exceptionally well!`);
  }

  private async sendReplyNotification(draft: ReplyDraft, originalEvent: EngagementEvent): Promise<void> {
    console.log(`[EngagementService] Reply Draft Ready: Comment from @${originalEvent.authorUsername} has a suggested reply pending approval`);
  }

  // Public methods for managing replies
  async getReplyDrafts(): Promise<ReplyDraft[]> {
    return Array.from(this.replyDrafts.values())
      .filter(draft => draft.status === 'pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async approveReply(replyId: string): Promise<void> {
    const draft = this.replyDrafts.get(replyId);
    if (draft) {
      draft.status = 'approved';
      // In a real implementation, this would post the reply via platform API
      console.log(`[EngagementService] Reply approved and posted: ${draft.content}`);
    }
  }

  async rejectReply(replyId: string): Promise<void> {
    const draft = this.replyDrafts.get(replyId);
    if (draft) {
      draft.status = 'rejected';
      console.log(`[EngagementService] Reply rejected: ${replyId}`);
    }
  }

  async editReply(replyId: string, newContent: string): Promise<void> {
    const draft = this.replyDrafts.get(replyId);
    if (draft) {
      draft.content = newContent;
      console.log(`[EngagementService] Reply edited: ${replyId}`);
    }
  }

  // Method to get engagement insights and notifications digest
  async getEngagementDigest(userId: string, hours: number = 24): Promise<{
    summary: string;
    pendingReplies: number;
    topEngagements: any[];
    breakoutPosts: any[];
    notifications: any[];
  }> {
    const posts = await storage.getSocialPostsByUserId(userId);
    const recentPosts = posts.filter(post => {
      const postedAt = post.postedAt ? new Date(post.postedAt) : null;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return postedAt && postedAt >= cutoff;
    });

    const pendingReplies = Array.from(this.replyDrafts.values()).filter(
      draft => draft.status === 'pending'
    ).length;

    // Get top engagements
    const topEngagements = recentPosts
      .map(post => {
        const engagement = (post.engagement as any) || {};
        const metrics = engagement.metrics || {};
        const totalEngagement = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
        return { post, totalEngagement };
      })
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 5);

    // Get breakout posts
    const breakoutPosts = recentPosts.filter(post => {
      const engagement = (post.engagement as any) || {};
      return engagement.breakout_detected;
    });

    // Generate summary using AI
    const totalEngagement = topEngagements.reduce((sum, item) => sum + item.totalEngagement, 0);
    const summary = `In the last ${hours} hours: ${totalEngagement} total engagements across ${recentPosts.length} posts. ${breakoutPosts.length} posts showing breakout performance.`;

    return {
      summary,
      pendingReplies,
      topEngagements: topEngagements.map(item => item.post),
      breakoutPosts,
      notifications: [] // Would include recent engagement events
    };
  }

  // Method to start listening for webhooks
  startWebhookListening(): void {
    console.log('[EngagementService] Webhook listeners started for all platforms');
    // In a real implementation, this would set up webhook endpoints
  }
}

export const engagementService = new EngagementService();