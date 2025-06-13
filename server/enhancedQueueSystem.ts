import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { billingService } from './billingService';

// Enhanced Redis connection with proper configuration
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
  db: 0,
});

// Enhanced queue configuration with retry and dead letter policies
const defaultJobOptions = {
  removeOnComplete: 50,  // Keep last 50 completed jobs
  removeOnFail: 100,     // Keep last 100 failed jobs
  attempts: 3,           // Retry failed jobs 3 times
  backoff: {
    type: 'exponential' as const,
    delay: 2000,         // Start with 2 second delay
  },
  delay: 0,              // No initial delay
};

// Dead letter queue configuration
const deadLetterOptions = {
  removeOnComplete: 10,
  removeOnFail: 500,     // Keep more failed jobs for analysis
  attempts: 1,           // Don't retry dead letter jobs
};

export class EnhancedQueueSystem {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private deadLetterQueue: Queue;
  private rateLimiters: Map<string, IORedis> = new Map();

  constructor() {
    // Initialize dead letter queue
    this.deadLetterQueue = new Queue('dead-letter', {
      connection,
      defaultJobOptions: deadLetterOptions
    });

    this.setupGlobalEventHandlers();
    this.startRateLimitCleanup();
  }

  private setupGlobalEventHandlers() {
    connection.on('connect', () => {
      console.log('[QueueSystem] Redis connected successfully');
    });

    connection.on('error', (error) => {
      console.error('[QueueSystem] Redis connection error:', error);
    });

    connection.on('reconnecting', () => {
      console.log('[QueueSystem] Redis reconnecting...');
    });
  }

