import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { SocialPost } from '@shared/schema';

// Redis connection
const redis = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

interface PlatformJobData {
  postId: string;
  platform: string;
  content: SocialPost;
  mediaUrls?: string[];
  scheduledTime?: Date;
  retryCount?: number;
}

interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// Platform-specific queue configuration
const queueConfig = {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
  connection: redis,
};

// Create platform-specific queues
export const platformQueues = {
  youtube: new Queue('post_youtube', queueConfig),
  tiktok: new Queue('post_tiktok', queueConfig),
  twitter: new Queue('post_x', queueConfig),
  instagram: new Queue('post_instagram', queueConfig),
  linkedin: new Queue('post_linkedin', queueConfig),
  facebook: new Queue('post_facebook', queueConfig),
};

export class QueueManager {
  private workers: Map<string, Worker> = new Map();

  constructor() {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    // YouTube worker
    const youtubeWorker = new Worker('post_youtube', async (job: Job<PlatformJobData>) => {
      return this.processYouTubePost(job.data);
    }, { connection: redis });

    // TikTok worker
    const tiktokWorker = new Worker('post_tiktok', async (job: Job<PlatformJobData>) => {
      return this.processTikTokPost(job.data);
    }, { connection: redis });

    // Twitter/X worker
    const twitterWorker = new Worker('post_x', async (job: Job<PlatformJobData>) => {
      return this.processTwitterPost(job.data);
    }, { connection: redis });

    // Instagram worker
    const instagramWorker = new Worker('post_instagram', async (job: Job<PlatformJobData>) => {
      return this.processInstagramPost(job.data);
    }, { connection: redis });

    // LinkedIn worker
    const linkedinWorker = new Worker('post_linkedin', async (job: Job<PlatformJobData>) => {
      return this.processLinkedInPost(job.data);
    }, { connection: redis });

    // Facebook worker
    const facebookWorker = new Worker('post_facebook', async (job: Job<PlatformJobData>) => {
      return this.processFacebookPost(job.data);
    }, { connection: redis });

    // Store workers for cleanup
    this.workers.set('youtube', youtubeWorker);
    this.workers.set('tiktok', tiktokWorker);
    this.workers.set('twitter', twitterWorker);
    this.workers.set('instagram', instagramWorker);
    this.workers.set('linkedin', linkedinWorker);
    this.workers.set('facebook', facebookWorker);

    // Set up error handling for all workers
    this.workers.forEach((worker, platform) => {
      worker.on('completed', (job) => {
        console.log(`[QueueManager] ${platform} job ${job.id} completed successfully`);
      });

      worker.on('failed', (job, err) => {
        console.error(`[QueueManager] ${platform} job ${job?.id} failed:`, err);
      });

      worker.on('error', (err) => {
        console.error(`[QueueManager] ${platform} worker error:`, err);
      });
    });

    console.log('[QueueManager] All platform workers initialized');
  }

  async schedulePost(
    platform: string,
    postData: PlatformJobData,
    scheduledTime?: Date
  ): Promise<string> {
    const queue = platformQueues[platform as keyof typeof platformQueues];
    if (!queue) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const jobOptions: any = {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
    };

    // Schedule for future if scheduledTime provided
    if (scheduledTime) {
      const delay = scheduledTime.getTime() - Date.now();
      if (delay > 0) {
        jobOptions.delay = delay;
      }
    }

    const job = await queue.add(`${platform}_post`, postData, jobOptions);
    
    console.log(`[QueueManager] Scheduled ${platform} post with job ID: ${job.id}`);
    return job.id!;
  }

