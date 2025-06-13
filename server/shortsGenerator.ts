import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { Segment } from '@shared/schema';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface ShortsConfig {
  width: number;
  height: number;
  subtitleStyle: {
    fontsize: number;
    fontcolor: string;
    fontfamily: string;
    boxcolor: string;
    boxborderw: number;
  };
  introOutroConfig?: {
    intro?: {
      duration: number;
      text: string;
      backgroundColor: string;
    };
    outro?: {
      duration: number;
      text: string;
      backgroundColor: string;
    };
  };
}

interface ShortsResult {
  outputPath: string;
  duration: number;
  size: number;
  format: string;
  resolution: string;
}

export class ShortsGenerator {
  private defaultConfig: ShortsConfig = {
    width: 1080,
    height: 1920, // 9:16 aspect ratio
    subtitleStyle: {
      fontsize: 48,
      fontcolor: 'white',
      fontfamily: 'Arial',
      boxcolor: 'black@0.7',
      boxborderw: 8
    }
  };

  async generateVerticalShort(
    originalVideoPath: string,
    segment: Segment,
    outputDir: string,
    config?: Partial<ShortsConfig>
  ): Promise<ShortsResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const outputPath = path.join(outputDir, `short_${segment.id}.mp4`);
    
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      // Generate SRT subtitle file
      const srtPath = await this.generateSRTFile(segment, outputDir);
      
      // Calculate start and end times
      const startTime = parseFloat(segment.startTime);
      const endTime = parseFloat(segment.endTime);
      const duration = endTime - startTime;
      
      return new Promise((resolve, reject) => {
        let command = ffmpeg(originalVideoPath)
          .seekInput(startTime)
          .duration(duration)
          // Resize and crop to 9:16 vertical format
          .videoFilters([
            `scale=${finalConfig.width}:${finalConfig.height}:force_original_aspect_ratio=increase`,
            `crop=${finalConfig.width}:${finalConfig.height}`,
            // Burn in subtitles
            `subtitles=${srtPath}:force_style='FontSize=${finalConfig.subtitleStyle.fontsize},FontName=${finalConfig.subtitleStyle.fontfamily},PrimaryColour=${this.convertColorToASS(finalConfig.subtitleStyle.fontcolor)},OutlineColour=${this.convertColorToASS(finalConfig.subtitleStyle.boxcolor)},BorderStyle=3,Outline=${finalConfig.subtitleStyle.boxborderw}'`
          ])
          // Output settings optimized for social media
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate('128k')
          .videoBitrate('2000k')
          .fps(30)
          .format('mp4')
          .outputOptions([
            '-preset fast',
            '-crf 23',
            '-movflags +faststart'
          ]);

        // Add intro/outro if configured
        if (finalConfig.introOutroConfig?.intro || finalConfig.introOutroConfig?.outro) {
          command = await this.addIntroOutro(command, finalConfig.introOutroConfig, outputDir);
        }

        command
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log(`[ShortsGenerator] Starting FFmpeg process: ${commandLine}`);
          })
          .on('progress', (progress) => {
            console.log(`[ShortsGenerator] Processing: ${Math.round(progress.percent || 0)}% done`);
          })
          .on('end', async () => {
            try {
              const stats = await fs.stat(outputPath);
              const result: ShortsResult = {
                outputPath,
                duration,
                size: stats.size,
                format: 'mp4',
                resolution: `${finalConfig.width}x${finalConfig.height}`
              };
              
              // Cleanup temporary SRT file
              await fs.unlink(srtPath).catch(() => {});
              
              resolve(result);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            console.error('[ShortsGenerator] FFmpeg error:', error);
            reject(error);
          })
          .run();
      });
    } catch (error) {
      console.error('[ShortsGenerator] Error generating vertical short:', error);
      throw error;
    }
  }

  private async generateSRTFile(segment: Segment, outputDir: string): Promise<string> {
    const srtPath = path.join(outputDir, `subtitle_${segment.id}.srt`);
    
    // Generate simple SRT content based on segment transcript
    const transcript = segment.transcript || segment.summary || '';
    const words = transcript.split(' ');
    const wordsPerSubtitle = 8;
    const duration = parseFloat(segment.endTime) - parseFloat(segment.startTime);
    const subtitleDuration = duration / Math.ceil(words.length / wordsPerSubtitle);
    
    let srtContent = '';
    let subtitleIndex = 1;
    
    for (let i = 0; i < words.length; i += wordsPerSubtitle) {
      const subtitleWords = words.slice(i, i + wordsPerSubtitle);
      const startTime = (i / wordsPerSubtitle) * subtitleDuration;
      const endTime = Math.min(((i / wordsPerSubtitle) + 1) * subtitleDuration, duration);
      
      srtContent += `${subtitleIndex}\n`;
      srtContent += `${this.formatSRTTime(startTime)} --> ${this.formatSRTTime(endTime)}\n`;
      srtContent += `${subtitleWords.join(' ')}\n\n`;
      
      subtitleIndex++;
    }
    
    await fs.writeFile(srtPath, srtContent, 'utf-8');
    return srtPath;
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  private convertColorToASS(color: string): string {
    // Convert CSS color names to ASS format (BGR hex)
    const colorMap: { [key: string]: string } = {
      'white': '&HFFFFFF',
      'black': '&H000000',
      'red': '&H0000FF',
      'green': '&H00FF00',
      'blue': '&HFF0000',
      'yellow': '&H00FFFF'
    };
    
    return colorMap[color.toLowerCase()] || '&HFFFFFF';
  }

  private async addIntroOutro(
    command: ffmpeg.FfmpegCommand, 
    config: ShortsConfig['introOutroConfig'], 
    outputDir: string
  ): Promise<ffmpeg.FfmpegCommand> {
    // This would generate intro/outro video clips and concatenate them
    // For now, return the original command
    // In a full implementation, you'd create text overlays or video clips
    return command;
  }

  async batchGenerateShorts(
    originalVideoPath: string,
    segments: Segment[],
    outputDir: string,
    config?: Partial<ShortsConfig>
  ): Promise<ShortsResult[]> {
    const results: ShortsResult[] = [];
    
    console.log(`[ShortsGenerator] Generating ${segments.length} vertical shorts...`);
    
    for (const segment of segments) {
      try {
        const result = await this.generateVerticalShort(originalVideoPath, segment, outputDir, config);
        results.push(result);
        console.log(`[ShortsGenerator] Generated short for segment ${segment.id}: ${result.outputPath}`);
      } catch (error) {
        console.error(`[ShortsGenerator] Failed to generate short for segment ${segment.id}:`, error);
      }
    }
    
    return results;
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    format: string;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }
        
        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }
}

export const shortsGenerator = new ShortsGenerator();