  async createQueue(name: string, options: any = {}): Promise<Queue> {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        ...options.jobOptions
      }
    });

    // Set up queue events for monitoring
    const queueEvents = new QueueEvents(name, { connection });
    
    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      console.log(`[QueueSystem] Job ${jobId} completed in queue ${name}`, {
        queue: name,
        jobId,
        result: returnvalue
      });
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`[QueueSystem] Job ${jobId} failed in queue ${name}:`, {
        queue: name,
        jobId,
        error: failedReason
      });
    });

    queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[QueueSystem] Job ${jobId} stalled in queue ${name}`, {
        queue: name,
        jobId
      });
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, queueEvents);

    console.log(`[QueueSystem] Created queue: ${name}`);
    return queue;
  }

  async createWorker(queueName: string, processor: (job: Job) => Promise<any>, options: any = {}): Promise<Worker> {
    const workerKey = `${queueName}-worker`;
    
    if (this.workers.has(workerKey)) {
      return this.workers.get(workerKey)!;
    }

    const worker = new Worker(queueName, async (job: Job) => {
      try {
        console.log(`[QueueSystem] Processing job ${job.id} in queue ${queueName}`, {
          queue: queueName,
          jobId: job.id,
          jobData: job.data
        });

        // Record API usage for billing
        if (job.data.userId) {
          await billingService.recordUsage(job.data.userId, 'apiCalls', 1);
        }

        const result = await processor(job);
        
        console.log(`[QueueSystem] Job ${job.id} completed successfully`, {
          queue: queueName,
          jobId: job.id,
          processingTime: Date.now() - job.processedOn!
        });

        return result;
      } catch (error) {
        console.error(`[QueueSystem] Job ${job.id} failed:`, {
          queue: queueName,
          jobId: job.id,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });

        // Move to dead letter queue if this is the final attempt
        if (job.attemptsMade >= (job.opts.attempts || 3)) {
          await this.moveToDeadLetter(job, error);
        }

        throw error;
      }
    }, {
      connection,
      concurrency: options.concurrency || 5,
      limiter: {
        max: options.rateLimitMax || 100,
        duration: options.rateLimitDuration || 60000, // 1 minute
      },
      ...options
    });

    // Set up worker event handlers
    worker.on('completed', (job, result) => {
      console.log(`[QueueSystem] Worker completed job ${job.id}`, {
        queue: queueName,
        jobId: job.id,
        result
      });
    });

    worker.on('failed', (job, error) => {
      console.error(`[QueueSystem] Worker failed job ${job?.id}:`, {
        queue: queueName,
        jobId: job?.id,
        error: error.message
      });
    });

    worker.on('error', (error) => {
      console.error(`[QueueSystem] Worker error in queue ${queueName}:`, error);
    });

    this.workers.set(workerKey, worker);
    console.log(`[QueueSystem] Created worker for queue: ${queueName}`);
    
    return worker;
  }

  private async moveToDeadLetter(job: Job, error: any): Promise<void> {
    try {
      await this.deadLetterQueue.add('failed-job', {
        originalQueue: job.queueName,
        originalJobId: job.id,
        originalData: job.data,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade
      });

      console.log(`[QueueSystem] Moved job ${job.id} to dead letter queue`, {
        originalQueue: job.queueName,
        jobId: job.id,
        error: error instanceof Error ? error.message : error
      });
    } catch (deadLetterError) {
      console.error(`[QueueSystem] Failed to move job to dead letter queue:`, deadLetterError);
    }
  }

  // Redis-based rate limiting
  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const rateLimiter = this.getRateLimiter();
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      const current = await rateLimiter.incr(redisKey);
      
      if (current === 1) {
        await rateLimiter.expire(redisKey, Math.ceil(windowMs / 1000));
      }

      const remaining = Math.max(0, limit - current);
      const resetTime = (window + 1) * windowMs;

      return {
        allowed: current <= limit,
        remaining,
        resetTime
      };
    } catch (error) {
      console.error('[QueueSystem] Rate limit check failed:', error);
      return { allowed: true, remaining: limit, resetTime: now + windowMs };
    }
  }

  private getRateLimiter(): IORedis {
    if (!this.rateLimiters.has('default')) {
      this.rateLimiters.set('default', new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 1, // Use separate database for rate limiting
      }));
    }
    return this.rateLimiters.get('default')!;
  }

  private startRateLimitCleanup() {
    // Clean up expired rate limit keys every hour
    setInterval(async () => {
      try {
        const rateLimiter = this.getRateLimiter();
        const keys = await rateLimiter.keys('rate_limit:*');
        
        if (keys.length > 0) {
          // Check which keys are expired and remove them
          const pipeline = rateLimiter.pipeline();
          keys.forEach(key => pipeline.ttl(key));
          const results = await pipeline.exec();
          
          const expiredKeys = keys.filter((_, index) => 
            results && results[index] && results[index][1] === -1
          );
          
          if (expiredKeys.length > 0) {
            await rateLimiter.del(...expiredKeys);
            console.log(`[QueueSystem] Cleaned up ${expiredKeys.length} expired rate limit keys`);
          }
        }
      } catch (error) {
        console.error('[QueueSystem] Rate limit cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  // Enhanced job scheduling with priority and delay
  async addJob(queueName: string, jobName: string, data: any, options: any = {}): Promise<Job> {
    const queue = await this.createQueue(queueName);
    
    // Check rate limits if specified
    if (options.rateLimitKey) {
      const rateCheck = await this.checkRateLimit(
        options.rateLimitKey,
        options.rateLimitMax || 60,
        options.rateLimitWindow || 60000
      );
      
      if (!rateCheck.allowed) {
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)} seconds`);
      }
    }

    const jobOptions = {
      priority: options.priority || 0,
      delay: options.delay || 0,
      removeOnComplete: options.removeOnComplete || 50,
      removeOnFail: options.removeOnFail || 100,
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000,
      },
      ...options
    };

    const job = await queue.add(jobName, data, jobOptions);
    
    console.log(`[QueueSystem] Added job ${job.id} to queue ${queueName}`, {
      queue: queueName,
      jobId: job.id,
      jobName,
      priority: jobOptions.priority,
      delay: jobOptions.delay
    });

    return job;
  }

  // Get queue metrics and statistics
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: await queue.isPaused()
    };
  }

  // Get dead letter queue statistics
  async getDeadLetterStats(): Promise<{
    total: number;
    byQueue: Record<string, number>;
    recent: any[];
  }> {
    const failed = await this.deadLetterQueue.getFailed();
    const byQueue: Record<string, number> = {};
    
    failed.forEach(job => {
      const originalQueue = job.data.originalQueue;
      byQueue[originalQueue] = (byQueue[originalQueue] || 0) + 1;
    });

    return {
      total: failed.length,
      byQueue,
      recent: failed.slice(0, 10).map(job => ({
        id: job.id,
        originalQueue: job.data.originalQueue,
        originalJobId: job.data.originalJobId,
        error: job.data.error,
        failedAt: job.data.failedAt
      }))
    };
  }

  // Retry jobs from dead letter queue
  async retryDeadLetterJob(jobId: string): Promise<void> {
    const job = await this.deadLetterQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Dead letter job ${jobId} not found`);
    }

    const { originalQueue, originalData } = job.data;
    const queue = await this.createQueue(originalQueue);
    
    await queue.add('retried-job', originalData, {
      attempts: 1, // Single retry attempt
      removeOnComplete: true
    });

    await job.remove();
    console.log(`[QueueSystem] Retried dead letter job ${jobId} in queue ${originalQueue}`);
  }

  // Clean shutdown
  async shutdown(): Promise<void> {
    console.log('[QueueSystem] Shutting down...');

    // Close all workers
    const workerPromises = Array.from(this.workers.values()).map(worker => worker.close());
    await Promise.all(workerPromises);

    // Close all queue events
    const eventPromises = Array.from(this.queueEvents.values()).map(events => events.close());
    await Promise.all(eventPromises);

    // Close rate limiters
    const rateLimiterPromises = Array.from(this.rateLimiters.values()).map(redis => redis.quit());
    await Promise.all(rateLimiterPromises);

    // Close main connection
    await connection.quit();

    console.log('[QueueSystem] Shutdown complete');
  }
}

export const enhancedQueueSystem = new EnhancedQueueSystem();