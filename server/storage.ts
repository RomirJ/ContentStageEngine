import {
  users,
  uploads,
  transcripts,
  segments,
  clips,
  socialAccounts,
  socialPosts,
  scheduledPosts,
  type User,
  type UpsertUser,
  type Upload,
  type InsertUpload,
  type Transcript,
  type InsertTranscript,
  type Segment,
  type InsertSegment,
  type Clip,
  type InsertClip,
  type SocialAccount,
  type SocialPost,
  type InsertSocialPost,
  type ScheduledPost,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray, isNotNull } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Upload operations
  createUpload(upload: InsertUpload): Promise<Upload>;
  getUpload(id: string): Promise<Upload | undefined>;
  getUserUploads(userId: string): Promise<Upload[]>;
  updateUploadStatus(id: string, status: string): Promise<void>;
  
  // Transcript operations
  createTranscript(transcript: InsertTranscript): Promise<Transcript>;
  getTranscriptByUploadId(uploadId: string): Promise<Transcript | undefined>;
  
  // Segment operations
  createSegments(segments: InsertSegment[]): Promise<Segment[]>;
  getSegmentsByUploadId(uploadId: string): Promise<Segment[]>;
  
  // Clip operations
  createClip(clip: InsertClip): Promise<Clip>;
  getClipsBySegmentId(segmentId: string): Promise<Clip[]>;
  getClipsByUploadId(uploadId: string): Promise<Clip[]>;
  updateClipStatus(id: string, status: string): Promise<void>;
  
  // Social account operations
  getUserSocialAccounts(userId: string): Promise<SocialAccount[]>;
  getSocialAccount(id: string): Promise<SocialAccount | undefined>;
  createSocialAccount(account: any): Promise<SocialAccount>;
  updateSocialAccountStatus(id: string, isActive: boolean): Promise<void>;
  updateSocialAccountToken(id: string, tokenData: any): Promise<void>;
  deleteSocialAccount(id: string): Promise<void>;
  
  // Social post operations
  createSocialPost(socialPost: InsertSocialPost): Promise<SocialPost>;
  getSocialPostsBySegmentId(segmentId: string): Promise<SocialPost[]>;
  getSocialPostsByUploadId(uploadId: string): Promise<SocialPost[]>;
  getSocialPostsByUserId(userId: string, status?: string): Promise<SocialPost[]>;
  updateSocialPostStatus(id: string, status: string): Promise<void>;
  updateSocialPostSchedule(id: string, scheduledFor: string): Promise<void>;

  // Scheduled posts operations
  getScheduledPostsByUserId(userId: string): Promise<any[]>;

  // Analytics
  getUserStats(userId: string): Promise<{
    totalUploads: number;
    contentGenerated: number;
    postsScheduled: number;
    totalEngagement: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Upload operations
  async createUpload(upload: InsertUpload): Promise<Upload> {
    const [newUpload] = await db.insert(uploads).values(upload).returning();
    return newUpload;
  }

  async getUpload(id: string): Promise<Upload | undefined> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.id, id));
    return upload;
  }

  async getUserUploads(userId: string): Promise<Upload[]> {
    return await db
      .select()
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .orderBy(desc(uploads.createdAt));
  }

  async updateUploadStatus(id: string, status: string): Promise<void> {
    await db
      .update(uploads)
      .set({ status, updatedAt: new Date() })
      .where(eq(uploads.id, id));
  }

  // Transcript operations
  async createTranscript(transcript: InsertTranscript): Promise<Transcript> {
    const [newTranscript] = await db.insert(transcripts).values(transcript).returning();
    return newTranscript;
  }

  async getTranscriptByUploadId(uploadId: string): Promise<Transcript | undefined> {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.uploadId, uploadId));
    return transcript;
  }

  // Segment operations
  async createSegments(segmentList: InsertSegment[]): Promise<Segment[]> {
    return await db.insert(segments).values(segmentList).returning();
  }

  async getSegmentsByUploadId(uploadId: string): Promise<Segment[]> {
    return await db
      .select()
      .from(segments)
      .where(eq(segments.uploadId, uploadId))
      .orderBy(segments.order);
  }

  // Clip operations
  async createClip(clip: InsertClip): Promise<Clip> {
    const [newClip] = await db.insert(clips).values(clip).returning();
    return newClip;
  }

  async getClipsBySegmentId(segmentId: string): Promise<Clip[]> {
    return await db.select().from(clips).where(eq(clips.segmentId, segmentId));
  }

  async getClipsByUploadId(uploadId: string): Promise<Clip[]> {
    return await db
      .select({
        id: clips.id,
        segmentId: clips.segmentId,
        type: clips.type,
        filePath: clips.filePath,
        content: clips.content,
        metadata: clips.metadata,
        status: clips.status,
        createdAt: clips.createdAt,
      })
      .from(clips)
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .where(eq(segments.uploadId, uploadId));
  }

  async updateClipStatus(id: string, status: string): Promise<void> {
    await db.update(clips).set({ status }).where(eq(clips.id, id));
  }

  // Social account operations
  async getUserSocialAccounts(userId: string): Promise<SocialAccount[]> {
    return await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));
  }

  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, id));
    return account;
  }

  // Analytics
  async getUserStats(userId: string): Promise<{
    totalUploads: number;
    contentGenerated: number;
    postsScheduled: number;
    totalEngagement: number;
  }> {
    // Get total uploads
    const totalUploadsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(uploads)
      .where(eq(uploads.userId, userId));

    // Get content generated (clips)
    const contentGeneratedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clips)
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .innerJoin(uploads, eq(segments.uploadId, uploads.id))
      .where(eq(uploads.userId, userId));

    // Get posts scheduled
    const postsScheduledResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledPosts)
      .innerJoin(clips, eq(scheduledPosts.clipId, clips.id))
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .innerJoin(uploads, eq(segments.uploadId, uploads.id))
      .where(eq(uploads.userId, userId));

    return {
      totalUploads: totalUploadsResult[0]?.count || 0,
      contentGenerated: contentGeneratedResult[0]?.count || 0,
      postsScheduled: postsScheduledResult[0]?.count || 0,
      totalEngagement: 0, // Placeholder for now
    };
  }

  // Social post operations
  async createSocialPost(socialPostData: InsertSocialPost): Promise<SocialPost> {
    const [socialPost] = await db
      .insert(socialPosts)
      .values(socialPostData)
      .returning();
    return socialPost;
  }

  async getSocialPostsBySegmentId(segmentId: string): Promise<SocialPost[]> {
    return await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.segmentId, segmentId))
      .orderBy(desc(socialPosts.createdAt));
  }

  async getSocialPostsByUploadId(uploadId: string): Promise<SocialPost[]> {
    const results = await db
      .select({
        id: socialPosts.id,
        segmentId: socialPosts.segmentId,
        platform: socialPosts.platform,
        content: socialPosts.content,
        scheduledFor: socialPosts.scheduledFor,
        postedAt: socialPosts.postedAt,
        status: socialPosts.status,
        engagement: socialPosts.engagement,
        createdAt: socialPosts.createdAt,
        updatedAt: socialPosts.updatedAt,
      })
      .from(socialPosts)
      .innerJoin(segments, eq(socialPosts.segmentId, segments.id))
      .where(eq(segments.uploadId, uploadId))
      .orderBy(desc(socialPosts.createdAt));
    
    return results;
  }

  async updateSocialPostStatus(id: string, status: string): Promise<void> {
    await db
      .update(socialPosts)
      .set({ status, updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
  }

  async updateSocialPostSchedule(id: string, scheduledFor: string): Promise<void> {
    await db
      .update(socialPosts)
      .set({ 
        scheduledFor: new Date(scheduledFor),
        status: 'scheduled',
        updatedAt: new Date() 
      })
      .where(eq(socialPosts.id, id));
  }

  async getSocialPostsByUserId(userId: string, status?: string): Promise<SocialPost[]> {
    const uploads = await this.getUserUploads(userId);
    
    if (uploads.length === 0) return [];
    
    // Get all social posts for this user's uploads
    let allPosts: SocialPost[] = [];
    for (const upload of uploads) {
      const posts = await this.getSocialPostsByUploadId(upload.id);
      allPosts.push(...posts);
    }
    
    // Filter by status if provided
    if (status) {
      allPosts = allPosts.filter(post => post.status === status);
    }
    
    return allPosts;
  }

  async getScheduledPostsByUserId(userId: string): Promise<any[]> {
    const uploads = await this.getUserUploads(userId);
    
    if (uploads.length === 0) return [];
    
    let allScheduledPosts: any[] = [];
    
    for (const upload of uploads) {
      const segments = await this.getSegmentsByUploadId(upload.id);
      for (const segment of segments) {
        const posts = await this.getSocialPostsBySegmentId(segment.id);
        const scheduledPosts = posts
          .filter(post => post.scheduledFor)
          .map(post => ({
            id: post.id,
            content: post.content,
            platform: post.platform,
            scheduledFor: post.scheduledFor,
            status: post.status,
            segmentTitle: segment.title,
          }));
        allScheduledPosts.push(...scheduledPosts);
      }
    }
    
    return allScheduledPosts.sort((a, b) => 
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );
  }

  async createSocialAccount(accountData: any): Promise<SocialAccount> {
    const [account] = await db
      .insert(socialAccounts)
      .values(accountData)
      .returning();
    return account;
  }

  async updateSocialAccountStatus(id: string, isActive: boolean): Promise<void> {
    await db
      .update(socialAccounts)
      .set({ isActive })
      .where(eq(socialAccounts.id, id));
  }

  async updateSocialAccountToken(id: string, tokenData: any): Promise<void> {
    await db
      .update(socialAccounts)
      .set(tokenData)
      .where(eq(socialAccounts.id, id));
  }

  async deleteSocialAccount(id: string): Promise<void> {
    await db
      .delete(socialAccounts)
      .where(eq(socialAccounts.id, id));
  }
}

export const storage = new DatabaseStorage();
