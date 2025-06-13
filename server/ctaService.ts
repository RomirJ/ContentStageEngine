import { storage } from './storage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface CTAConfig {
  id: string;
  userId: string;
  name: string;
  type: 'shopify' | 'gumroad' | 'stripe' | 'custom';
  url: string;
  product?: {
    name: string;
    price: number;
    description: string;
    sku?: string;
  };
  template: string; // Template for CTA insertion
  platforms: string[]; // Which platforms to insert on
  timing: 'start' | 'middle' | 'end' | 'comment';
  isActive: boolean;
  createdAt: Date;
}

interface CTAPerformance {
  ctaId: string;
  postId: string;
  platform: string;
  clicks: number;
  conversions: number;
  revenue: number;
  date: Date;
}

interface CTAInsertionResult {
  success: boolean;
  originalContent: string;
  modifiedContent: string;
  ctaText: string;
  position: 'prepended' | 'appended' | 'inserted';
}

export class CTAService {
  private ctaConfigs: Map<string, CTAConfig[]> = new Map();
  private performanceData: Map<string, CTAPerformance[]> = new Map();

  // CTA Configuration Management
  async createCTA(userId: string, ctaData: Omit<CTAConfig, 'id' | 'userId' | 'createdAt'>): Promise<CTAConfig> {
    const cta: CTAConfig = {
      id: `cta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      ...ctaData,
      createdAt: new Date()
    };

    const userCTAs = this.ctaConfigs.get(userId) || [];
    userCTAs.push(cta);
    this.ctaConfigs.set(userId, userCTAs);

    console.log(`[CTA] Created CTA config: ${cta.id} for user ${userId}`);
    return cta;
  }

  async getUserCTAs(userId: string): Promise<CTAConfig[]> {
    return this.ctaConfigs.get(userId) || [];
  }

  async updateCTA(userId: string, ctaId: string, updates: Partial<CTAConfig>): Promise<CTAConfig | null> {
    const userCTAs = this.ctaConfigs.get(userId) || [];
    const ctaIndex = userCTAs.findIndex(cta => cta.id === ctaId);
    
    if (ctaIndex === -1) return null;

    userCTAs[ctaIndex] = { ...userCTAs[ctaIndex], ...updates };
    this.ctaConfigs.set(userId, userCTAs);

    return userCTAs[ctaIndex];
  }

  async deleteCTA(userId: string, ctaId: string): Promise<boolean> {
    const userCTAs = this.ctaConfigs.get(userId) || [];
    const filteredCTAs = userCTAs.filter(cta => cta.id !== ctaId);
    
    if (filteredCTAs.length === userCTAs.length) return false;

    this.ctaConfigs.set(userId, filteredCTAs);
    return true;
  }

  // Auto CTA Insertion
  async insertCTAIntoContent(
    userId: string, 
    content: string, 
    platform: string, 
    contentType: 'caption' | 'comment' = 'caption'
  ): Promise<CTAInsertionResult> {
    try {
      const userCTAs = await this.getUserCTAs(userId);
      const applicableCTAs = userCTAs.filter(cta => 
        cta.isActive && 
        cta.platforms.includes(platform) &&
        (contentType === 'caption' ? cta.timing !== 'comment' : cta.timing === 'comment')
      );

      if (applicableCTAs.length === 0) {
        return {
          success: false,
          originalContent: content,
          modifiedContent: content,
          ctaText: '',
          position: 'appended'
        };
      }

      // Select best CTA based on performance or random if no performance data
      const selectedCTA = await this.selectBestCTA(applicableCTAs, platform);
      
      // Generate contextual CTA text
      const ctaText = await this.generateContextualCTA(selectedCTA, content, platform);
      
      // Insert CTA based on timing preference
      const modifiedContent = this.insertCTAText(content, ctaText, selectedCTA.timing);

      console.log(`[CTA] Inserted CTA ${selectedCTA.id} into ${platform} content`);

      return {
        success: true,
        originalContent: content,
        modifiedContent,
        ctaText,
        position: selectedCTA.timing === 'start' ? 'prepended' : 
                  selectedCTA.timing === 'middle' ? 'inserted' : 'appended'
      };
    } catch (error) {
      console.error('[CTA] Error inserting CTA:', error);
      return {
        success: false,
        originalContent: content,
        modifiedContent: content,
        ctaText: '',
        position: 'appended'
      };
    }
  }

  private async selectBestCTA(ctas: CTAConfig[], platform: string): Promise<CTAConfig> {
    // Get performance data for CTAs on this platform
    const ctaPerformance = new Map<string, { clicks: number; conversions: number; revenue: number }>();
    
    for (const cta of ctas) {
      const performance = this.performanceData.get(cta.id) || [];
      const platformPerf = performance.filter(p => p.platform === platform);
      
      const totalClicks = platformPerf.reduce((sum, p) => sum + p.clicks, 0);
      const totalConversions = platformPerf.reduce((sum, p) => sum + p.conversions, 0);
      const totalRevenue = platformPerf.reduce((sum, p) => sum + p.revenue, 0);
      
      ctaPerformance.set(cta.id, { clicks: totalClicks, conversions: totalConversions, revenue: totalRevenue });
    }

    // Sort by revenue, then conversions, then clicks
    const sortedCTAs = ctas.sort((a, b) => {
      const perfA = ctaPerformance.get(a.id) || { clicks: 0, conversions: 0, revenue: 0 };
      const perfB = ctaPerformance.get(b.id) || { clicks: 0, conversions: 0, revenue: 0 };
      
      if (perfA.revenue !== perfB.revenue) return perfB.revenue - perfA.revenue;
      if (perfA.conversions !== perfB.conversions) return perfB.conversions - perfA.conversions;
      return perfB.clicks - perfA.clicks;
    });

    return sortedCTAs[0];
  }

  private async generateContextualCTA(cta: CTAConfig, content: string, platform: string): Promise<string> {
    try {
      const prompt = `
        Generate a natural, contextual call-to-action for this content:
        
        Content: "${content}"
        Platform: ${platform}
        Product: ${cta.product?.name || 'Product'}
        Product Description: ${cta.product?.description || ''}
        Price: ${cta.product?.price ? `$${cta.product.price}` : ''}
        Template: ${cta.template}
        
        Requirements:
        - Keep it brief and natural (max 20 words)
        - Match the content tone
        - Include relevant emojis for ${platform}
        - Don't be overly salesy
        - Focus on value proposition
        
        Return just the CTA text, nothing else.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.7
      });

