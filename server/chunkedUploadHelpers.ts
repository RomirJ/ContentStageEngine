import fs from 'fs';
import path from 'path';
import { oauthService } from './oauthService';

interface UploadSession {
  id: string;
  platform: string;
  fileName: string;
  fileSize: number;
  uploadUrl?: string;
  uploadId?: string;
  chunks: Array<{
    index: number;
    size: number;
    uploaded: boolean;
    etag?: string;
  }>;
  status: 'initialized' | 'uploading' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

interface ChunkUploadResult {
  success: boolean;
  etag?: string;
  error?: string;
  bytesUploaded?: number;
}

export class ChunkedUploadHelpers {
  private readonly CHUNK_SIZE = 256 * 1024 * 1024; // 256MB chunks
  private uploadSessions: Map<string, UploadSession> = new Map();

  // YouTube Resumable Upload
  async initializeYouTubeUpload(userId: string, filePath: string, metadata: {
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: 'private' | 'public' | 'unlisted';
  }): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'youtube');
      if (!accessToken) {
        throw new Error('YouTube access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // Initialize resumable upload session
      const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': fileStats.size.toString(),
          'X-Upload-Content-Type': 'video/*'
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags || [],
            categoryId: metadata.categoryId || '22' // People & Blogs
          },
          status: {
            privacyStatus: metadata.privacyStatus || 'private'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`YouTube upload initialization failed: ${response.status}`);
      }

      const uploadUrl = response.headers.get('location');
      if (!uploadUrl) {
        throw new Error('YouTube upload URL not received');
      }

