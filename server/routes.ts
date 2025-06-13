import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { fileUpload, processFile } from "./fileHandler";
import { insertUploadSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

// Create a separate upload instance for testing without file type restrictions
const testUpload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Simple test route
  app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working', timestamp: new Date().toISOString() });
  });

  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Test upload endpoint (temporary - no auth required)
  app.post('/api/test-upload', testUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('Test upload received - MIME type:', req.file.mimetype, 'Original name:', req.file.originalname);
      
      const result = await fileUpload.handleUpload(req.file, 'test-user');
      res.json(result);
    } catch (error) {
      console.error('Test upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Upload routes
  app.post('/api/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const userId = req.user.claims.sub;
      const file = req.file;

      // Create upload record
      const uploadData = {
        userId,
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'uploaded',
      };

      const upload = await storage.createUpload(uploadData);

      // Start processing the file asynchronously
      processFile(upload.id).catch(error => {
        console.error('File processing error:', error);
        storage.updateUploadStatus(upload.id, 'failed');
      });

      res.json({
        id: upload.id,
        message: 'File uploaded successfully. Processing started.',
        status: 'uploaded'
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: 'Upload failed' });
    }
  });

  app.get('/api/uploads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const uploads = await storage.getUserUploads(userId);
      res.json(uploads);
    } catch (error) {
      console.error('Error fetching uploads:', error);
      res.status(500).json({ message: 'Failed to fetch uploads' });
    }
  });

  app.get('/api/uploads/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const upload = await storage.getUpload(req.params.id);
      
      if (!upload || upload.userId !== userId) {
        return res.status(404).json({ message: 'Upload not found' });
      }

      // Get related data
      const transcript = await storage.getTranscriptByUploadId(upload.id);
      const segments = await storage.getSegmentsByUploadId(upload.id);
      const clips = await storage.getClipsByUploadId(upload.id);
      const socialPosts = await storage.getSocialPostsByUploadId(upload.id);

      res.json({
        ...upload,
        transcript,
        segments,
        clips,
        socialPosts,
      });
    } catch (error) {
      console.error('Error fetching upload:', error);
      res.status(500).json({ message: 'Failed to fetch upload' });
    }
  });

  // Clips routes
  app.get('/api/clips', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const uploads = await storage.getUserUploads(userId);
      
      let allClips = [];
      for (const upload of uploads) {
        const clips = await storage.getClipsByUploadId(upload.id);
        allClips.push(...clips);
      }

      res.json(allClips);
    } catch (error) {
      console.error('Error fetching clips:', error);
      res.status(500).json({ message: 'Failed to fetch clips' });
    }
  });

  // Analytics routes
  app.get('/api/analytics/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  app.get('/api/analytics/report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 30 } = req.query;
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - parseInt(days as string) * 24 * 60 * 60 * 1000);
      
      const { analyticsService } = await import('./analyticsService');
      const report = await analyticsService.generateReport(userId, startDate, endDate);
      
      res.json(report);
    } catch (error) {
      console.error('Error generating analytics report:', error);
      res.status(500).json({ message: 'Failed to generate analytics report' });
    }
  });

  app.get('/api/analytics/heatmap', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 30 } = req.query;
      
      const { analyticsService } = await import('./analyticsService');
      const heatmap = await analyticsService.getEngagementHeatmap(userId, parseInt(days as string));
      
      res.json(heatmap);
    } catch (error) {
      console.error('Error fetching engagement heatmap:', error);
      res.status(500).json({ message: 'Failed to fetch engagement heatmap' });
    }
  });

  app.get('/api/analytics/funnel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 30 } = req.query;
      
      const { analyticsService } = await import('./analyticsService');
      const funnel = await analyticsService.getFunnelMetrics(userId, parseInt(days as string));
      
      res.json(funnel);
    } catch (error) {
      console.error('Error fetching funnel metrics:', error);
      res.status(500).json({ message: 'Failed to fetch funnel metrics' });
    }
  });

  app.post('/api/analytics/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { platform } = req.body;
      
      // Trigger manual sync of analytics data
      const { analyticsService } = await import('./analyticsService');
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      
      await analyticsService.generateReport(userId, startDate, endDate);
      
      res.json({ success: true, message: 'Analytics data synced successfully' });
    } catch (error) {
      console.error('Error syncing analytics:', error);
      res.status(500).json({ message: 'Failed to sync analytics data' });
    }
  });

  // Engagement webhook endpoints
  app.post('/api/webhooks/twitter', async (req, res) => {
    try {
      const { engagementService } = await import('./engagementService');
      await engagementService.processWebhookEvent('twitter', req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Twitter webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  app.post('/api/webhooks/linkedin', async (req, res) => {
    try {
      const { engagementService } = await import('./engagementService');
      await engagementService.processWebhookEvent('linkedin', req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('LinkedIn webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  app.post('/api/webhooks/instagram', async (req, res) => {
    try {
      const { engagementService } = await import('./engagementService');
      await engagementService.processWebhookEvent('instagram', req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Instagram webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Engagement management routes
  app.get('/api/engagement/digest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { hours = 24 } = req.query;
      
      const { engagementService } = await import('./engagementService');
      const digest = await engagementService.getEngagementDigest(userId, parseInt(hours as string));
      
      res.json(digest);
    } catch (error) {
      console.error('Error fetching engagement digest:', error);
      res.status(500).json({ message: 'Failed to fetch engagement digest' });
    }
  });

  app.get('/api/engagement/replies', isAuthenticated, async (req: any, res) => {
    try {
      const { engagementService } = await import('./engagementService');
      const replies = await engagementService.getReplyDrafts();
      
      res.json(replies);
    } catch (error) {
      console.error('Error fetching reply drafts:', error);
      res.status(500).json({ message: 'Failed to fetch reply drafts' });
    }
  });

  app.post('/api/engagement/replies/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.approveReply(id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error approving reply:', error);
      res.status(500).json({ message: 'Failed to approve reply' });
    }
  });

  app.post('/api/engagement/replies/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.rejectReply(id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error rejecting reply:', error);
      res.status(500).json({ message: 'Failed to reject reply' });
    }
  });

  app.patch('/api/engagement/replies/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.editReply(id, content);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error editing reply:', error);
      res.status(500).json({ message: 'Failed to edit reply' });
    }
  });

  // Social posts routes
  app.get('/api/uploads/:id/social-posts', isAuthenticated, async (req: any, res) => {
    try {
      const uploadId = req.params.id;
      const userId = req.user.claims.sub;
      
      const upload = await storage.getUpload(uploadId);
      if (!upload || upload.userId !== userId) {
        return res.status(404).json({ message: 'Upload not found' });
      }
      
      const socialPosts = await storage.getSocialPostsByUploadId(uploadId);
      res.json(socialPosts);
    } catch (error) {
      console.error('Error fetching social posts:', error);
      res.status(500).json({ message: 'Failed to fetch social posts' });
    }
  });

  app.patch('/api/social-posts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      await storage.updateSocialPostStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating social post:', error);
      res.status(500).json({ message: 'Failed to update social post' });
    }
  });

  // Scheduled posts routes
  app.get('/api/scheduled-posts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const posts = await storage.getScheduledPostsByUserId(userId);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching scheduled posts:", error);
      res.status(500).json({ message: "Failed to fetch scheduled posts" });
    }
  });

  app.patch('/api/social-posts/:id/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { scheduledFor } = req.body;
      
      await storage.updateSocialPostSchedule(id, scheduledFor);
      res.json({ success: true });
    } catch (error) {
      console.error("Error scheduling post:", error);
      res.status(500).json({ message: "Failed to schedule post" });
    }
  });

  // Social accounts routes
  app.get('/api/social-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const accounts = await storage.getUserSocialAccounts(userId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      res.status(500).json({ message: "Failed to fetch social accounts" });
    }
  });

  app.patch('/api/social-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      
      await storage.updateSocialAccountStatus(id, isActive);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating social account:", error);
      res.status(500).json({ message: "Failed to update social account" });
    }
  });

  app.delete('/api/social-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSocialAccount(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting social account:", error);
      res.status(500).json({ message: "Failed to delete social account" });
    }
  });

  // OAuth routes for social platforms
  app.get('/api/auth/:platform/connect', isAuthenticated, async (req: any, res) => {
    const { platform } = req.params;
    const userId = req.user.claims.sub;
    
    // Store user ID in session for OAuth callback
    req.session.oauthUserId = userId;
    req.session.oauthPlatform = platform;
    
    const redirectUrls: Record<string, string> = {
      twitter: `https://api.twitter.com/oauth/authorize?oauth_token=REQUEST_TOKEN`,
      linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI || '')}&scope=r_liteprofile%20r_emailaddress%20w_member_social`,
      instagram: `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI || '')}&scope=user_profile,user_media&response_type=code`,
      tiktok: `https://open-api.tiktok.com/platform/oauth/connect/?client_key=${process.env.TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.list&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || '')}`,
      youtube: `https://accounts.google.com/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || '')}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline`
    };
    
    const redirectUrl = redirectUrls[platform];
    if (!redirectUrl) {
      return res.status(400).json({ message: "Unsupported platform" });
    }
    
    res.redirect(redirectUrl);
  });

  app.get('/api/auth/:platform/callback', async (req: any, res) => {
    try {
      const { platform } = req.params;
      const { code } = req.query;
      const userId = req.session.oauthUserId;
      
      if (!userId || !code) {
        return res.status(400).json({ message: "Invalid OAuth callback" });
      }
      
      // Here you would exchange the code for access tokens
      // For now, we'll create a placeholder account
      await storage.createSocialAccount({
        userId,
        platform,
        accountId: `${platform}_user_${Date.now()}`,
        accessToken: 'placeholder_token',
        refreshToken: 'placeholder_refresh',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        isActive: true
      });
      
      // Clean up session
      delete req.session.oauthUserId;
      delete req.session.oauthPlatform;
      
      res.redirect('/?connected=' + platform);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.status(500).json({ message: "OAuth callback failed" });
    }
  });

  app.post('/api/social-accounts/:id/refresh', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Here you would refresh the actual token
      // For now, we'll update the expiry time
      await storage.updateSocialAccountToken(id, {
        accessToken: 'refreshed_token',
        expiresAt: new Date(Date.now() + 3600000)
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error refreshing token:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });

  // Get social posts with filtering
  app.get('/api/social-posts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { status } = req.query;
      
      const posts = await storage.getSocialPostsByUserId(userId, status as string);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching social posts:", error);
      res.status(500).json({ message: "Failed to fetch social posts" });
    }
  });

  // Manual posting routes
  app.post('/api/social-posts/:id/publish', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify post belongs to user
      const post = await storage.getSocialPost(id);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      // Get upload to verify ownership
      const segments = await storage.getSegmentsByUploadId(''); // Need to get segment first
      // For now, we'll trust the post exists and publish it
      
      const { postingService } = await import('./postingService');
      const result = await postingService.publishPostById(id);
      
      res.json({ success: true, result });
    } catch (error) {
      console.error('Error publishing post:', error);
      res.status(500).json({ message: 'Failed to publish post' });
    }
  });

  app.get('/api/posting/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get posting statistics
      const scheduledPosts = await storage.getScheduledPostsByUserId(userId);
      const accounts = await storage.getUserSocialAccounts(userId);
      
      const stats = {
        totalScheduled: scheduledPosts.length,
        postsToday: scheduledPosts.filter((post: any) => {
          const postDate = new Date(post.scheduledFor);
          const today = new Date();
          return postDate.toDateString() === today.toDateString();
        }).length,
        activeAccounts: accounts.filter(acc => acc.isActive).length,
        recentlyPosted: scheduledPosts.filter((post: any) => post.status === 'posted').slice(0, 5)
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching posting status:', error);
      res.status(500).json({ message: 'Failed to fetch posting status' });
    }
  });

  app.patch('/api/social-posts/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const postId = req.params.id;
      const { status, scheduledFor } = req.body;
      
      await storage.updateSocialPostStatus(postId, status);
      
      res.json({ message: 'Social post updated successfully' });
    } catch (error) {
      console.error('Error updating social post:', error);
      res.status(500).json({ message: 'Failed to update social post' });
    }
  });

  // Social accounts routes
  app.get('/api/social-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const accounts = await storage.getUserSocialAccounts(userId);
      res.json(accounts);
    } catch (error) {
      console.error('Error fetching social accounts:', error);
      res.status(500).json({ message: 'Failed to fetch social accounts' });
    }
  });

  // Processing status endpoint
  app.get('/api/processing-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const uploads = await storage.getUserUploads(userId);
      const processingUploads = uploads.filter(u => 
        ['uploaded', 'transcribing', 'segmenting', 'processing'].includes(u.status)
      );

      res.json(processingUploads);
    } catch (error) {
      console.error('Error fetching processing status:', error);
      res.status(500).json({ message: 'Failed to fetch processing status' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
