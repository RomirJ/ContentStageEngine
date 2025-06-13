import { storage } from "../storage";
import { generateSocialContent, generateQuoteGraphic } from "../openai";
import type { Segment } from "@shared/schema";

export async function processSocialContent(uploadId: string) {
  try {
    console.log(`Starting social content generation for upload ${uploadId}`);
    
    const segments = await storage.getSegmentsByUploadId(uploadId);
    if (!segments.length) {
      throw new Error('No segments found for upload');
    }

    // Generate content for each platform and segment
    const platforms = ['tiktok', 'instagram', 'linkedin', 'twitter'];
    const contentPromises = [];

    for (const segment of segments) {
      for (const platform of platforms) {
        contentPromises.push(generateContentForSegment(segment, platform));
      }
    }

    await Promise.all(contentPromises);
    console.log(`Social content generation completed for upload ${uploadId}`);
    
  } catch (error) {
    console.error(`Social content generation failed for upload ${uploadId}:`, error);
    throw new Error(`Social content generation failed: ${error.message}`);
  }
}

async function generateContentForSegment(segment: Segment, platform: string) {
  try {
    // Convert segment to SegmentResult format for OpenAI functions
    const segmentResult = {
      title: segment.title,
      summary: segment.summary || '',
      startTime: parseInt(segment.startTime),
      endTime: parseInt(segment.endTime),
      transcript: segment.transcript || '',
    };

    // Generate text content
    const content = await generateSocialContent(segmentResult, platform);
    
    // Create social post record
    await storage.createSocialPost({
      segmentId: segment.id,
      platform,
      content,
      status: 'draft',
      scheduledFor: null,
    });

    // Generate quote graphic for visual platforms
    if (['instagram', 'linkedin', 'twitter'].includes(platform)) {
      try {
        const quoteGraphic = await generateQuoteGraphic(segmentResult);
        
        await storage.createSocialPost({
          segmentId: segment.id,
          platform: `${platform}_graphic`,
          content: quoteGraphic,
          status: 'draft',
          scheduledFor: null,
        });
      } catch (graphicError) {
        console.warn(`Quote graphic generation failed for ${platform}:`, graphicError.message);
      }
    }

  } catch (error: any) {
    console.error(`Content generation failed for segment ${segment.id} on ${platform}:`, error.message);
  }
}