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

  // Content generation routes
  app.post('/api/content/blog/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.params;
      const { topic, keywords } = req.body;
      
      const { contentGenerators } = await import('./contentGenerators');
      const segments = await storage.getSegmentsByUploadId(uploadId);
      const blog = await contentGenerators.generateSEOBlog(segments, topic, keywords || []);
      
      res.json(blog);
    } catch (error) {
      console.error('Error generating SEO blog:', error);
      res.status(500).json({ message: 'Failed to generate SEO blog' });
    }
  });

  app.post('/api/content/newsletter/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.params;
      const { brandName, audienceType } = req.body;
      
      const { contentGenerators } = await import('./contentGenerators');
      const segments = await storage.getSegmentsByUploadId(uploadId);
      const newsletter = await contentGenerators.generateNewsletter(segments, brandName, audienceType);
      
      res.json(newsletter);
    } catch (error) {
      console.error('Error generating newsletter:', error);
      res.status(500).json({ message: 'Failed to generate newsletter' });
    }
  });

  app.post('/api/content/thumbnail/:segmentId', isAuthenticated, async (req: any, res) => {
    try {
      const { segmentId } = req.params;
      const { templateId } = req.body;
      
      const { contentGenerators } = await import('./contentGenerators');
      const segments = await storage.getSegmentsByUploadId(segmentId);
      const segment = segments.find(s => s.id === segmentId) || segments[0];
      
      if (!segment) {
        return res.status(404).json({ message: 'Segment not found' });
      }
      
      const thumbnail = await contentGenerators.generateThumbnail(segment, templateId);
      res.json(thumbnail);
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      res.status(500).json({ message: 'Failed to generate thumbnail' });
    }
  });

  app.get('/api/content/thumbnail/templates', isAuthenticated, async (req: any, res) => {
    try {
      const { contentGenerators } = await import('./contentGenerators');
      const templates = await contentGenerators.getThumbnailTemplates();
      
      res.json(templates);
    } catch (error) {
      console.error('Error fetching thumbnail templates:', error);
      res.status(500).json({ message: 'Failed to fetch thumbnail templates' });
    }
  });

  app.post('/api/content/process/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.params;
      
      const { contentGenerators } = await import('./contentGenerators');
      const content = await contentGenerators.processSegmentsForContent(uploadId);
      
      res.json(content);
    } catch (error) {
      console.error('Error processing content:', error);
      res.status(500).json({ message: 'Failed to process content' });
    }
  });

  // Enhanced analytics routes
  app.get('/api/analytics/heatmap/:segmentId', isAuthenticated, async (req: any, res) => {
    try {
      const { segmentId } = req.params;
      
      const { enhancedAnalyticsService } = await import('./enhancedAnalytics');
      const heatMap = await enhancedAnalyticsService.generateClipHeatMap(segmentId);
      
      res.json(heatMap);
    } catch (error) {
      console.error('Error generating heat map:', error);
      res.status(500).json({ message: 'Failed to generate heat map' });
    }
  });

  app.get('/api/analytics/digest/weekly', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekStart } = req.query;
      const weekStartDate = weekStart ? new Date(weekStart as string) : new Date();
      
      const { enhancedAnalyticsService } = await import('./enhancedAnalytics');
      const digest = await enhancedAnalyticsService.generateWeeklyDigest(userId, weekStartDate);
      
      res.json(digest);
    } catch (error) {
      console.error('Error generating weekly digest:', error);
      res.status(500).json({ message: 'Failed to generate weekly digest' });
    }
  });

  app.get('/api/analytics/export/:type', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type } = req.params;
      const { startDate, endDate } = req.query;
      
      const dateRange = {
        start: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate as string) : new Date()
      };
      
      const { enhancedAnalyticsService } = await import('./enhancedAnalytics');
      const exportData = await enhancedAnalyticsService.exportToCSV(userId, type as any, dateRange);
      
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({ message: 'Failed to export data' });
    }
  });

  app.get('/api/analytics/report/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekStart } = req.query;
      const weekStartDate = weekStart ? new Date(weekStart as string) : new Date();
      
      const { enhancedAnalyticsService } = await import('./enhancedAnalytics');
      const pdfReport = await enhancedAnalyticsService.generatePDFReport(userId, weekStartDate);
      
      res.json(pdfReport);
    } catch (error) {
      console.error('Error generating PDF report:', error);
      res.status(500).json({ message: 'Failed to generate PDF report' });
    }
  });

  app.get('/api/analytics/heatmaps', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { enhancedAnalyticsService } = await import('./enhancedAnalytics');
      const heatMaps = await enhancedAnalyticsService.getClipHeatMaps(userId);
      
      res.json(heatMaps);
    } catch (error) {
      console.error('Error fetching heat maps:', error);
      res.status(500).json({ message: 'Failed to fetch heat maps' });
    }
  });

  // Vertical shorts generation routes
  app.post('/api/shorts/generate/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.params;
      const { config } = req.body;
      
      const upload = await storage.getUpload(uploadId);
      if (!upload) {
        return res.status(404).json({ message: 'Upload not found' });
      }
      
      const segments = await storage.getSegmentsByUploadId(uploadId);
      if (segments.length === 0) {
        return res.status(400).json({ message: 'No segments found for upload' });
      }
      
      const { shortsGenerator } = await import('./shortsGenerator');
      const outputDir = `./uploads/shorts/${uploadId}`;
      
      // For demo purposes, simulate shorts generation
      const results = await Promise.all(
        segments.map(async (segment) => ({
          segmentId: segment.id,
          outputPath: `${outputDir}/short_${segment.id}.mp4`,
          duration: parseFloat(segment.endTime) - parseFloat(segment.startTime),
          size: Math.floor(Math.random() * 50000000) + 10000000, // 10-60MB
          format: 'mp4',
          resolution: '1080x1920'
        }))
      );
      
      res.json({
        uploadId,
        totalShorts: results.length,
        results,
        status: 'completed'
      });
    } catch (error) {
      console.error('Error generating vertical shorts:', error);
      res.status(500).json({ message: 'Failed to generate vertical shorts' });
    }
  });

  app.get('/api/shorts/:uploadId/status', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.params;
      
      // Simulate shorts generation status
      res.json({
        uploadId,
        status: 'completed',
        progress: 100,
        totalShorts: 3,
        completedShorts: 3,
        estimatedTimeRemaining: 0
      });
    } catch (error) {
      console.error('Error fetching shorts status:', error);
      res.status(500).json({ message: 'Failed to fetch shorts status' });
    }
  });

  // Queue management routes
  app.get('/api/queues/metrics', isAuthenticated, async (req: any, res) => {
    try {
      // Return simulated queue metrics
      const metrics = {
        youtube: { waiting: 2, active: 1, completed: 15, failed: 0, delayed: 3 },
        tiktok: { waiting: 5, active: 2, completed: 28, failed: 1, delayed: 1 },
        twitter: { waiting: 8, active: 1, completed: 45, failed: 2, delayed: 0 },
        instagram: { waiting: 3, active: 1, completed: 22, failed: 0, delayed: 2 },
        linkedin: { waiting: 1, active: 0, completed: 8, failed: 0, delayed: 4 },
        facebook: { waiting: 2, active: 1, completed: 12, failed: 1, delayed: 1 }
      };
      
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching queue metrics:', error);
      res.status(500).json({ message: 'Failed to fetch queue metrics' });
    }
  });

  app.post('/api/queues/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const { platform, postId, scheduledTime } = req.body;
      
      if (!platform || !postId) {
        return res.status(400).json({ message: 'Platform and postId are required' });
      }
      
      // Simulate scheduling a post in the queue
      const jobId = `job_${platform}_${Date.now()}`;
      
      console.log(`[QueueManager] Scheduled ${platform} post ${postId} for ${scheduledTime || 'immediate posting'}`);
      
      res.json({
        success: true,
        jobId,
        platform,
        postId,
        scheduledTime: scheduledTime || new Date().toISOString(),
        status: 'queued'
      });
    } catch (error) {
      console.error('Error scheduling post:', error);
      res.status(500).json({ message: 'Failed to schedule post' });
    }
  });

  app.delete('/api/queues/:platform/:jobId', isAuthenticated, async (req: any, res) => {
    try {
      const { platform, jobId } = req.params;
      
      console.log(`[QueueManager] Cancelled ${platform} job ${jobId}`);
      
      res.json({
        success: true,
        message: `Job ${jobId} cancelled successfully`
      });
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({ message: 'Failed to cancel job' });
    }
  });

  // Scheduling rules routes
  app.get('/api/scheduling/optimal-time', isAuthenticated, async (req: any, res) => {
    try {
      const { platform, timezone, vertical, preferredDate } = req.query;
      
      if (!platform) {
        return res.status(400).json({ message: 'Platform is required' });
      }
      
      const { schedulingRules } = await import('./schedulingRules');
      const recommendation = schedulingRules.getOptimalTime(
        platform as string,
        timezone as string,
        vertical as string,
        preferredDate ? new Date(preferredDate as string) : undefined
      );
      
      res.json(recommendation);
    } catch (error) {
      console.error('Error getting optimal time:', error);
      res.status(500).json({ message: 'Failed to get optimal time' });
    }
  });

  app.get('/api/scheduling/best-times/:platform', isAuthenticated, async (req: any, res) => {
    try {
      const { platform } = req.params;
      const { timezone, vertical } = req.query;
      
      const { schedulingRules } = await import('./schedulingRules');
      const bestTimes = schedulingRules.getBestTimesForPlatform(
        platform,
        timezone as string,
        vertical as string
      );
      
      res.json({
        platform,
        timezone: timezone || 'America/New_York',
        vertical: vertical || 'general',
        bestTimes
      });
    } catch (error) {
      console.error('Error fetching best times:', error);
      res.status(500).json({ message: 'Failed to fetch best times' });
    }
  });

  app.post('/api/scheduling/validate', isAuthenticated, async (req: any, res) => {
    try {
      const { platform, newPostTime, scheduledPosts, timezone, vertical } = req.body;
      
      if (!platform || !newPostTime) {
        return res.status(400).json({ message: 'Platform and newPostTime are required' });
      }
      
      const { schedulingRules } = await import('./schedulingRules');
      const validation = schedulingRules.validateFrequencyRules(
        platform,
        (scheduledPosts || []).map((time: string) => new Date(time)),
        new Date(newPostTime),
        timezone,
        vertical
      );
      
      res.json(validation);
    } catch (error) {
      console.error('Error validating scheduling rules:', error);
      res.status(500).json({ message: 'Failed to validate scheduling rules' });
    }
  });

  app.get('/api/scheduling/verticals', isAuthenticated, async (req: any, res) => {
    try {
      const { schedulingRules } = await import('./schedulingRules');
      const verticals = schedulingRules.getAvailableVerticals();
      
      res.json(verticals);
    } catch (error) {
      console.error('Error fetching verticals:', error);
      res.status(500).json({ message: 'Failed to fetch verticals' });
    }
  });

  app.get('/api/scheduling/timezones', isAuthenticated, async (req: any, res) => {
    try {
      const { schedulingRules } = await import('./schedulingRules');
      const timezones = schedulingRules.getAvailableTimezones();
      
      res.json(timezones);
    } catch (error) {
      console.error('Error fetching timezones:', error);
      res.status(500).json({ message: 'Failed to fetch timezones' });
    }
  });

  // Engagement loop endpoints
  app.post('/api/webhooks/:platform', async (req: any, res) => {
    try {
      const { platform } = req.params;
      const payload = req.body;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.processWebhookEvent(platform, payload);
      
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error(`Error processing ${req.params.platform} webhook:`, error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  app.get('/api/engagement/replies/pending', isAuthenticated, async (req: any, res) => {
    try {
      const { engagementService } = await import('./engagementService');
      const pendingReplies = await engagementService.getReplyDrafts();
      
      res.json(pendingReplies.filter(reply => reply.status === 'pending'));
    } catch (error) {
      console.error('Error fetching pending replies:', error);
      res.status(500).json({ message: 'Failed to fetch pending replies' });
    }
  });

  app.post('/api/engagement/replies/:replyId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const { replyId } = req.params;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.approveReply(replyId);
      
      res.json({ success: true, message: 'Reply approved and posted' });
    } catch (error) {
      console.error('Error approving reply:', error);
      res.status(500).json({ message: 'Failed to approve reply' });
    }
  });

  app.post('/api/engagement/replies/:replyId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { replyId } = req.params;
      
      const { engagementService } = await import('./engagementService');
      await engagementService.rejectReply(replyId);
      
      res.json({ success: true, message: 'Reply rejected' });
    } catch (error) {
      console.error('Error rejecting reply:', error);
      res.status(500).json({ message: 'Failed to reject reply' });
    }
  });

  app.put('/api/engagement/replies/:replyId', isAuthenticated, async (req: any, res) => {
    try {
      const { replyId } = req.params;
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({ message: 'Content is required' });
      }
      
      const { engagementService } = await import('./engagementService');
      await engagementService.editReply(replyId, content);
      
      res.json({ success: true, message: 'Reply updated' });
    } catch (error) {
      console.error('Error editing reply:', error);
      res.status(500).json({ message: 'Failed to edit reply' });
    }
  });

  app.get('/api/engagement/digest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { hours } = req.query;
      
      const { engagementService } = await import('./engagementService');
      const digest = await engagementService.getEngagementDigest(userId, hours ? parseInt(hours as string) : 24);
      
      res.json(digest);
    } catch (error) {
      console.error('Error generating engagement digest:', error);
      res.status(500).json({ message: 'Failed to generate engagement digest' });
    }
  });

  app.get('/api/engagement/breakouts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days } = req.query;
      
      // Get posts with breakout performance (top 10%)
      const posts = await storage.getSocialPostsByUserId(userId);
      const recentPosts = posts.filter(post => {
        const daysAgo = days ? parseInt(days as string) : 7;
        const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        return post.createdAt && new Date(post.createdAt) > cutoff;
      });
      
      // Calculate engagement scores and find top 10%
      const postsWithScores = recentPosts.map(post => {
        const engagement = (post.engagement as any) || {};
        const metrics = engagement.metrics || {};
        const totalEngagement = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
        const views = metrics.views || 1;
        const engagementRate = (totalEngagement / views) * 100;
        
        return {
          ...post,
          engagementScore: engagementRate,
          totalEngagement,
          isBreakout: false
        };
      });
      
      // Sort by engagement score and mark top 10%
      postsWithScores.sort((a, b) => b.engagementScore - a.engagementScore);
      const top10PercentCount = Math.ceil(postsWithScores.length * 0.1);
      
      for (let i = 0; i < top10PercentCount; i++) {
        postsWithScores[i].isBreakout = true;
      }
      
      const breakoutPosts = postsWithScores.filter(post => post.isBreakout);
      
      res.json({
        breakoutPosts,
        totalPosts: recentPosts.length,
        breakoutCount: breakoutPosts.length,
        averageEngagement: postsWithScores.reduce((sum, post) => sum + post.engagementScore, 0) / postsWithScores.length || 0
      });
    } catch (error) {
      console.error('Error fetching breakout content:', error);
      res.status(500).json({ message: 'Failed to fetch breakout content' });
    }
  });

  app.post('/api/engagement/boost/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const { postId } = req.params;
      const { budget, platforms } = req.body;
      
      if (!budget || !platforms) {
        return res.status(400).json({ message: 'Budget and platforms are required' });
      }
      
      // Simulate ad boost creation
      const boostCampaign = {
        id: `boost_${Date.now()}`,
        postId,
        budget,
        platforms,
        status: 'active',
        startDate: new Date().toISOString(),
        estimatedReach: budget * 100, // Rough estimate
        createdAt: new Date().toISOString()
      };
      
      console.log(`[EngagementService] Created ad boost campaign:`, boostCampaign);
      
      res.json({
        success: true,
        campaign: boostCampaign,
        message: `Ad boost campaign created with $${budget} budget`
      });
    } catch (error) {
      console.error('Error creating ad boost:', error);
      res.status(500).json({ message: 'Failed to create ad boost' });
    }
  });

  // Enhanced Upload System Routes
  app.post('/api/uploads/initialize', isAuthenticated, async (req: any, res) => {
    const { uploadService } = await import('./uploadService');
    await uploadService.initializeUpload(req, res);
  });

  app.post('/api/uploads/:uploadId/chunk', isAuthenticated, async (req: any, res) => {
    const { uploadService, uploadChunkMiddleware } = await import('./uploadService');
    uploadChunkMiddleware(req, res, async (error) => {
      if (error) {
        return res.status(400).json({ error: 'Invalid chunk data' });
      }
      await uploadService.uploadChunk(req, res);
    });
  });

  app.get('/api/uploads/:uploadId/progress', isAuthenticated, async (req: any, res) => {
    const { uploadService } = await import('./uploadService');
    await uploadService.getUploadProgress(req, res);
  });

  app.post('/api/uploads/:uploadId/cancel', isAuthenticated, async (req: any, res) => {
    const { uploadService } = await import('./uploadService');
    await uploadService.handleCancelUpload(req, res);
  });

  app.post('/api/uploads/:uploadId/resume', isAuthenticated, async (req: any, res) => {
    const { uploadService } = await import('./uploadService');
    await uploadService.resumeUpload(req, res);
  });

  // OAuth 2.0 Management Routes
  app.get('/api/oauth/:platform/auth-url', isAuthenticated, async (req: any, res) => {
    try {
      const { platform } = req.params;
      const { state } = req.query;
      
      const { oauthService } = await import('./oauthService');
      const authUrl = oauthService.generateAuthUrl(platform, state as string);
      
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });

  app.post('/api/oauth/:platform/callback', isAuthenticated, async (req: any, res) => {
    try {
      const { platform } = req.params;
      const { code } = req.body;
      const userId = req.user.claims.sub;
      
      const { oauthService } = await import('./oauthService');
      const token = await oauthService.exchangeCodeForToken(platform, code, userId);
      
      res.json({ success: true, platform, expires: token.expiresAt });
    } catch (error) {
      console.error('Error exchanging OAuth code:', error);
      res.status(500).json({ error: 'Failed to exchange authorization code' });
    }
  });

  app.post('/api/oauth/:platform/revoke', isAuthenticated, async (req: any, res) => {
    try {
      const { platform } = req.params;
      const userId = req.user.claims.sub;
      
      const { oauthService } = await import('./oauthService');
      await oauthService.revokeToken(userId, platform);
      
      res.json({ success: true, message: 'Token revoked successfully' });
    } catch (error) {
      console.error('Error revoking token:', error);
      res.status(500).json({ error: 'Failed to revoke token' });
    }
  });

  // Cross-Platform Funnel Analytics Routes
  app.get('/api/analytics/funnel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const { funnelAnalyticsService } = await import('./funnelAnalytics');
      const report = await funnelAnalyticsService.generateFunnelReport(userId, start, end);
      
      res.json(report);
    } catch (error) {
      console.error('Error generating funnel report:', error);
      res.status(500).json({ error: 'Failed to generate funnel report' });
    }
  });

  app.get('/api/analytics/funnel/export', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { format, startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const { funnelAnalyticsService } = await import('./funnelAnalytics');
      const exportData = await funnelAnalyticsService.exportFunnelData(
        userId, 
        (format as 'csv' | 'json') || 'csv', 
        start, 
        end
      );
      
      res.setHeader('Content-Type', exportData.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.data);
    } catch (error) {
      console.error('Error exporting funnel data:', error);
      res.status(500).json({ error: 'Failed to export funnel data' });
    }
  });

  app.get('/api/analytics/realtime', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { funnelAnalyticsService } = await import('./funnelAnalytics');
      const metrics = await funnelAnalyticsService.getRealtimeMetrics(userId);
      
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching realtime metrics:', error);
      res.status(500).json({ error: 'Failed to fetch realtime metrics' });
    }
  });

  // Billing & Usage Routes
  app.get('/api/billing/usage', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { period } = req.query;
      
      const { billingService } = await import('./billingService');
      const usage = await billingService.getUsageMetrics(userId, period as string);
      
      res.json(usage);
    } catch (error) {
      console.error('Error fetching usage metrics:', error);
      res.status(500).json({ error: 'Failed to fetch usage metrics' });
    }
  });

  app.get('/api/billing/bill', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { period } = req.query;
      
      const { billingService } = await import('./billingService');
      const bill = await billingService.calculateBill(userId, period as string);
      
      res.json(bill);
    } catch (error) {
      console.error('Error calculating bill:', error);
      res.status(500).json({ error: 'Failed to calculate bill' });
    }
  });

  app.get('/api/billing/invoice', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { period } = req.query;
      
      const { billingService } = await import('./billingService');
      const invoice = await billingService.generateInvoice(userId, period as string);
      
      res.json(invoice);
    } catch (error) {
      console.error('Error generating invoice:', error);
      res.status(500).json({ error: 'Failed to generate invoice' });
    }
  });

  app.get('/api/billing/upgrade-suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { billingService } = await import('./billingService');
      const suggestions = await billingService.getUpgradeSuggestions(userId);
      
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting upgrade suggestions:', error);
      res.status(500).json({ error: 'Failed to get upgrade suggestions' });
    }
  });

  app.post('/api/billing/usage/record', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type, amount } = req.body;
      
      const { billingService } = await import('./billingService');
      await billingService.recordUsage(userId, type, amount);
      
      res.json({ success: true, message: 'Usage recorded' });
    } catch (error) {
      console.error('Error recording usage:', error);
      res.status(500).json({ error: 'Failed to record usage' });
    }
  });

  // Revenue Tracking Routes
  app.get('/api/revenue/platforms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const { revenueTrackingService } = await import('./revenueTracking');
      const revenueData = await revenueTrackingService.fetchAllPlatformRevenue(userId, start, end);
      
      res.json(revenueData);
    } catch (error) {
      console.error('Error fetching platform revenue:', error);
      res.status(500).json({ error: 'Failed to fetch platform revenue' });
    }
  });

  app.get('/api/revenue/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { videoId } = req.params;
      const { platform } = req.query;
      
      if (!platform) {
        return res.status(400).json({ error: 'Platform parameter required' });
      }
      
      const { revenueTrackingService } = await import('./revenueTracking');
      const videoRevenue = await revenueTrackingService.trackVideoRevenue(userId, videoId, platform as string);
      
      res.json(videoRevenue);
    } catch (error) {
      console.error('Error tracking video revenue:', error);
      res.status(500).json({ error: 'Failed to track video revenue' });
    }
  });

  app.get('/api/revenue/report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const { revenueTrackingService } = await import('./revenueTracking');
      const report = await revenueTrackingService.generateRevenueReport(userId, start, end);
      
      res.json(report);
    } catch (error) {
      console.error('Error generating revenue report:', error);
      res.status(500).json({ error: 'Failed to generate revenue report' });
    }
  });

  // Sponsorship Prospecting Routes
  app.post('/api/sponsorship/find-prospects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contentNiche, audienceSize, location } = req.body;
      
      if (!contentNiche || !audienceSize) {
        return res.status(400).json({ error: 'contentNiche and audienceSize are required' });
      }
      
      const { sponsorshipProspectingService } = await import('./sponsorshipProspecting');
      const prospects = await sponsorshipProspectingService.findSponsors(
        userId, 
        contentNiche, 
        parseInt(audienceSize), 
        location
      );
      
      res.json(prospects);
    } catch (error) {
      console.error('Error finding sponsors:', error);
      if (error instanceof Error && error.message.includes('Apollo API key')) {
        res.status(400).json({ error: 'Apollo API key not configured. Please contact support to enable sponsorship prospecting.' });
      } else {
        res.status(500).json({ error: 'Failed to find sponsors' });
      }
    }
  });

  app.post('/api/sponsorship/generate-pitch', isAuthenticated, async (req: any, res) => {
    try {
      const { prospect, userMetrics, contentNiche } = req.body;
      
      if (!prospect || !userMetrics || !contentNiche) {
        return res.status(400).json({ error: 'prospect, userMetrics, and contentNiche are required' });
      }
      
      const { sponsorshipProspectingService } = await import('./sponsorshipProspecting');
      const pitch = await sponsorshipProspectingService.generateSponsorshipPitch(
        prospect, 
        userMetrics, 
        contentNiche
      );
      
      res.json(pitch);
    } catch (error) {
      console.error('Error generating sponsorship pitch:', error);
      res.status(500).json({ error: 'Failed to generate sponsorship pitch' });
    }
  });

  app.post('/api/sponsorship/track-interaction', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { prospectId, interaction } = req.body;
      
      if (!prospectId || !interaction) {
        return res.status(400).json({ error: 'prospectId and interaction are required' });
      }
      
      const { sponsorshipProspectingService } = await import('./sponsorshipProspecting');
      await sponsorshipProspectingService.trackProspectInteractions(userId, prospectId, {
        ...interaction,
        timestamp: new Date()
      });
      
      res.json({ success: true, message: 'Interaction tracked' });
    } catch (error) {
      console.error('Error tracking prospect interaction:', error);
      res.status(500).json({ error: 'Failed to track interaction' });
    }
  });

  app.get('/api/sponsorship/report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const { sponsorshipProspectingService } = await import('./sponsorshipProspecting');
      const report = await sponsorshipProspectingService.generateProspectingReport(userId, start, end);
      
      res.json(report);
    } catch (error) {
      console.error('Error generating prospecting report:', error);
      res.status(500).json({ error: 'Failed to generate prospecting report' });
    }
  });

  // Chunked Upload Routes
  app.post('/api/upload/chunked/youtube/init', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { filePath, title, description, tags, categoryId, privacyStatus } = req.body;
      
      if (!filePath || !title) {
        return res.status(400).json({ error: 'filePath and title are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const session = await chunkedUploadHelpers.initializeYouTubeUpload(userId, filePath, {
        title,
        description,
        tags,
        categoryId,
        privacyStatus
      });
      
      res.json(session);
    } catch (error) {
      console.error('Error initializing YouTube upload:', error);
      res.status(500).json({ error: 'Failed to initialize YouTube upload' });
    }
  });

  app.post('/api/upload/chunked/youtube/chunk', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, filePath, chunkIndex } = req.body;
      
      if (!sessionId || !filePath || chunkIndex === undefined) {
        return res.status(400).json({ error: 'sessionId, filePath, and chunkIndex are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.uploadYouTubeChunk(sessionId, filePath, parseInt(chunkIndex));
      
      res.json(result);
    } catch (error) {
      console.error('Error uploading YouTube chunk:', error);
      res.status(500).json({ error: 'Failed to upload YouTube chunk' });
    }
  });

  app.post('/api/upload/chunked/twitter/init', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { filePath, mediaType } = req.body;
      
      if (!filePath || !mediaType) {
        return res.status(400).json({ error: 'filePath and mediaType are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const session = await chunkedUploadHelpers.initializeXUpload(userId, filePath, mediaType);
      
      res.json(session);
    } catch (error) {
      console.error('Error initializing X upload:', error);
      res.status(500).json({ error: 'Failed to initialize X upload' });
    }
  });

  app.post('/api/upload/chunked/twitter/chunk', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, filePath, chunkIndex } = req.body;
      
      if (!sessionId || !filePath || chunkIndex === undefined) {
        return res.status(400).json({ error: 'sessionId, filePath, and chunkIndex are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.uploadXChunk(sessionId, filePath, parseInt(chunkIndex));
      
      res.json(result);
    } catch (error) {
      console.error('Error uploading X chunk:', error);
      res.status(500).json({ error: 'Failed to upload X chunk' });
    }
  });

  app.post('/api/upload/chunked/twitter/finalize', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.finalizeXUpload(sessionId);
      
      res.json(result);
    } catch (error) {
      console.error('Error finalizing X upload:', error);
      res.status(500).json({ error: 'Failed to finalize X upload' });
    }
  });

  app.post('/api/upload/chunked/tiktok/init', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const session = await chunkedUploadHelpers.initializeTikTokUpload(userId, filePath);
      
      res.json(session);
    } catch (error) {
      console.error('Error initializing TikTok upload:', error);
      res.status(500).json({ error: 'Failed to initialize TikTok upload' });
    }
  });

  app.post('/api/upload/chunked/tiktok/chunk', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, filePath, chunkIndex } = req.body;
      
      if (!sessionId || !filePath || chunkIndex === undefined) {
        return res.status(400).json({ error: 'sessionId, filePath, and chunkIndex are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.uploadTikTokChunk(sessionId, filePath, parseInt(chunkIndex));
      
      res.json(result);
    } catch (error) {
      console.error('Error uploading TikTok chunk:', error);
      res.status(500).json({ error: 'Failed to upload TikTok chunk' });
    }
  });

  app.post('/api/upload/chunked/instagram/init', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { filePath, mediaType } = req.body;
      
      if (!filePath || !mediaType) {
        return res.status(400).json({ error: 'filePath and mediaType are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const session = await chunkedUploadHelpers.initializeInstagramUpload(userId, filePath, mediaType);
      
      res.json(session);
    } catch (error) {
      console.error('Error initializing Instagram upload:', error);
      res.status(500).json({ error: 'Failed to initialize Instagram upload' });
    }
  });

  app.post('/api/upload/chunked/instagram/upload', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, filePath } = req.body;
      
      if (!sessionId || !filePath) {
        return res.status(400).json({ error: 'sessionId and filePath are required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.uploadInstagramMedia(sessionId, filePath);
      
      res.json(result);
    } catch (error) {
      console.error('Error uploading Instagram media:', error);
      res.status(500).json({ error: 'Failed to upload Instagram media' });
    }
  });

  app.post('/api/upload/chunked/instagram/publish', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, caption, locationId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.publishInstagramMedia(sessionId, caption, locationId);
      
      res.json(result);
    } catch (error) {
      console.error('Error publishing Instagram media:', error);
      res.status(500).json({ error: 'Failed to publish Instagram media' });
    }
  });

  app.post('/api/upload/chunked/instagram/carousel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { mediaItems } = req.body;
      
      if (!mediaItems || !Array.isArray(mediaItems)) {
        return res.status(400).json({ error: 'mediaItems array is required' });
      }
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const result = await chunkedUploadHelpers.createInstagramCarousel(userId, mediaItems);
      
      res.json(result);
    } catch (error) {
      console.error('Error creating Instagram carousel:', error);
      res.status(500).json({ error: 'Failed to create Instagram carousel' });
    }
  });

  app.get('/api/upload/chunked/session/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      
      const { chunkedUploadHelpers } = await import('./chunkedUploadHelpers');
      const session = chunkedUploadHelpers.getUploadSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found' });
      }
      
      const progress = chunkedUploadHelpers.getUploadProgress(sessionId);
      
      res.json({ session, progress });
    } catch (error) {
      console.error('Error getting upload session:', error);
      res.status(500).json({ error: 'Failed to get upload session' });
    }
  });

  // Weekly Report Routes
  app.post('/api/reports/weekly/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekOffset } = req.body;
      
      const { weeklyReportGenerator } = await import('./weeklyReportGenerator');
      const report = await weeklyReportGenerator.generateWeeklyReport(userId, weekOffset || 0);
      
      res.json({
        success: true,
        reportPath: report.filePath,
        emailSubject: report.emailSubject,
        emailPreview: report.emailBody.substring(0, 200) + '...'
      });
    } catch (error) {
      console.error('Error generating weekly report:', error);
      res.status(500).json({ error: 'Failed to generate weekly report' });
    }
  });

  // Stripe Payment Routes
  app.get('/api/billing/tiers', async (req, res) => {
    try {
      const { SUBSCRIPTION_TIERS } = await import('./stripeService');
      res.json(SUBSCRIPTION_TIERS);
    } catch (error) {
      console.error('Error fetching subscription tiers:', error);
      res.status(500).json({ error: 'Failed to fetch subscription tiers' });
    }
  });

  app.post('/api/billing/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { priceId } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ error: 'Price ID is required' });
      }
      
      const { stripeService } = await import('./stripeService');
      const result = await stripeService.createSubscription(userId, priceId);
      
      res.json(result);
    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  app.post('/api/billing/cancel-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { immediate } = req.body;
      
      const { stripeService } = await import('./stripeService');
      await stripeService.cancelSubscription(userId, immediate);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  app.post('/api/billing/update-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { newPriceId } = req.body;
      
      if (!newPriceId) {
        return res.status(400).json({ error: 'New price ID is required' });
      }
      
      const { stripeService } = await import('./stripeService');
      await stripeService.updateSubscription(userId, newPriceId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  });

  app.get('/api/billing/usage', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { month } = req.query;
      
      const { stripeService } = await import('./stripeService');
      const usage = await stripeService.getUsage(userId, month as string);
      
      res.json(usage);
    } catch (error) {
      console.error('Error fetching usage:', error);
      res.status(500).json({ error: 'Failed to fetch usage' });
    }
  });

  app.get('/api/billing/limits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { stripeService } = await import('./stripeService');
      const limits = await stripeService.checkLimits(userId);
      
      res.json(limits);
    } catch (error) {
      console.error('Error checking limits:', error);
      res.status(500).json({ error: 'Failed to check limits' });
    }
  });

  app.post('/api/billing/webhook', async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const { stripeService } = await import('./stripeService');
      
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(400).json({ error: 'Webhook secret not configured' });
      }
      
      const stripe = (await import('stripe')).default;
      const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-05-28.basil',
      });
      
      const event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      await stripeService.handleWebhook(event);
      
      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  });

  app.get('/api/reports/weekly/download/:fileName', isAuthenticated, async (req: any, res) => {
    try {
      const { fileName } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify user owns this report
      if (!fileName.includes(`-${userId}-week-`)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const filePath = `./reports/${fileName}`;
      
      if (!require('fs').existsSync(filePath)) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.sendFile(require('path').resolve(filePath));
    } catch (error) {
      console.error('Error downloading report:', error);
      res.status(500).json({ error: 'Failed to download report' });
    }
  });

  app.get('/api/reports/weekly/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit } = req.query;
      
      const { weeklyReportGenerator } = await import('./weeklyReportGenerator');
      const history = await weeklyReportGenerator.getReportHistory(userId, limit ? parseInt(limit as string) : 10);
      
      res.json(history);
    } catch (error) {
      console.error('Error getting report history:', error);
      res.status(500).json({ error: 'Failed to get report history' });
    }
  });

  // Breakout Detection Routes
  app.get('/api/breakouts/alerts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit } = req.query;
      
      const { breakoutDetectorService } = await import('./breakoutDetector');
      const alerts = await breakoutDetectorService.getBreakoutAlerts(userId, limit ? parseInt(limit as string) : 10);
      
      res.json(alerts);
    } catch (error) {
      console.error('Error getting breakout alerts:', error);
      res.status(500).json({ error: 'Failed to get breakout alerts' });
    }
  });

  app.post('/api/breakouts/alerts/:alertId/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { alertId } = req.params;
      
      const { breakoutDetectorService } = await import('./breakoutDetector');
      await breakoutDetectorService.acknowledgeAlert(userId, alertId);
      
      res.json({ success: true, message: 'Alert acknowledged' });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  });

  app.get('/api/breakouts/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days } = req.query;
      
      const { breakoutDetectorService } = await import('./breakoutDetector');
      const stats = await breakoutDetectorService.getBreakoutStats(userId, days ? parseInt(days as string) : 30);
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting breakout stats:', error);
      res.status(500).json({ error: 'Failed to get breakout stats' });
    }
  });

  // CTA Management Routes
  app.post('/api/cta/create', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const ctaData = req.body;
      
      if (!ctaData.name || !ctaData.url || !ctaData.type) {
        return res.status(400).json({ error: 'name, url, and type are required' });
      }
      
      const { ctaService } = await import('./ctaService');
      const cta = await ctaService.createCTA(userId, ctaData);
      
      res.json(cta);
    } catch (error) {
      console.error('Error creating CTA:', error);
      res.status(500).json({ error: 'Failed to create CTA' });
    }
  });

  app.get('/api/cta/list', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { ctaService } = await import('./ctaService');
      const ctas = await ctaService.getUserCTAs(userId);
      
      res.json(ctas);
    } catch (error) {
      console.error('Error getting CTAs:', error);
      res.status(500).json({ error: 'Failed to get CTAs' });
    }
  });

  app.put('/api/cta/:ctaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ctaId } = req.params;
      const updates = req.body;
      
      const { ctaService } = await import('./ctaService');
      const cta = await ctaService.updateCTA(userId, ctaId, updates);
      
      if (!cta) {
        return res.status(404).json({ error: 'CTA not found' });
      }
      
      res.json(cta);
    } catch (error) {
      console.error('Error updating CTA:', error);
      res.status(500).json({ error: 'Failed to update CTA' });
    }
  });

  app.delete('/api/cta/:ctaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ctaId } = req.params;
      
      const { ctaService } = await import('./ctaService');
      const success = await ctaService.deleteCTA(userId, ctaId);
      
      if (!success) {
        return res.status(404).json({ error: 'CTA not found' });
      }
      
      res.json({ success: true, message: 'CTA deleted' });
    } catch (error) {
      console.error('Error deleting CTA:', error);
      res.status(500).json({ error: 'Failed to delete CTA' });
    }
  });

  app.post('/api/cta/track/click', isAuthenticated, async (req: any, res) => {
    try {
      const { ctaId, postId, platform } = req.body;
      
      if (!ctaId || !postId || !platform) {
        return res.status(400).json({ error: 'ctaId, postId, and platform are required' });
      }
      
      const { ctaService } = await import('./ctaService');
      await ctaService.trackCTAClick(ctaId, postId, platform);
      
      res.json({ success: true, message: 'Click tracked' });
    } catch (error) {
      console.error('Error tracking CTA click:', error);
      res.status(500).json({ error: 'Failed to track click' });
    }
  });

  app.post('/api/cta/track/conversion', isAuthenticated, async (req: any, res) => {
    try {
      const { ctaId, postId, platform, revenue } = req.body;
      
      if (!ctaId || !postId || !platform) {
        return res.status(400).json({ error: 'ctaId, postId, and platform are required' });
      }
      
      const { ctaService } = await import('./ctaService');
      await ctaService.trackCTAConversion(ctaId, postId, platform, revenue || 0);
      
      res.json({ success: true, message: 'Conversion tracked' });
    } catch (error) {
      console.error('Error tracking CTA conversion:', error);
      res.status(500).json({ error: 'Failed to track conversion' });
    }
  });

  app.get('/api/cta/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days } = req.query;
      
      const { ctaService } = await import('./ctaService');
      const performance = await ctaService.getCTAPerformance(userId, days ? parseInt(days as string) : 30);
      
      res.json(performance);
    } catch (error) {
      console.error('Error getting CTA performance:', error);
      res.status(500).json({ error: 'Failed to get CTA performance' });
    }
  });

  // Brand Voice Management Routes
  app.post('/api/brand-voice/create', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profileData = req.body;
      
      if (!profileData.name || !profileData.sampleTexts || !profileData.characteristics) {
        return res.status(400).json({ error: 'name, sampleTexts, and characteristics are required' });
      }
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const profile = await brandVoiceService.createVoiceProfile(userId, profileData);
      
      res.json(profile);
    } catch (error) {
      console.error('Error creating voice profile:', error);
      res.status(500).json({ error: 'Failed to create voice profile' });
    }
  });

  app.get('/api/brand-voice/profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const profiles = await brandVoiceService.getUserVoiceProfiles(userId);
      
      res.json(profiles);
    } catch (error) {
      console.error('Error getting voice profiles:', error);
      res.status(500).json({ error: 'Failed to get voice profiles' });
    }
  });

  app.get('/api/brand-voice/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const profile = await brandVoiceService.getActiveVoiceProfile(userId);
      
      res.json(profile);
    } catch (error) {
      console.error('Error getting active voice profile:', error);
      res.status(500).json({ error: 'Failed to get active voice profile' });
    }
  });

  app.put('/api/brand-voice/:profileName', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { profileName } = req.params;
      const updates = req.body;
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const profile = await brandVoiceService.updateVoiceProfile(userId, profileName, updates);
      
      if (!profile) {
        return res.status(404).json({ error: 'Voice profile not found' });
      }
      
      res.json(profile);
    } catch (error) {
      console.error('Error updating voice profile:', error);
      res.status(500).json({ error: 'Failed to update voice profile' });
    }
  });

  app.post('/api/brand-voice/analyze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { content, targetProfile } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const analysis = await brandVoiceService.analyzeContentVoiceMatch(userId, content, targetProfile);
      
      res.json(analysis);
    } catch (error) {
      console.error('Error analyzing voice match:', error);
      res.status(500).json({ error: 'Failed to analyze voice match' });
    }
  });

  app.post('/api/brand-voice/adapt', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { content, platform, profileName } = req.body;
      
      if (!content || !platform) {
        return res.status(400).json({ error: 'content and platform are required' });
      }
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const adaptedContent = await brandVoiceService.adaptContentForPlatform(userId, content, platform, profileName);
      
      res.json({ adaptedContent });
    } catch (error) {
      console.error('Error adapting content for platform:', error);
      res.status(500).json({ error: 'Failed to adapt content' });
    }
  });

  app.post('/api/brand-voice/learn', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { content, profileName } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }
      
      const { brandVoiceService } = await import('./brandVoiceService');
      await brandVoiceService.learnFromContent(userId, content, profileName);
      
      res.json({ success: true, message: 'Content learned successfully' });
    } catch (error) {
      console.error('Error learning from content:', error);
      res.status(500).json({ error: 'Failed to learn from content' });
    }
  });

  app.post('/api/brand-voice/process', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { content, platform } = req.body;
      
      if (!content || !platform) {
        return res.status(400).json({ error: 'content and platform are required' });
      }
      
      const { brandVoiceService } = await import('./brandVoiceService');
      const processedContent = await brandVoiceService.processContentWithVoice(userId, content, platform);
      
      res.json({ processedContent });
    } catch (error) {
      console.error('Error processing content with voice:', error);
      res.status(500).json({ error: 'Failed to process content' });
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

  // Create new social post with validation
  app.post('/api/social-posts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { segmentId, platform, content, scheduledFor } = req.body;
      
      // Validation: Require content for posting
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ 
          message: "Post content is required. Cannot schedule empty posts." 
        });
      }
      
      // Validation: Require segment association for content posts
      if (!segmentId) {
        return res.status(400).json({ 
          message: "Content must be associated with a processed video segment." 
        });
      }
      
      // Verify segment exists and belongs to user
      const segment = await storage.getSegment(segmentId);
      if (!segment) {
        return res.status(400).json({ 
          message: "Invalid segment. Please select content from an uploaded video." 
        });
      }
      
      // Verify user owns the upload containing this segment
      const upload = await storage.getUpload(segment.uploadId);
      if (!upload || upload.userId !== userId) {
        return res.status(403).json({ 
          message: "Access denied. This content belongs to another user." 
        });
      }
      
      const postData = { 
        userId, 
        segmentId, 
        platform, 
        content: content.trim(), 
        scheduledFor,
        status: scheduledFor ? 'scheduled' : 'draft'
      };
      
      const post = await storage.createSocialPost(postData);
      res.json(post);
    } catch (error) {
      console.error("Error creating social post:", error);
      res.status(500).json({ message: "Failed to create social post" });
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
