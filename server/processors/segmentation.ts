import { generateSegments } from "../openai";
import { storage } from "../storage";

export async function processSegmentation(uploadId: string, transcriptText: string) {
  try {
    console.log(`Starting segmentation for upload ${uploadId}`);
    
    // Check if segments already exist
    const existingSegments = await storage.getSegmentsByUploadId(uploadId);
    if (existingSegments.length > 0) {
      console.log(`Segments already exist for upload ${uploadId}`);
      return existingSegments;
    }

    // Generate segments using AI
    const segmentResults = await generateSegments(transcriptText);
    
    // Convert to database format
    const segmentsToInsert = segmentResults.map((segment, index) => ({
      uploadId,
      title: segment.title,
      summary: segment.summary,
      startTime: segment.startTime.toString(),
      endTime: segment.endTime.toString(),
      transcript: segment.transcript,
      order: index + 1,
    }));

    // Save segments to database
    const segments = await storage.createSegments(segmentsToInsert);
    
    console.log(`Segmentation completed for upload ${uploadId}, created ${segments.length} segments`);
    return segments;
    
  } catch (error) {
    console.error(`Segmentation failed for upload ${uploadId}:`, error);
    throw new Error(`Segmentation failed: ${error.message}`);
  }
}
