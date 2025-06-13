// Direct test of the processing pipeline
import { transcribeAudio, generateSegments } from './server/openai.js';
import { storage } from './server/storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testProcessing() {
  try {
    console.log('Testing AI processing pipeline...');
    
    // Test transcription with the test audio file
    const testAudioPath = path.join(__dirname, 'test_audio.wav');
    console.log('Transcribing test audio...');
    
    const transcriptionResult = await transcribeAudio(testAudioPath);
    console.log('Transcription result:', transcriptionResult);
    
    // Test segmentation
    console.log('Generating segments...');
    const segments = await generateSegments(transcriptionResult.text);
    console.log('Segments generated:', segments.length);
    
    console.log('Processing pipeline test completed successfully');
    
  } catch (error) {
    console.error('Processing pipeline test failed:', error);
  }
}

testProcessing();