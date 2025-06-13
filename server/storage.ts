import {
  users,
  uploads,
  transcripts,
  segments,
  clips,
  socialAccounts,
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
  type ScheduledPost,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
