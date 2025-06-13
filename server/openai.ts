import OpenAI from "openai";
import fs from "fs";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export interface TranscriptionResult {
  text: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  language?: string;
  duration?: number;
}

export interface SegmentResult {
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  transcript: string;
}

export async function transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
  try {
    const audioStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    return {
      text: transcription.text,
      words: transcription.words?.map(word => ({
        word: word.word,
        start: word.start,
        end: word.end,
      })),
      language: transcription.language,
      duration: transcription.duration,
    };
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

export async function generateSegments(transcript: string): Promise<SegmentResult[]> {
  try {
    const prompt = `Analyze this transcript and break it down into 3-7 meaningful segments that would make good content clips. Each segment should be a distinct topic or key insight.

For each segment, provide:
- A compelling title
- A brief summary
- The approximate start and end times (in seconds, estimate based on word position)
- The exact transcript text for that segment

Transcript: "${transcript}"

Respond with JSON in this format:
{
  "segments": [
    {
      "title": "string",
      "summary": "string", 
      "startTime": number,
      "endTime": number,
      "transcript": "string"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert content strategist who identifies the most engaging segments from video/audio content for social media repurposing."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.segments || [];
  } catch (error) {
    console.error('Segmentation error:', error);
    throw new Error(`Failed to generate segments: ${error.message}`);
  }
}

export async function generateSocialContent(segment: SegmentResult, platform: string): Promise<string> {
  try {
    const platformPrompts = {
      twitter: "Create a compelling Twitter thread (2-3 tweets) based on this content. Make it engaging and shareable.",
      linkedin: "Create a professional LinkedIn post that provides value and encourages engagement.",
      instagram: "Create an Instagram caption that's engaging and includes relevant hashtags.",
      youtube: "Create a YouTube Shorts description that's catchy and encourages views.",
    };

    const prompt = `${platformPrompts[platform] || platformPrompts.twitter}

Content Title: ${segment.title}
Content Summary: ${segment.summary}
Transcript: ${segment.transcript}

Create content that captures the key insight and makes it engaging for ${platform}.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system", 
          content: "You are a social media expert who creates engaging content optimized for different platforms."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Social content generation error:', error);
    throw new Error(`Failed to generate social content: ${error.message}`);
  }
}

export async function generateQuoteGraphic(segment: SegmentResult): Promise<string> {
  try {
    const prompt = `Extract the most powerful, quotable sentence or insight from this content for a quote graphic.

Title: ${segment.title}
Summary: ${segment.summary}
Transcript: ${segment.transcript}

Return just the quote text that would work well on a visual quote graphic - keep it under 30 words and impactful.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at identifying the most powerful, shareable quotes from content."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      temperature: 0.3,
    });

    return response.choices[0].message.content?.trim() || segment.title;
  } catch (error) {
    console.error('Quote generation error:', error);
    throw new Error(`Failed to generate quote: ${error.message}`);
  }
}
