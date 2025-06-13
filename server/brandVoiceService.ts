import OpenAI from 'openai';
import { storage } from './storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface VoiceProfile {
  userId: string;
  name: string;
  description: string;
  sampleTexts: string[];
  embedding: number[];
  characteristics: {
    tone: string;
    formality: 'casual' | 'professional' | 'mixed';
    lengthPreference: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'minimal' | 'moderate' | 'heavy';
    hashtagStyle: 'minimal' | 'targeted' | 'trending' | 'comprehensive';
    callToActionStyle: 'subtle' | 'direct' | 'urgent';
  };
  platformAdaptations: {
    [platform: string]: {
      maxLength: number;
      formatPreferences: string[];
      specificTone?: string;
    };
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface VoiceAnalysis {
  similarity: number;
  matchingCharacteristics: string[];
  suggestions: string[];
  adaptedContent: string;
}

export class BrandVoiceService {
  private voiceProfiles: Map<string, VoiceProfile[]> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();

  // Voice Profile Management
  async createVoiceProfile(userId: string, profileData: {
    name: string;
    description: string;
    sampleTexts: string[];
    characteristics: VoiceProfile['characteristics'];
    platformAdaptations?: VoiceProfile['platformAdaptations'];
  }): Promise<VoiceProfile> {
    try {
      // Generate embedding from sample texts
      const embedding = await this.generateVoiceEmbedding(profileData.sampleTexts);
      
      const profile: VoiceProfile = {
        userId,
        name: profileData.name,
        description: profileData.description,
        sampleTexts: profileData.sampleTexts,
        embedding,
        characteristics: profileData.characteristics,
        platformAdaptations: profileData.platformAdaptations || this.getDefaultPlatformAdaptations(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const userProfiles = this.voiceProfiles.get(userId) || [];
      userProfiles.push(profile);
      this.voiceProfiles.set(userId, userProfiles);

      console.log(`[BrandVoice] Created voice profile: ${profile.name} for user ${userId}`);
      return profile;
    } catch (error) {
      console.error('[BrandVoice] Error creating voice profile:', error);
      throw error;
    }
  }

  private async generateVoiceEmbedding(sampleTexts: string[]): Promise<number[]> {
    try {
      // Combine sample texts into a representative corpus
      const combinedText = sampleTexts.join('\n\n');
      
      // Check cache first
      const cacheKey = this.hashText(combinedText);
      if (this.embeddingCache.has(cacheKey)) {
        return this.embeddingCache.get(cacheKey)!;
      }

      // Generate embedding using OpenAI
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: combinedText,
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error('[BrandVoice] Error generating embedding:', error);
      throw error;
    }
  }

  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  async updateVoiceProfile(userId: string, profileName: string, updates: Partial<VoiceProfile>): Promise<VoiceProfile | null> {
    const userProfiles = this.voiceProfiles.get(userId) || [];
    const profileIndex = userProfiles.findIndex(p => p.name === profileName);
    
    if (profileIndex === -1) return null;

    const profile = userProfiles[profileIndex];
    
    // If sample texts changed, regenerate embedding
    if (updates.sampleTexts && updates.sampleTexts !== profile.sampleTexts) {
      updates.embedding = await this.generateVoiceEmbedding(updates.sampleTexts);
    }

    userProfiles[profileIndex] = {
      ...profile,
      ...updates,
      updatedAt: new Date()
    };

    this.voiceProfiles.set(userId, userProfiles);
    return userProfiles[profileIndex];
  }

  async getUserVoiceProfiles(userId: string): Promise<VoiceProfile[]> {
    return this.voiceProfiles.get(userId) || [];
  }

  async getActiveVoiceProfile(userId: string): Promise<VoiceProfile | null> {
    const profiles = await this.getUserVoiceProfiles(userId);
    return profiles.find(p => p.isActive) || null;
  }

  // Content Analysis and Matching
  async analyzeContentVoiceMatch(userId: string, content: string, targetProfile?: string): Promise<VoiceAnalysis> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = targetProfile 
        ? profiles.find(p => p.name === targetProfile)
        : profiles.find(p => p.isActive);

      if (!profile) {
        throw new Error('No voice profile found');
      }

      // Generate embedding for the content
      const contentEmbedding = await this.generateContentEmbedding(content);
      
      // Calculate similarity
      const similarity = this.calculateCosineSimilarity(contentEmbedding, profile.embedding);
      
      // Analyze characteristics match
      const characteristicsAnalysis = await this.analyzeCharacteristics(content, profile.characteristics);
      
      // Generate improvement suggestions
      const suggestions = await this.generateVoiceImprovementSuggestions(content, profile, similarity);
      
      // Adapt content to match voice
      const adaptedContent = await this.adaptContentToVoice(content, profile);

      return {
        similarity,
        matchingCharacteristics: characteristicsAnalysis.matching,
        suggestions,
        adaptedContent
      };
    } catch (error) {
      console.error('[BrandVoice] Error analyzing voice match:', error);
      throw error;
    }
  }

  private async generateContentEmbedding(content: string): Promise<number[]> {
    const cacheKey = this.hashText(content);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content,
      encoding_format: "float"
    });

    const embedding = response.data[0].embedding;
    this.embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  }

  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private async analyzeCharacteristics(content: string, targetCharacteristics: VoiceProfile['characteristics']): Promise<{
    matching: string[];
    nonMatching: string[];
  }> {
    try {
      const prompt = `
        Analyze this content against the target voice characteristics:
        
        Content: "${content}"
        
        Target Characteristics:
        - Tone: ${targetCharacteristics.tone}
        - Formality: ${targetCharacteristics.formality}
        - Length Preference: ${targetCharacteristics.lengthPreference}
        - Emoji Usage: ${targetCharacteristics.emojiUsage}
        - Hashtag Style: ${targetCharacteristics.hashtagStyle}
        - CTA Style: ${targetCharacteristics.callToActionStyle}
        
        Return JSON: {
          "matching": ["characteristic1", "characteristic2"],
          "nonMatching": ["characteristic3", "characteristic4"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{"matching":[],"nonMatching":[]}');
      return analysis;
    } catch (error) {
      console.error('[BrandVoice] Error analyzing characteristics:', error);
      return { matching: [], nonMatching: [] };
    }
  }

  private async generateVoiceImprovementSuggestions(
    content: string, 
    profile: VoiceProfile, 
    similarity: number
  ): Promise<string[]> {
    try {
      const prompt = `
        Generate specific improvement suggestions to better match this content to the brand voice:
        
        Content: "${content}"
        Current similarity: ${(similarity * 100).toFixed(1)}%
        
        Target Voice Profile:
        - Name: ${profile.name}
        - Description: ${profile.description}
        - Tone: ${profile.characteristics.tone}
        - Formality: ${profile.characteristics.formality}
        - Sample texts: ${profile.sampleTexts.slice(0, 2).join(' | ')}
        
        Provide 3-5 specific, actionable suggestions as a JSON array of strings.
        Focus on concrete changes, not general advice.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"suggestions":[]}');
      return result.suggestions || [];
    } catch (error) {
      console.error('[BrandVoice] Error generating suggestions:', error);
      return ['Review tone consistency with brand voice', 'Adjust formality level', 'Consider emoji usage preferences'];
    }
  }

  private async adaptContentToVoice(content: string, profile: VoiceProfile): Promise<string> {
    try {
      const prompt = `
        Adapt this content to match the specified brand voice while preserving the core message:
        
        Original Content: "${content}"
        
        Brand Voice Profile:
        - Name: ${profile.name}
        - Description: ${profile.description}
        - Tone: ${profile.characteristics.tone}
        - Formality: ${profile.characteristics.formality}
        - Length Preference: ${profile.characteristics.lengthPreference}
        - Emoji Usage: ${profile.characteristics.emojiUsage}
        - Hashtag Style: ${profile.characteristics.hashtagStyle}
        - CTA Style: ${profile.characteristics.callToActionStyle}
        
        Sample Texts for Reference:
        ${profile.sampleTexts.slice(0, 3).map((text, i) => `${i + 1}. "${text}"`).join('\n')}
        
        Return only the adapted content, nothing else.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7
      });

      return response.choices[0].message.content?.trim() || content;
    } catch (error) {
      console.error('[BrandVoice] Error adapting content:', error);
      return content;
    }
  }

  // Platform-specific adaptations
  async adaptContentForPlatform(
    userId: string, 
    content: string, 
    platform: string, 
    profileName?: string
  ): Promise<string> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = profileName 
        ? profiles.find(p => p.name === profileName)
        : profiles.find(p => p.isActive);

      if (!profile) {
        return content;
      }

      const platformConfig = profile.platformAdaptations[platform];
      if (!platformConfig) {
        return content;
      }

      const prompt = `
        Adapt this content for ${platform} while maintaining the brand voice:
        
        Original Content: "${content}"
        Platform: ${platform}
        Max Length: ${platformConfig.maxLength} characters
        Format Preferences: ${platformConfig.formatPreferences.join(', ')}
        ${platformConfig.specificTone ? `Platform-specific tone: ${platformConfig.specificTone}` : ''}
        
        Brand Voice:
        - Tone: ${profile.characteristics.tone}
        - Formality: ${profile.characteristics.formality}
        - Emoji Usage: ${profile.characteristics.emojiUsage}
        
        Return only the adapted content for ${platform}.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      const adaptedContent = response.choices[0].message.content?.trim() || content;
      
      // Ensure length constraints
      if (adaptedContent.length > platformConfig.maxLength) {
        return adaptedContent.substring(0, platformConfig.maxLength - 3) + '...';
      }

      return adaptedContent;
    } catch (error) {
      console.error('[BrandVoice] Error adapting for platform:', error);
      return content;
    }
  }

  // Training and improvement
  async learnFromContent(userId: string, content: string, profileName?: string): Promise<void> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = profileName 
        ? profiles.find(p => p.name === profileName)
        : profiles.find(p => p.isActive);

      if (!profile) {
        console.warn(`[BrandVoice] No profile found for learning: ${profileName || 'active'}`);
        return;
      }

      // Add content to sample texts (keep last 20 samples)
      profile.sampleTexts.push(content);
      if (profile.sampleTexts.length > 20) {
        profile.sampleTexts = profile.sampleTexts.slice(-20);
      }

      // Regenerate embedding with new sample
      profile.embedding = await this.generateVoiceEmbedding(profile.sampleTexts);
      profile.updatedAt = new Date();

      const userProfiles = this.voiceProfiles.get(userId) || [];
      const profileIndex = userProfiles.findIndex(p => p.name === profile.name);
      if (profileIndex !== -1) {
        userProfiles[profileIndex] = profile;
        this.voiceProfiles.set(userId, userProfiles);
      }

      console.log(`[BrandVoice] Learned from new content for profile: ${profile.name}`);
    } catch (error) {
      console.error('[BrandVoice] Error learning from content:', error);
    }
  }

  private getDefaultPlatformAdaptations(): VoiceProfile['platformAdaptations'] {
    return {
      twitter: {
        maxLength: 280,
        formatPreferences: ['concise', 'hashtags', 'mentions'],
        specificTone: 'conversational'
      },
      linkedin: {
        maxLength: 3000,
        formatPreferences: ['professional', 'structured', 'insights'],
        specificTone: 'professional'
      },
      instagram: {
        maxLength: 2200,
        formatPreferences: ['visual', 'emojis', 'hashtags', 'stories'],
        specificTone: 'engaging'
      },
      tiktok: {
        maxLength: 300,
        formatPreferences: ['trendy', 'short', 'call-to-action'],
        specificTone: 'energetic'
      },
      youtube: {
        maxLength: 5000,
        formatPreferences: ['detailed', 'timestamps', 'call-to-action'],
        specificTone: 'informative'
      }
    };
  }

  // Batch processing
  async processContentWithVoice(userId: string, content: string, platform: string): Promise<string> {
    try {
      // First, adapt to brand voice
      const voiceAnalysis = await this.analyzeContentVoiceMatch(userId, content);
      
      // Then adapt for platform
      const platformAdapted = await this.adaptContentForPlatform(userId, voiceAnalysis.adaptedContent, platform);
      
      // Learn from the final content
      await this.learnFromContent(userId, platformAdapted);
      
      return platformAdapted;
    } catch (error) {
      console.error('[BrandVoice] Error processing content with voice:', error);
      return content;
    }
  }

  async getVoiceMatchScore(userId: string, content: string): Promise<number> {
    try {
      const analysis = await this.analyzeContentVoiceMatch(userId, content);
      return analysis.similarity;
    } catch (error) {
      console.error('[BrandVoice] Error getting voice match score:', error);
      return 0;
    }
  }
}

export const brandVoiceService = new BrandVoiceService();