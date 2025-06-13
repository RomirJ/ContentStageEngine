import { transcribeAudio } from "../openai";
import { storage } from "../storage";
import type { Upload } from "@shared/schema";
import path from "path";

export async function processTranscription(upload: Upload) {
  try {
    console.log(`Starting transcription for upload ${upload.id}`);
    
    // Check if transcript already exists
    const existingTranscript = await storage.getTranscriptByUploadId(upload.id);
    if (existingTranscript) {
      console.log(`Transcript already exists for upload ${upload.id}`);
      return existingTranscript;
    }

    // Perform transcription
    const transcriptionResult = await transcribeAudio(upload.filePath);
    
    // Save transcript to database
    const transcript = await storage.createTranscript({
      uploadId: upload.id,
      text: transcriptionResult.text,
      wordTimestamps: transcriptionResult.words ? JSON.stringify(transcriptionResult.words) : null,
      language: transcriptionResult.language,
      confidence: transcriptionResult.duration?.toString(),
    });

    console.log(`Transcription completed for upload ${upload.id}`);
    return transcript;
    
  } catch (error) {
    console.error(`Transcription failed for upload ${upload.id}:`, error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}