      const generatedCTA = response.choices[0].message.content?.trim() || cta.template;
      
      // Ensure URL is included
      return `${generatedCTA} ${cta.url}`;
    } catch (error) {
      console.error('[CTA] Error generating contextual CTA:', error);
      return `${cta.template} ${cta.url}`;
    }
  }

  private insertCTAText(content: string, ctaText: string, timing: CTAConfig['timing']): string {
    switch (timing) {
      case 'start':
        return `${ctaText}\n\n${content}`;
      
      case 'middle':
        const sentences = content.split(/[.!?]+/);
        if (sentences.length > 2) {
          const midPoint = Math.floor(sentences.length / 2);
          return [
            ...sentences.slice(0, midPoint),
            `\n\n${ctaText}\n\n`,
            ...sentences.slice(midPoint)
          ].join('. ').replace(/\. \n\n/g, '.\n\n').replace(/\n\n\. /g, '\n\n');
        }
        return `${content}\n\n${ctaText}`;
      
      case 'end':
      default:
        return `${content}\n\n${ctaText}`;
    }
  }

  // Performance Tracking
  async trackCTAClick(ctaId: string, postId: string, platform: string): Promise<void> {
    const performance = this.performanceData.get(ctaId) || [];
    const existingEntry = performance.find(p => p.postId === postId && p.platform === platform);
    
    if (existingEntry) {
      existingEntry.clicks++;
    } else {
      performance.push({
        ctaId,
        postId,
        platform,
        clicks: 1,
        conversions: 0,
        revenue: 0,
        date: new Date()
      });
    }
    
    this.performanceData.set(ctaId, performance);
    console.log(`[CTA] Tracked click for CTA ${ctaId} on post ${postId}`);
  }

  async trackCTAConversion(ctaId: string, postId: string, platform: string, revenue: number = 0): Promise<void> {
    const performance = this.performanceData.get(ctaId) || [];
    const existingEntry = performance.find(p => p.postId === postId && p.platform === platform);
    
    if (existingEntry) {
      existingEntry.conversions++;
      existingEntry.revenue += revenue;
    } else {
      performance.push({
        ctaId,
        postId,
        platform,
        clicks: 0,
        conversions: 1,
        revenue,
        date: new Date()
      });
    }
    
    this.performanceData.set(ctaId, performance);
    console.log(`[CTA] Tracked conversion for CTA ${ctaId}: $${revenue}`);
  }

  async getCTAPerformance(userId: string, days: number = 30): Promise<{
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    conversionRate: number;
    averageOrderValue: number;
    topPerformingCTA: string;
    platformBreakdown: Array<{
      platform: string;
      clicks: number;
      conversions: number;
      revenue: number;
    }>;
  }> {
    const userCTAs = await this.getUserCTAs(userId);
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    const platformBreakdown = new Map<string, { clicks: number; conversions: number; revenue: number }>();
    const ctaPerformance = new Map<string, { clicks: number; conversions: number; revenue: number }>();
    
    for (const cta of userCTAs) {
      const performance = this.performanceData.get(cta.id) || [];
      const recentPerformance = performance.filter(p => p.date >= cutoffDate);
      
      let ctaClicks = 0;
      let ctaConversions = 0;
      let ctaRevenue = 0;
      
      for (const perf of recentPerformance) {
        ctaClicks += perf.clicks;
        ctaConversions += perf.conversions;
        ctaRevenue += perf.revenue;
        
        const platform = perf.platform;
        const current = platformBreakdown.get(platform) || { clicks: 0, conversions: 0, revenue: 0 };
        current.clicks += perf.clicks;
        current.conversions += perf.conversions;
        current.revenue += perf.revenue;
        platformBreakdown.set(platform, current);
      }
      
      totalClicks += ctaClicks;
      totalConversions += ctaConversions;
      totalRevenue += ctaRevenue;
      
      ctaPerformance.set(cta.id, { clicks: ctaClicks, conversions: ctaConversions, revenue: ctaRevenue });
    }
    
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    const averageOrderValue = totalConversions > 0 ? totalRevenue / totalConversions : 0;
    
    // Find top performing CTA
    let topPerformingCTA = 'none';
    let maxRevenue = 0;
    for (const [ctaId, perf] of ctaPerformance.entries()) {
      if (perf.revenue > maxRevenue) {
        maxRevenue = perf.revenue;
        topPerformingCTA = ctaId;
      }
    }
    
    return {
      totalClicks,
      totalConversions,
      totalRevenue,
      conversionRate,
      averageOrderValue,
      topPerformingCTA,
      platformBreakdown: Array.from(platformBreakdown.entries()).map(([platform, data]) => ({
        platform,
        ...data
      }))
    };
  }

  // Integration helpers for posting service
  async processContentForPosting(userId: string, content: string, platform: string): Promise<string> {
    const result = await this.insertCTAIntoContent(userId, content, platform, 'caption');
    return result.modifiedContent;
  }

  async generateCTAComment(userId: string, postId: string, platform: string): Promise<string | null> {
    const result = await this.insertCTAIntoContent(userId, '', platform, 'comment');
    if (result.success && result.ctaText) {
      return result.ctaText;
    }
    return null;
  }
}

export const ctaService = new CTAService();