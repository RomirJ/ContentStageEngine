import { storage } from "./storage";
import { SocialPost, SocialAccount } from "@shared/schema";

interface PlatformAPI {
  post(account: SocialAccount, content: string): Promise<{ id: string; engagement?: any }>;
  refreshToken(account: SocialAccount): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }>;
}

class TwitterAPI implements PlatformAPI {
  async post(account: SocialAccount, content: string) {
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
      throw new Error('Twitter API credentials not configured');
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: content.substring(0, 280) // Twitter character limit
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${error.detail || response.statusText}`);
    }

    const result = await response.json();
    return {
      id: result.data.id,
      engagement: {
        platform_post_id: result.data.id,
        posted_at: new Date().toISOString()
      }
    };
  }

  async refreshToken(account: SocialAccount) {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken || ''
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Twitter token');
    }

    const tokens = await response.json();
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    };
  }
}

class LinkedInAPI implements PlatformAPI {
  async post(account: SocialAccount, content: string) {
    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        author: `urn:li:person:${account.accountId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`LinkedIn API error: ${error.message || response.statusText}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      engagement: {
        platform_post_id: result.id,
        posted_at: new Date().toISOString()
      }
    };
  }

  async refreshToken(account: SocialAccount) {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken || '',
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || ''
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh LinkedIn token');
    }

    const tokens = await response.json();
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    };
  }
}

class InstagramAPI implements PlatformAPI {
  async post(account: SocialAccount, content: string) {
    // Instagram requires media content - for text posts we'd need Instagram Business API
    const response = await fetch(`https://graph.facebook.com/v18.0/${account.accountId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caption: content,
        media_type: 'TEXT' // This would typically be IMAGE or VIDEO
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Instagram API error: ${error.error?.message || response.statusText}`);
    }

    const media = await response.json();
    
    // Publish the media
    const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${account.accountId}/media_publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creation_id: media.id
      })
    });

    if (!publishResponse.ok) {
      throw new Error('Failed to publish Instagram post');
    }

    const result = await publishResponse.json();
    return {
      id: result.id,
      engagement: {
        platform_post_id: result.id,
        posted_at: new Date().toISOString()
      }
    };
  }

  async refreshToken(account: SocialAccount) {
    const response = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_CLIENT_ID || '',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET || '',
        fb_exchange_token: account.accessToken || ''
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Instagram token');
    }

    const tokens = await response.json();
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    };
  }
}

const platformAPIs: Record<string, PlatformAPI> = {
  twitter: new TwitterAPI(),
  linkedin: new LinkedInAPI(),
  instagram: new InstagramAPI(),
};

export class PostingService {
  private processingQueue = new Set<string>();

  async processScheduledPosts() {
    const now = new Date();
    console.log(`[PostingService] Checking for posts to publish at ${now.toISOString()}`);

    try {
      // Get all scheduled posts that are ready to be published
      const scheduledPosts = await this.getPostsReadyForPublishing(now);
      
      console.log(`[PostingService] Found ${scheduledPosts.length} posts ready for publishing`);

      for (const post of scheduledPosts) {
        if (this.processingQueue.has(post.id)) {
          console.log(`[PostingService] Post ${post.id} already being processed, skipping`);
          continue;
        }

        this.processingQueue.add(post.id);
        
        try {
          await this.publishPost(post);
          console.log(`[PostingService] Successfully published post ${post.id} to ${post.platform}`);
        } catch (error) {
          console.error(`[PostingService] Failed to publish post ${post.id}:`, error);
          await this.handlePublishingError(post, error as Error);
        } finally {
          this.processingQueue.delete(post.id);
        }
      }
    } catch (error) {
      console.error('[PostingService] Error processing scheduled posts:', error);
    }
  }

  private async getPostsReadyForPublishing(now: Date): Promise<SocialPost[]> {
    // Get all users' scheduled posts that are ready
    const allUsers = await storage.getAllUsers();
    const readyPosts: SocialPost[] = [];

    for (const user of allUsers) {
      const scheduledPosts = await storage.getScheduledPostsByUserId(user.id);
      
      for (const post of scheduledPosts) {
        if (post.status === 'scheduled' && 
            post.scheduledFor && 
            new Date(post.scheduledFor) <= now) {
          // Get the full social post data
          const fullPost = await storage.getSocialPost(post.id);
          if (fullPost) {
            readyPosts.push(fullPost);
          }
        }
      }
    }

    return readyPosts;
  }

  private async publishPost(post: SocialPost) {
    // Get the user's social account for this platform
    const accounts = await storage.getSocialAccountsByPlatform(post.platform);
    const account = accounts.find(acc => acc.isActive);

    if (!account) {
      throw new Error(`No active ${post.platform} account found`);
    }

    // Check if token is expired and refresh if needed
    if (account.expiresAt && new Date(account.expiresAt) <= new Date()) {
      console.log(`[PostingService] Refreshing expired token for ${post.platform} account ${account.id}`);
      await this.refreshAccountToken(account);
    }

    // Get the platform API
    const platformAPI = platformAPIs[post.platform];
    if (!platformAPI) {
      throw new Error(`Platform ${post.platform} not supported for automated posting`);
    }

    // Update post status to 'posting'
    await storage.updateSocialPostStatus(post.id, 'posting');

    try {
      // Publish the post
      const result = await platformAPI.post(account, post.content);

      // Update post with success status and engagement data
      await storage.updateSocialPost(post.id, {
        status: 'posted',
        postedAt: new Date(),
        engagement: result.engagement
      });

      return result;
    } catch (error) {
      // Update post status to 'failed'
      await storage.updateSocialPostStatus(post.id, 'failed');
      throw error;
    }
  }

  private async refreshAccountToken(account: SocialAccount) {
    const platformAPI = platformAPIs[account.platform];
    if (!platformAPI) {
      throw new Error(`Platform ${account.platform} not supported for token refresh`);
    }

    const newTokens = await platformAPI.refreshToken(account);
    await storage.updateSocialAccountToken(account.id, {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: newTokens.expiresAt
    });
  }

  private async handlePublishingError(post: SocialPost, error: Error) {
    console.error(`[PostingService] Publishing error for post ${post.id}:`, error.message);

    // Store error information
    await storage.updateSocialPost(post.id, {
      status: 'failed',
      engagement: {
        error: error.message,
        failed_at: new Date().toISOString()
      }
    });

    // You could implement retry logic here
    // For now, we'll just log the error and mark as failed
  }

  // Method to manually trigger posting for a specific post
  async publishPostById(postId: string) {
    const post = await storage.getSocialPost(postId);
    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    return await this.publishPost(post);
  }

  // Method to start the automated posting scheduler
  startScheduler(intervalMinutes: number = 5) {
    console.log(`[PostingService] Starting scheduler with ${intervalMinutes} minute intervals`);
    
    // Run immediately
    this.processScheduledPosts();
    
    // Then run at intervals
    setInterval(() => {
      this.processScheduledPosts();
    }, intervalMinutes * 60 * 1000);
  }
}

export const postingService = new PostingService();