  async getQueueMetrics(platform: string): Promise<QueueMetrics> {
    const queue = platformQueues[platform as keyof typeof platformQueues];
    if (!queue) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    const delayed = await queue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async getAllQueueMetrics(): Promise<Record<string, QueueMetrics>> {
    const metrics: Record<string, QueueMetrics> = {};
    
    for (const platform of Object.keys(platformQueues)) {
      metrics[platform] = await this.getQueueMetrics(platform);
    }
    
    return metrics;
  }

  async cancelJob(platform: string, jobId: string): Promise<boolean> {
    const queue = platformQueues[platform as keyof typeof platformQueues];
    if (!queue) {
      return false;
    }

    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[QueueManager] Error canceling job ${jobId}:`, error);
      return false;
    }
  }

  async retryFailedJob(platform: string, jobId: string): Promise<boolean> {
    const queue = platformQueues[platform as keyof typeof platformQueues];
    if (!queue) {
      return false;
    }

    try {
      const job = await queue.getJob(jobId);
      if (job && (await job.getState()) === 'failed') {
        await job.retry();
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[QueueManager] Error retrying job ${jobId}:`, error);
      return false;
    }
  }

  // Platform-specific posting implementations
  private async processYouTubePost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing YouTube post: ${data.postId}`);
    
    try {
      // Implement YouTube Resumable Upload
      const uploadResult = await this.youtubeResumableUpload(data);
      
      // Update post status in database
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] YouTube post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processTikTokPost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing TikTok post: ${data.postId}`);
    
    try {
      // Implement TikTok multipart upload
      const uploadResult = await this.tiktokMultipartUpload(data);
      
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] TikTok post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processTwitterPost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing Twitter/X post: ${data.postId}`);
    
    try {
      // Implement Twitter v2 API with chunked media upload
      const uploadResult = await this.twitterChunkedUpload(data);
      
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] Twitter post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processInstagramPost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing Instagram post: ${data.postId}`);
    
    try {
      // Implement Instagram Graph API
      const uploadResult = await this.instagramGraphUpload(data);
      
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] Instagram post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processLinkedInPost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing LinkedIn post: ${data.postId}`);
    
    try {
      // Implement LinkedIn API v2
      const uploadResult = await this.linkedinApiUpload(data);
      
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] LinkedIn post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processFacebookPost(data: PlatformJobData): Promise<any> {
    console.log(`[QueueManager] Processing Facebook post: ${data.postId}`);
    
    try {
      // Implement Facebook Graph API
      const uploadResult = await this.facebookGraphUpload(data);
      
      await this.updatePostStatus(data.postId, 'published', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('[QueueManager] Facebook post failed:', error);
      await this.updatePostStatus(data.postId, 'failed', { error: (error as Error).message });
      throw error;
    }
  }

  // Chunked upload implementations
  private async youtubeResumableUpload(data: PlatformJobData): Promise<any> {
    // Implement YouTube Resumable Upload protocol
    // This would use the YouTube Data API v3 with resumable upload
    console.log('[QueueManager] YouTube resumable upload simulation');
    return { videoId: `yt_${Date.now()}`, platform: 'youtube' };
  }

  private async tiktokMultipartUpload(data: PlatformJobData): Promise<any> {
    // Implement TikTok multipart upload
    console.log('[QueueManager] TikTok multipart upload simulation');
    return { videoId: `tt_${Date.now()}`, platform: 'tiktok' };
  }

  private async twitterChunkedUpload(data: PlatformJobData): Promise<any> {
    // Implement Twitter INIT/APPEND/FINALIZE upload flow
    console.log('[QueueManager] Twitter chunked upload simulation');
    return { tweetId: `tw_${Date.now()}`, platform: 'twitter' };
  }

  private async instagramGraphUpload(data: PlatformJobData): Promise<any> {
    // Implement Instagram Graph API upload
    console.log('[QueueManager] Instagram Graph API upload simulation');
    return { mediaId: `ig_${Date.now()}`, platform: 'instagram' };
  }

  private async linkedinApiUpload(data: PlatformJobData): Promise<any> {
    // Implement LinkedIn API v2 upload
    console.log('[QueueManager] LinkedIn API upload simulation');
    return { postId: `li_${Date.now()}`, platform: 'linkedin' };
  }

  private async facebookGraphUpload(data: PlatformJobData): Promise<any> {
    // Implement Facebook Graph API upload
    console.log('[QueueManager] Facebook Graph API upload simulation');
    return { postId: `fb_${Date.now()}`, platform: 'facebook' };
  }

  private async updatePostStatus(postId: string, status: string, result?: any): Promise<void> {
    // Update post status in database
    console.log(`[QueueManager] Updating post ${postId} status to ${status}`);
    // This would integrate with your storage system
  }

  async cleanup(): Promise<void> {
    console.log('[QueueManager] Shutting down workers...');
    
    for (const [platform, worker] of this.workers) {
      try {
        await worker.close();
        console.log(`[QueueManager] ${platform} worker shut down`);
      } catch (error) {
        console.error(`[QueueManager] Error shutting down ${platform} worker:`, error);
      }
    }
    
    await redis.quit();
    console.log('[QueueManager] Queue system cleanup complete');
  }
}

export const queueManager = new QueueManager();