// Simple test script to validate upload functionality
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a simple test audio file content (WAV header + silence)
const createTestWavFile = () => {
  const sampleRate = 22050;
  const duration = 3; // 3 seconds
  const numSamples = sampleRate * duration;
  const bufferSize = 44 + numSamples * 2; // WAV header + 16-bit samples

  const buffer = Buffer.alloc(bufferSize);
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(1, 22); // num channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  // Fill with silence (zeros)
  buffer.fill(0, 44);
  
  return buffer;
};

// Create test file
const testFilePath = path.join(__dirname, 'test_audio.wav');
const wavData = createTestWavFile();
fs.writeFileSync(testFilePath, wavData);

console.log(`Created test WAV file: ${testFilePath}`);
console.log(`File size: ${fs.statSync(testFilePath).size} bytes`);
console.log('Ready for upload testing');