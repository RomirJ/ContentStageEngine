import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uuid,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Core AutoStage tables
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  duration: numeric("duration"),
  status: varchar("status").default("uploaded").notNull(), // uploaded, transcribing, segmenting, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  wordTimestamps: jsonb("word_timestamps"), // Whisper word-level timestamps
  language: varchar("language"),
  confidence: numeric("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title").notNull(),
  summary: text("summary"),
  startTime: numeric("start_time").notNull(),
  endTime: numeric("end_time").notNull(),
  transcript: text("transcript"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentId: uuid("segment_id").references(() => segments.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").notNull(), // vertical_short, quote_graphic, social_post
  filePath: varchar("file_path"),
  content: text("content"), // For text-based content like social posts
  metadata: jsonb("metadata"), // Additional clip-specific data
  status: varchar("status").default("pending").notNull(), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform").notNull(), // twitter, linkedin, youtube, tiktok, instagram
  accountId: varchar("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clipId: uuid("clip_id").references(() => clips.id, { onDelete: "cascade" }).notNull(),
  socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status").default("scheduled").notNull(), // scheduled, posted, failed
  platformPostId: varchar("platform_post_id"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  transcript: one(transcripts),
  segments: many(segments),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  upload: one(uploads, {
    fields: [transcripts.uploadId],
    references: [uploads.id],
  }),
}));

export const segmentsRelations = relations(segments, ({ one, many }) => ({
  upload: one(uploads, {
    fields: [segments.uploadId],
    references: [uploads.id],
  }),
  clips: many(clips),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  segment: one(segments, {
    fields: [clips.segmentId],
    references: [segments.id],
  }),
  scheduledPosts: many(scheduledPosts),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users);
export const insertUploadSchema = createInsertSchema(uploads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTranscriptSchema = createInsertSchema(transcripts).omit({
  id: true,
  createdAt: true,
});
export const insertSegmentSchema = createInsertSchema(segments).omit({
  id: true,
  createdAt: true,
});
export const insertClipSchema = createInsertSchema(clips).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Segment = typeof segments.$inferSelect;
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Clip = typeof clips.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
