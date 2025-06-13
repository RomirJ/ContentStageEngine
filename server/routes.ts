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

      res.json({
        ...upload,
        transcript,
        segments,
        clips,
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
