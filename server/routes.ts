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

  // Monetization routes
  app.get('/api/monetization/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { monetizationService } = await import('./monetizationService');
      const dashboard = await monetizationService.getMonetizationDashboard(userId);
      
      res.json(dashboard);
    } catch (error) {
      console.error('Error fetching monetization dashboard:', error);
      res.status(500).json({ message: 'Failed to fetch monetization dashboard' });
    }
  });

  app.get('/api/monetization/revenue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 30 } = req.query;
      
      const { monetizationService } = await import('./monetizationService');
      const report = await monetizationService.getRevenueReport(userId, parseInt(days as string));
      
      res.json(report);
    } catch (error) {
      console.error('Error fetching revenue report:', error);
      res.status(500).json({ message: 'Failed to fetch revenue report' });
    }
  });

  app.post('/api/monetization/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { monetizationService } = await import('./monetizationService');
      await monetizationService.syncRevenueData(userId);
      
      res.json({ success: true, message: 'Revenue data synced successfully' });
    } catch (error) {
      console.error('Error syncing revenue data:', error);
      res.status(500).json({ message: 'Failed to sync revenue data' });
    }
  });

  app.post('/api/monetization/prospects/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { monetizationService } = await import('./monetizationService');
      const prospects = await monetizationService.findSponsorshipProspects(userId);
      
      res.json(prospects);
    } catch (error) {
      console.error('Error searching prospects:', error);
      res.status(500).json({ message: 'Failed to search prospects' });
    }
  });

  app.post('/api/monetization/prospects/:id/outreach', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const { monetizationService } = await import('./monetizationService');
      const outreach = await monetizationService.generateSponsorshipOutreach(id, userId);
      
      res.json(outreach);
    } catch (error) {
      console.error('Error generating outreach:', error);
      res.status(500).json({ message: 'Failed to generate outreach' });
    }
  });

  app.patch('/api/monetization/prospects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      const { monetizationService } = await import('./monetizationService');
      await monetizationService.updateProspectStatus(id, status, notes);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating prospect:', error);
      res.status(500).json({ message: 'Failed to update prospect' });
    }
  });

  app.post('/api/monetization/cta', isAuthenticated, async (req: any, res) => {
    try {
      const ctaConfig = req.body;
      
      const { monetizationService } = await import('./monetizationService');
      await monetizationService.setupCTA(ctaConfig);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting up CTA:', error);
      res.status(500).json({ message: 'Failed to setup CTA' });
    }
  });

  app.get('/api/monetization/cta/performance', isAuthenticated, async (req: any, res) => {
    try {
      const { monetizationService } = await import('./monetizationService');
      const performance = await monetizationService.getCTAPerformance();
      
      res.json(performance);
    } catch (error) {
      console.error('Error fetching CTA performance:', error);
      res.status(500).json({ message: 'Failed to fetch CTA performance' });
    }
  });

  app.post('/api/monetization/cta/track', async (req, res) => {
    try {
      const { url, type, revenue } = req.body;
      
      const { monetizationService } = await import('./monetizationService');
      await monetizationService.trackCTAMetrics(url, type, revenue);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking CTA:', error);
      res.status(500).json({ message: 'Failed to track CTA' });
    }
  });

  // Graphics generation routes
  app.post('/api/graphics/quotes/:segmentId', isAuthenticated, async (req: any, res) => {
    try {
      const { segmentId } = req.params;
      const { branding } = req.body;
      
      const { graphicsService } = await import('./graphicsService');
      const result = await graphicsService.processSegmentForGraphics(segmentId, branding);
      
      res.json(result);
    } catch (error) {
      console.error('Error generating quote graphics:', error);
      res.status(500).json({ message: 'Failed to generate quote graphics' });
    }
  });

  app.get('/api/graphics/templates', isAuthenticated, async (req: any, res) => {
    try {
      const { graphicsService } = await import('./graphicsService');
      const templates = await graphicsService.getAvailableTemplates();
      
      res.json(templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ message: 'Failed to fetch templates' });
    }
  });

  app.post('/api/graphics/templates', isAuthenticated, async (req: any, res) => {
    try {
      const templateData = req.body;
      
      const { graphicsService } = await import('./graphicsService');
      const templateId = await graphicsService.createCustomTemplate(templateData);
      
      res.json({ templateId });
    } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({ message: 'Failed to create template' });
    }
  });

  // User management routes
  app.get('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const workspaces = await userManagementService.getWorkspacesByUser(userId);
      
      res.json(workspaces);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ message: 'Failed to fetch workspaces' });
    }
  });

  app.post('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspaceData = req.body;
      
      const { userManagementService } = await import('./userManagementService');
      const workspace = await userManagementService.createWorkspace(userId, workspaceData);
      
      res.json(workspace);
    } catch (error) {
      console.error('Error creating workspace:', error);
      res.status(500).json({ message: 'Failed to create workspace' });
    }
  });

  app.get('/api/workspaces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const { userManagementService } = await import('./userManagementService');
      const workspace = await userManagementService.getWorkspace(id);
      
      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }
      
      res.json(workspace);
    } catch (error) {
      console.error('Error fetching workspace:', error);
      res.status(500).json({ message: 'Failed to fetch workspace' });
    }
  });

  app.patch('/api/workspaces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const hasPermission = await userManagementService.checkPermission(userId, id, 'workspace.manage');
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      await userManagementService.updateWorkspace(id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating workspace:', error);
      res.status(500).json({ message: 'Failed to update workspace' });
    }
  });

  app.delete('/api/workspaces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      await userManagementService.deleteWorkspace(id, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting workspace:', error);
      res.status(500).json({ message: 'Failed to delete workspace' });
    }
  });

  app.get('/api/workspaces/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const hasPermission = await userManagementService.checkPermission(userId, id, 'members.view');
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const members = await userManagementService.getWorkspaceMembers(id);
      res.json(members);
    } catch (error) {
      console.error('Error fetching workspace members:', error);
      res.status(500).json({ message: 'Failed to fetch workspace members' });
    }
  });

  app.post('/api/workspaces/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { userId: targetUserId, role } = req.body;
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const hasPermission = await userManagementService.checkPermission(userId, id, 'members.invite');
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const member = await userManagementService.addWorkspaceMember(id, targetUserId, role, userId);
      res.json(member);
    } catch (error) {
      console.error('Error adding workspace member:', error);
      res.status(500).json({ message: 'Failed to add workspace member' });
    }
  });

  app.get('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const profile = await userManagementService.getUserProfile(userId);
      
      res.json(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: 'Failed to fetch user profile' });
    }
  });

  app.patch('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updates = req.body;
      
      const { userManagementService } = await import('./userManagementService');
      await userManagementService.updateUserProfile(userId, updates);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ message: 'Failed to update user profile' });
    }
  });

  app.get('/api/user/onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const checklist = await userManagementService.getOnboardingChecklist(userId);
      
      res.json(checklist);
    } catch (error) {
      console.error('Error fetching onboarding checklist:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding checklist' });
    }
  });

  app.post('/api/user/onboarding/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      await userManagementService.completeOnboarding(userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ message: 'Failed to complete onboarding' });
    }
  });

  app.get('/api/workspaces/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { days = 30 } = req.query;
      const userId = req.user.claims.sub;
      
      const { userManagementService } = await import('./userManagementService');
      const hasPermission = await userManagementService.checkPermission(userId, id, 'analytics.view');
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      
      const usage = await userManagementService.getUsageReport(id, parseInt(days as string));
      res.json(usage);
    } catch (error) {
      console.error('Error fetching usage report:', error);
      res.status(500).json({ message: 'Failed to fetch usage report' });
    }
  });

  app.get('/api/billing/plans', async (req, res) => {
    try {
      const { userManagementService } = await import('./userManagementService');
      const plans = await userManagementService.getBillingPlans();
      
      res.json(plans);
    } catch (error) {
      console.error('Error fetching billing plans:', error);
      res.status(500).json({ message: 'Failed to fetch billing plans' });
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
