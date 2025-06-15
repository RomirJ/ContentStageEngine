import { generateSocialContent, generateQuoteGraphic } from "../openai";
import { storage } from "../storage";
import type { Segment } from "@shared/schema";
import path from "path";
import fs from "fs";

export async function processClipGeneration(segments: Segment[]) {
  try {
    console.log(`Starting clip generation for ${segments.length} segments`);
    
    const clipsDir = path.join(process.cwd(), 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    for (const segment of segments) {
      await generateClipsForSegment(segment);
    }
    
    console.log(`Clip generation completed for all segments`);
    
  } catch (error) {
    const err = error as any;
    console.error(`Clip generation failed:`, err);
    throw new Error(`Clip generation failed: ${err.message}`);
  }
}

async function generateClipsForSegment(segment: Segment) {
  try {
    console.log(`Generating clips for segment ${segment.id}: ${segment.title}`);
    
    const segmentData = {
      title: segment.title,
      summary: segment.summary || '',
      startTime: parseFloat(segment.startTime),
      endTime: parseFloat(segment.endTime),
      transcript: segment.transcript || '',
    };

    // Generate different types of content
    const clipTypes = [
      { type: 'vertical_short', platform: 'tiktok' },
      { type: 'social_post', platform: 'twitter' },
      { type: 'social_post', platform: 'linkedin' },
      { type: 'quote_graphic', platform: 'instagram' },
    ];

    for (const clipType of clipTypes) {
      try {
        let content = '';
        
        if (clipType.type === 'quote_graphic') {
          content = await generateQuoteGraphic(segmentData);
        } else {
          content = await generateSocialContent(segmentData, clipType.platform);
        }

        // Create clip record
        await storage.createClip({
          segmentId: segment.id,
          type: clipType.type,
          content,
          metadata: JSON.stringify({
            platform: clipType.platform,
            duration: segmentData.endTime - segmentData.startTime,
          }),
          status: 'completed',
        });

        console.log(`Generated ${clipType.type} clip for ${clipType.platform}`);
        
      } catch (error) {
        const err = error as any;
        console.error(`Failed to generate ${clipType.type} for ${clipType.platform}:`, err);
        
        // Create failed clip record
        await storage.createClip({
          segmentId: segment.id,
          type: clipType.type,
          content: '',
          metadata: JSON.stringify({
            platform: clipType.platform,
            error: err.message,
          }),
          status: 'failed',
        });
      }
    }
    
    console.log(`Completed clip generation for segment ${segment.id}`);
    
  } catch (error) {
    const err = error as any;
    console.error(`Failed to generate clips for segment ${segment.id}:`, err);
    throw err;
  }
}

// Mock video processing for vertical shorts
async function generateVerticalShort(segment: Segment): Promise<string> {
  // In a real implementation, this would use FFmpeg to:
  // 1. Extract the segment from the original video
  // 2. Resize to 9:16 aspect ratio
  // 3. Add captions/subtitles
  // 4. Save as MP4
  
  // For now, return a placeholder path
  const filename = `vertical_${segment.id}_${Date.now()}.mp4`;
  const filePath = path.join(process.cwd(), 'clips', filename);
  
  // Create placeholder file
  fs.writeFileSync(filePath, 'placeholder video content');
  
  return filePath;
}