      const sessionId = `youtube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        platform: 'youtube',
        fileName,
        fileSize: fileStats.size,
        uploadUrl,
        chunks,
        status: 'initialized',
        createdAt: new Date()
      };

      this.uploadSessions.set(sessionId, session);
      console.log(`[ChunkedUpload] YouTube upload session initialized: ${sessionId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] YouTube initialization error:', error);
      throw error;
    }
  }

  async uploadYouTubeChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    try {
      const session = this.uploadSessions.get(sessionId);
      if (!session || session.platform !== 'youtube') {
        throw new Error('Invalid YouTube upload session');
      }

      const chunk = session.chunks[chunkIndex];
      if (!chunk) {
        throw new Error('Invalid chunk index');
      }

      const startByte = chunkIndex * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);
      const chunkSize = endByte - startByte + 1;

      // Read chunk from file
      const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
      const chunkBuffer = await this.streamToBuffer(fileStream);

      const response = await fetch(session.uploadUrl!, {
        method: 'PUT',
        headers: {
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${startByte}-${endByte}/${session.fileSize}`
        },
        body: chunkBuffer
      });

      if (response.status === 308) {
        // Chunk uploaded successfully, more chunks needed
        chunk.uploaded = true;
        session.status = 'uploading';
        
        console.log(`[ChunkedUpload] YouTube chunk ${chunkIndex} uploaded successfully`);
        return { success: true, bytesUploaded: chunkSize };
      } else if (response.status === 200 || response.status === 201) {
        // Upload completed
        chunk.uploaded = true;
        session.status = 'completed';
        session.completedAt = new Date();
        
        const videoData = await response.json();
        console.log(`[ChunkedUpload] YouTube upload completed: ${videoData.id}`);
        
        return { success: true, bytesUploaded: chunkSize };
      } else {
        throw new Error(`YouTube chunk upload failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`[ChunkedUpload] YouTube chunk ${chunkIndex} error:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // X (Twitter) Chunked Upload (INIT/APPEND/FINALIZE)
  async initializeXUpload(userId: string, filePath: string, mediaType: 'video' | 'image'): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'twitter');
      if (!accessToken) {
        throw new Error('X access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // INIT phase
      const initResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          command: 'INIT',
          total_bytes: fileStats.size.toString(),
          media_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
          media_category: mediaType === 'video' ? 'tweet_video' : 'tweet_image'
        })
      });

      if (!initResponse.ok) {
        throw new Error(`X upload initialization failed: ${initResponse.status}`);
      }

      const initData = await initResponse.json();
      const mediaId = initData.media_id_string;

      const sessionId = `twitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        platform: 'twitter',
        fileName,
        fileSize: fileStats.size,
        uploadId: mediaId,
        chunks,
        status: 'initialized',
        createdAt: new Date()
      };

      this.uploadSessions.set(sessionId, session);
      console.log(`[ChunkedUpload] X upload session initialized: ${sessionId}, media_id: ${mediaId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] X initialization error:', error);
      throw error;
    }
  }

  async uploadXChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    try {
      const session = this.uploadSessions.get(sessionId);
      if (!session || session.platform !== 'twitter') {
        throw new Error('Invalid X upload session');
      }

      const accessToken = await oauthService.getValidToken(session.id.split('_')[0], 'twitter');
      if (!accessToken) {
        throw new Error('X access token not available');
      }

      const chunk = session.chunks[chunkIndex];
      if (!chunk) {
        throw new Error('Invalid chunk index');
      }

      const startByte = chunkIndex * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);

      // Read chunk from file
      const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
      const chunkBuffer = await this.streamToBuffer(fileStream);

      // APPEND phase
      const formData = new FormData();
      formData.append('command', 'APPEND');
      formData.append('media_id', session.uploadId!);
      formData.append('segment_index', chunkIndex.toString());
      formData.append('media', new Blob([chunkBuffer]));

      const response = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      if (response.ok) {
        chunk.uploaded = true;
        session.status = 'uploading';
        
        console.log(`[ChunkedUpload] X chunk ${chunkIndex} uploaded successfully`);
        return { success: true, bytesUploaded: chunkBuffer.length };
      } else {
        throw new Error(`X chunk upload failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`[ChunkedUpload] X chunk ${chunkIndex} error:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async finalizeXUpload(sessionId: string): Promise<{ success: boolean; mediaId?: string; error?: string }> {
    try {
      const session = this.uploadSessions.get(sessionId);
      if (!session || session.platform !== 'twitter') {
        throw new Error('Invalid X upload session');
      }

      const accessToken = await oauthService.getValidToken(session.id.split('_')[0], 'twitter');
      if (!accessToken) {
        throw new Error('X access token not available');
      }

      // FINALIZE phase
      const finalizeResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          command: 'FINALIZE',
          media_id: session.uploadId!
        })
      });

      if (finalizeResponse.ok) {
        const finalizeData = await finalizeResponse.json();
        session.status = 'completed';
        session.completedAt = new Date();
        
        console.log(`[ChunkedUpload] X upload finalized: ${session.uploadId}`);
        return { success: true, mediaId: session.uploadId };
      } else {
        throw new Error(`X upload finalization failed: ${finalizeResponse.status}`);
      }
    } catch (error) {
      console.error('[ChunkedUpload] X finalization error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // TikTok Multipart Upload
  async initializeTikTokUpload(userId: string, filePath: string): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'tiktok');
      if (!accessToken) {
        throw new Error('TikTok access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // Initialize multipart upload
      const response = await fetch('https://open-api.tiktok.com/video/upload/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileStats.size,
            chunk_size: this.CHUNK_SIZE,
            total_chunk_count: Math.ceil(fileStats.size / this.CHUNK_SIZE)
          }
        })
      });

      if (!response.ok) {
        throw new Error(`TikTok upload initialization failed: ${response.status}`);
      }

      const initData = await response.json();
      const uploadUrl = initData.data.upload_url;
      const uploadId = initData.data.upload_id;

      const sessionId = `tiktok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        platform: 'tiktok',
        fileName,
        fileSize: fileStats.size,
        uploadUrl,
        uploadId,
        chunks,
        status: 'initialized',
        createdAt: new Date()
      };

      this.uploadSessions.set(sessionId, session);
      console.log(`[ChunkedUpload] TikTok upload session initialized: ${sessionId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] TikTok initialization error:', error);
      throw error;
    }
  }

  async uploadTikTokChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    try {
      const session = this.uploadSessions.get(sessionId);
      if (!session || session.platform !== 'tiktok') {
        throw new Error('Invalid TikTok upload session');
      }

      const chunk = session.chunks[chunkIndex];
      if (!chunk) {
        throw new Error('Invalid chunk index');
      }

      const startByte = chunkIndex * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);

      // Read chunk from file
      const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
      const chunkBuffer = await this.streamToBuffer(fileStream);

      const formData = new FormData();
      formData.append('upload_id', session.uploadId!);
      formData.append('chunk_index', chunkIndex.toString());
      formData.append('chunk_data', new Blob([chunkBuffer]));

      const response = await fetch(session.uploadUrl!, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        chunk.uploaded = true;
        session.status = 'uploading';
        
        console.log(`[ChunkedUpload] TikTok chunk ${chunkIndex} uploaded successfully`);
        return { success: true, bytesUploaded: chunkBuffer.length };
      } else {
        throw new Error(`TikTok chunk upload failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`[ChunkedUpload] TikTok chunk ${chunkIndex} error:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private calculateChunks(fileSize: number): Array<{ index: number; size: number; uploaded: boolean }> {
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const chunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
      const chunkSize = endByte - startByte + 1;

      chunks.push({
        index: i,
        size: chunkSize,
        uploaded: false
      });
    }

    return chunks;
  }

  private async streamToBuffer(stream: fs.ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // Session management
  getUploadSession(sessionId: string): UploadSession | undefined {
    return this.uploadSessions.get(sessionId);
  }

  getAllSessions(userId?: string): UploadSession[] {
    const sessions = Array.from(this.uploadSessions.values());
    return userId ? sessions.filter(s => s.id.includes(userId)) : sessions;
  }

  deleteSession(sessionId: string): boolean {
    return this.uploadSessions.delete(sessionId);
  }

  getUploadProgress(sessionId: string): {
    totalChunks: number;
    uploadedChunks: number;
    percentComplete: number;
    bytesUploaded: number;
    totalBytes: number;
  } {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      return {
        totalChunks: 0,
        uploadedChunks: 0,
        percentComplete: 0,
        bytesUploaded: 0,
        totalBytes: 0
      };
    }

    const uploadedChunks = session.chunks.filter(c => c.uploaded).length;
    const bytesUploaded = session.chunks
      .filter(c => c.uploaded)
      .reduce((sum, c) => sum + c.size, 0);

    return {
      totalChunks: session.chunks.length,
      uploadedChunks,
      percentComplete: (uploadedChunks / session.chunks.length) * 100,
      bytesUploaded,
      totalBytes: session.fileSize
    };
  }
}

export const chunkedUploadHelpers = new ChunkedUploadHelpers();