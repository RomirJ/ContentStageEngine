import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { processTranscription } from "./processors/transcription";
import { processSegmentation } from "./processors/segmentation";
import { processClipGeneration } from "./processors/clipGeneration";

export interface FileUploadResult {
  success: boolean;
  uploadId?: string;
  error?: string;
}

export async function processFile(uploadId: string): Promise<void> {
  try {
    console.log(`Starting processing for upload ${uploadId}`);
    
    const upload = await storage.getUpload(uploadId);
    if (!upload) {
      throw new Error('Upload not found');
    }

    // Step 1: Transcription
    await storage.updateUploadStatus(uploadId, 'transcribing');
    console.log(`Transcribing upload ${uploadId}`);
    
    const transcript = await processTranscription(upload);
    console.log(`Transcription completed for upload ${uploadId}`);

    // Step 2: Segmentation
    await storage.updateUploadStatus(uploadId, 'segmenting');
    console.log(`Segmenting upload ${uploadId}`);
    
    const segments = await processSegmentation(uploadId, transcript.text);
    console.log(`Segmentation completed for upload ${uploadId}, created ${segments.length} segments`);

    // Step 3: Clip Generation
    await storage.updateUploadStatus(uploadId, 'processing');
    console.log(`Processing clips for upload ${uploadId}`);
    
    await processClipGeneration(segments);
    console.log(`Clip generation completed for upload ${uploadId}`);

    // Mark as completed
    await storage.updateUploadStatus(uploadId, 'completed');
    console.log(`Processing completed for upload ${uploadId}`);

  } catch (error) {
    console.error(`Processing failed for upload ${uploadId}:`, error);
    await storage.updateUploadStatus(uploadId, 'failed');
    throw error;
  }
}

export function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
  };
  return mimeMap[mimeType] || '.unknown';
}

export function validateFileType(mimeType: string): boolean {
  const allowedTypes = [
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav'
  ];
  return allowedTypes.includes(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

// Cleanup function to remove old files
export async function cleanupOldFiles(maxAgeHours: number = 24 * 7): Promise<void> {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const clipsDir = path.join(process.cwd(), 'clips');
    
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    for (const dir of [uploadsDir, clipsDir]) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old file: ${filePath}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

async function handleUpload(file: any, userId: string): Promise<FileUploadResult> {
  try {
    if (!validateFileType(file.mimetype)) {
      return {
        success: false,
        error: 'Invalid file type. Only MP4, MOV, MP3, and WAV files are allowed.'
      };
    }

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

    return {
      success: true,
      uploadId: upload.id
    };
  } catch (error) {
    console.error('Upload handling error:', error);
    return {
      success: false,
      error: 'Upload failed'
    };
  }
}

export const fileUpload = {
  handleUpload,
  validateFileType,
  getFileExtension,
  formatFileSize,
  formatDuration,
};
