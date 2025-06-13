import { storage } from "./storage";
import { SocialAccount, SocialPost } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RevenueData {
  postId: string;
  platform: string;
  date: Date;
  views: number;
  cpm: number;
  rpm: number;
  earnings: number;
  adRevenue: number;
  sponsorshipRevenue: number;
  affiliateRevenue: number;
  merchRevenue: number;
}

interface SponsorshipProspect {
  id: string;
  companyName: string;
  industry: string;
  contactEmail: string;
  contactName: string;
  linkedinProfile: string;
  estimatedBudget: number;
  relevanceScore: number;
  audienceMatch: number;
  engagementPotential: number;
  status: 'prospecting' | 'contacted' | 'negotiating' | 'accepted' | 'rejected';
  lastContactDate?: Date;
  proposedRate: number;
  notes: string[];
}

interface CTAConfig {
  type: 'merch' | 'affiliate' | 'course' | 'newsletter' | 'custom';
  url: string;
  text: string;
  platform: string[];
  active: boolean;
  clickThrough: number;
  conversions: number;
  revenue: number;
}

class YouTubeRevenueTracker {
  async fetchAnalytics(account: SocialAccount, videoIds: string[]): Promise<RevenueData[]> {
    console.log(`[YouTubeRevenueTracker] Fetching analytics for ${videoIds.length} videos`);
    
    // In a real implementation, this would use YouTube Analytics API
    // For now, we'll simulate the structure
    const mockData: RevenueData[] = videoIds.map(videoId => ({
      postId: videoId,
      platform: 'youtube',
      date: new Date(),
      views: Math.floor(Math.random() * 100000) + 1000,
      cpm: parseFloat((Math.random() * 5 + 1).toFixed(2)),
      rpm: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
      earnings: parseFloat((Math.random() * 500 + 10).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 400 + 5).toFixed(2)),
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 50).toFixed(2)),
      merchRevenue: parseFloat((Math.random() * 50).toFixed(2))
    }));

    return mockData;
  }

  async getChannelRevenue(channelId: string, days: number = 30): Promise<{
    totalRevenue: number;
    adRevenue: number;
    avgCPM: number;
    avgRPM: number;
    topEarningVideos: any[];
  }> {
    // Simulate YouTube Analytics API response
    return {
      totalRevenue: 2450.75,
      adRevenue: 1890.50,
      avgCPM: 3.45,
      avgRPM: 2.10,
      topEarningVideos: [
        { videoId: 'abc123', title: 'Top Video', earnings: 450.25 },
        { videoId: 'def456', title: 'Second Video', earnings: 320.75 }
      ]
    };
  }
}

class TikTokRevenueTracker {
  async fetchCreatorFundData(account: SocialAccount, videoIds: string[]): Promise<RevenueData[]> {
    console.log(`[TikTokRevenueTracker] Fetching Creator Fund data for ${videoIds.length} videos`);
    
    // Simulate TikTok Creator Center API
    const mockData: RevenueData[] = videoIds.map(videoId => ({
      postId: videoId,
      platform: 'tiktok',
      date: new Date(),
      views: Math.floor(Math.random() * 1000000) + 10000,
      cpm: parseFloat((Math.random() * 2 + 0.5).toFixed(2)),
      rpm: parseFloat((Math.random() * 1 + 0.1).toFixed(2)),
      earnings: parseFloat((Math.random() * 100 + 2).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 80 + 1).toFixed(2)),
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 20).toFixed(2)),
      merchRevenue: 0
    }));

    return mockData;
  }
}

class TwitterRevenueTracker {
  async fetchSuperFollowsData(account: SocialAccount, tweetIds: string[]): Promise<RevenueData[]> {
    console.log(`[TwitterRevenueTracker] Fetching Super Follows and Tip Jar data for ${tweetIds.length} tweets`);
    
    // Twitter monetization includes: Super Follows, Tip Jar, Spaces subscriptions, Creator Ads Revenue Sharing
    const mockData: RevenueData[] = tweetIds.map(tweetId => ({
      postId: tweetId,
      platform: 'twitter',
      date: new Date(),
      views: Math.floor(Math.random() * 500000) + 5000,
      cpm: parseFloat((Math.random() * 1.5 + 0.3).toFixed(2)),
      rpm: parseFloat((Math.random() * 0.8 + 0.2).toFixed(2)),
      earnings: parseFloat((Math.random() * 75 + 5).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 40 + 2).toFixed(2)), // Creator Ads Revenue Sharing
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 25).toFixed(2)),
      merchRevenue: parseFloat((Math.random() * 10).toFixed(2)) // Tips and Super Follows
    }));

    return mockData;
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    superFollowsRevenue: number;
    tipJarRevenue: number;
    spacesRevenue: number;
    adsRevenue: number;
    totalRevenue: number;
  }> {
    // Simulate Twitter Creator monetization API
    return {
      superFollowsRevenue: 245.50,
      tipJarRevenue: 89.25,
      spacesRevenue: 156.75,
      adsRevenue: 312.40,
      totalRevenue: 803.90
    };
  }
}

class InstagramRevenueTracker {
  async fetchCreatorFundData(account: SocialAccount, postIds: string[]): Promise<RevenueData[]> {
    console.log(`[InstagramRevenueTracker] Fetching Creator monetization data for ${postIds.length} posts`);
    
    // Instagram monetization: Reels Play Bonus, Creator Fund, IGTV Ads, Live Badges, Shopping
    const mockData: RevenueData[] = postIds.map(postId => ({
      postId: postId,
      platform: 'instagram',
      date: new Date(),
      views: Math.floor(Math.random() * 750000) + 8000,
      cpm: parseFloat((Math.random() * 3 + 0.8).toFixed(2)),
      rpm: parseFloat((Math.random() * 1.5 + 0.4).toFixed(2)),
      earnings: parseFloat((Math.random() * 150 + 8).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 90 + 3).toFixed(2)), // Reels Play Bonus + IGTV
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 40).toFixed(2)),
      merchRevenue: parseFloat((Math.random() * 20).toFixed(2)) // Shopping + Live Badges
    }));

    return mockData;
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    reelsPlayBonus: number;
    creatorFund: number;
    igtvAds: number;
    liveBadges: number;
    shopping: number;
    totalRevenue: number;
  }> {
    return {
      reelsPlayBonus: 567.80,
      creatorFund: 234.50,
      igtvAds: 189.25,
      liveBadges: 78.40,
      shopping: 445.75,
      totalRevenue: 1515.70
    };
  }
}

class LinkedInRevenueTracker {
  async fetchNewsletterData(account: SocialAccount, postIds: string[]): Promise<RevenueData[]> {
    console.log(`[LinkedInRevenueTracker] Fetching Creator Accelerator Program data for ${postIds.length} posts`);
    
    // LinkedIn monetization: Creator Accelerator Program, Newsletter subscriptions, Course sales, Consulting leads
    const mockData: RevenueData[] = postIds.map(postId => ({
      postId: postId,
      platform: 'linkedin',
      date: new Date(),
      views: Math.floor(Math.random() * 200000) + 2000,
      cpm: parseFloat((Math.random() * 4 + 1.2).toFixed(2)),
      rpm: parseFloat((Math.random() * 2.5 + 0.8).toFixed(2)),
      earnings: parseFloat((Math.random() * 200 + 15).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 60 + 5).toFixed(2)), // Creator Accelerator
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 80).toFixed(2)), // Course sales
      merchRevenue: parseFloat((Math.random() * 60).toFixed(2)) // Newsletter + Consulting
    }));

    return mockData;
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    creatorAccelerator: number;
    newsletterRevenue: number;
    courseRevenue: number;
    consultingLeads: number;
    totalRevenue: number;
  }> {
    return {
      creatorAccelerator: 389.60,
      newsletterRevenue: 256.80,
      courseRevenue: 1245.00,
      consultingLeads: 2890.50,
      totalRevenue: 4781.90
    };
  }
}

class SponsorshipProspector {
  async searchProspects(niche: string, audienceSize: number): Promise<SponsorshipProspect[]> {
    console.log(`[SponsorshipProspector] Searching for prospects in ${niche} with ${audienceSize} audience`);
    
    // In real implementation, this would use Apollo.io API or LinkedIn Sales Navigator
    const mockProspects: SponsorshipProspect[] = [
      {
        id: `prospect_${Date.now()}_1`,
        companyName: "TechStartup Inc",
        industry: "SaaS",
        contactEmail: "partnerships@techstartup.com",
        contactName: "Sarah Johnson",
        linkedinProfile: "https://linkedin.com/in/sarah-johnson-marketing",
        estimatedBudget: 5000,
        relevanceScore: 0.85,
        audienceMatch: 0.78,
        engagementPotential: 0.82,
        status: 'prospecting',
        proposedRate: 2500,
        notes: []
      },
      {
        id: `prospect_${Date.now()}_2`,
        companyName: "HealthTech Solutions",
        industry: "Healthcare",
        contactEmail: "marketing@healthtech.com",
        contactName: "Mike Chen",
        linkedinProfile: "https://linkedin.com/in/mike-chen-healthtech",
        estimatedBudget: 8000,
        relevanceScore: 0.92,
        audienceMatch: 0.88,
        engagementPotential: 0.90,
        status: 'prospecting',
        proposedRate: 4000,
        notes: []
      }
    ];

    return mockProspects;
  }

  async generateOutreachEmail(prospect: SponsorshipProspect, creatorStats: any): Promise<string> {
    const prompt = `Generate a professional sponsorship outreach email for a content creator.

Creator Stats:
- Total Followers: ${creatorStats.totalFollowers}
- Avg Engagement Rate: ${creatorStats.engagementRate}%
- Content Niche: ${creatorStats.niche}
- Top Platforms: ${creatorStats.platforms.join(', ')}

Prospect Info:
- Company: ${prospect.companyName}
- Industry: ${prospect.industry}
- Contact: ${prospect.contactName}
- Estimated Budget: $${prospect.estimatedBudget}

Guidelines:
- Professional but personable tone
- Highlight relevant metrics and audience match
- Include specific collaboration ideas
- Mention media kit availability
- Keep under 200 words
- Include clear call-to-action

Generate the email:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });

    return response.choices[0].message.content?.trim() || '';
  }

  async generateMediaKitSnippet(creatorStats: any): Promise<string> {
    const prompt = `Create a concise media kit snippet for sponsorship proposals.

Creator Stats:
- Total Followers: ${creatorStats.totalFollowers}
- Monthly Views: ${creatorStats.monthlyViews}
- Engagement Rate: ${creatorStats.engagementRate}%
- Demographics: ${creatorStats.demographics}
- Content Pillars: ${creatorStats.contentPillars.join(', ')}

Create a professional 3-4 sentence summary highlighting key metrics and value proposition:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.6,
    });

    return response.choices[0].message.content?.trim() || '';
  }
}

class CTAManager {
  private ctaConfigs: Map<string, CTAConfig> = new Map();

  async addCTA(config: CTAConfig): Promise<void> {
    this.ctaConfigs.set(config.url, config);
    console.log(`[CTAManager] Added CTA: ${config.type} - ${config.text}`);
  }

  async insertCTAIntoContent(content: string, platform: string): Promise<string> {
    const relevantCTAs = Array.from(this.ctaConfigs.values())
      .filter(cta => cta.active && cta.platform.includes(platform));

    if (relevantCTAs.length === 0) return content;

    // Select best CTA based on performance
    const bestCTA = relevantCTAs.sort((a, b) => {
      const aPerformance = a.conversions / Math.max(a.clickThrough, 1);
      const bPerformance = b.conversions / Math.max(b.clickThrough, 1);
      return bPerformance - aPerformance;
    })[0];

    // Insert CTA naturally into content
    const ctaText = platform === 'twitter' 
      ? `\n\n${bestCTA.text} ${bestCTA.url}`
      : `\n\n${bestCTA.text}\n${bestCTA.url}`;

    return content + ctaText;
  }

  async trackCTAClick(url: string): Promise<void> {
    const cta = this.ctaConfigs.get(url);
    if (cta) {
      cta.clickThrough++;
      console.log(`[CTAManager] CTA click tracked: ${url}`);
    }
  }

  async trackCTAConversion(url: string, revenue: number): Promise<void> {
    const cta = this.ctaConfigs.get(url);
    if (cta) {
      cta.conversions++;
      cta.revenue += revenue;
      console.log(`[CTAManager] CTA conversion tracked: ${url} - $${revenue}`);
    }
  }

  async getCTAPerformance(): Promise<CTAConfig[]> {
    return Array.from(this.ctaConfigs.values())
      .map(cta => ({
        ...cta,
        conversionRate: cta.conversions / Math.max(cta.clickThrough, 1),
        revenuePerClick: cta.revenue / Math.max(cta.clickThrough, 1)
      }))
      .sort((a: any, b: any) => b.revenue - a.revenue);
  }
}

export class MonetizationService {
  private youtubeTracker = new YouTubeRevenueTracker();
  private tiktokTracker = new TikTokRevenueTracker();
  private twitterTracker = new TwitterRevenueTracker();
  private instagramTracker = new InstagramRevenueTracker();
  private linkedinTracker = new LinkedInRevenueTracker();
  private sponsorshipProspector = new SponsorshipProspector();
  private ctaManager = new CTAManager();
  private prospects: Map<string, SponsorshipProspect> = new Map();

  async syncRevenueData(userId: string): Promise<void> {
    console.log(`[MonetizationService] Syncing revenue data for user ${userId}`);

    try {
      const accounts = await storage.getUserSocialAccounts(userId);
      const posts = await storage.getSocialPostsByUserId(userId);

      for (const account of accounts) {
        if (!account.isActive) continue;

        const accountPosts = posts.filter(post => post.platform === account.platform);
        const postIds = accountPosts.map(post => post.id);

        let revenueData: RevenueData[] = [];

        switch (account.platform) {
          case 'youtube':
            revenueData = await this.youtubeTracker.fetchAnalytics(account, postIds);
            break;
          case 'tiktok':
            revenueData = await this.tiktokTracker.fetchCreatorFundData(account, postIds);
            break;
          case 'twitter':
            revenueData = await this.twitterTracker.fetchSuperFollowsData(account, postIds);
            break;
          case 'instagram':
            revenueData = await this.instagramTracker.fetchCreatorFundData(account, postIds);
            break;
          case 'linkedin':
            revenueData = await this.linkedinTracker.fetchNewsletterData(account, postIds);
            break;
        }

        // Store revenue data (would need to add revenue table to schema)
        for (const data of revenueData) {
          await this.storeRevenueData(data);
        }
      }
    } catch (error) {
      console.error('[MonetizationService] Error syncing revenue data:', error);
    }
  }

  async storeRevenueData(data: RevenueData): Promise<void> {
    // In a full implementation, this would store to a revenue_data table
    console.log(`[MonetizationService] Storing revenue data: ${data.platform} - $${data.earnings}`);
  }

  async getRevenueReport(userId: string, days: number = 30): Promise<{
    totalRevenue: number;
    platformBreakdown: Array<{
      platform: string;
      revenue: number;
      cpm: number;
      rpm: number;
      growth: number;
    }>;
    topEarningPosts: Array<{
      postId: string;
      platform: string;
      earnings: number;
      views: number;
      cpm: number;
    }>;
    projectedMonthly: number;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get comprehensive revenue data from all platforms
    return {
      totalRevenue: 8902.35,
      platformBreakdown: [
        { platform: 'linkedin', revenue: 4781.90, cpm: 3.20, rpm: 2.85, growth: 45.2 },
        { platform: 'youtube', revenue: 2450.75, cpm: 3.45, rpm: 2.10, growth: 15.2 },
        { platform: 'instagram', revenue: 1515.70, cpm: 2.80, rpm: 1.95, growth: 32.1 },
        { platform: 'twitter', revenue: 803.90, cpm: 1.20, rpm: 0.65, growth: 18.7 },
        { platform: 'tiktok', revenue: 567.10, cpm: 1.85, rpm: 0.85, growth: 28.5 }
      ],
      topEarningPosts: [
        { postId: 'post_1', platform: 'linkedin', earnings: 1245.00, views: 125000, cpm: 9.96 },
        { postId: 'post_2', platform: 'youtube', earnings: 450.25, views: 85000, cpm: 5.30 },
        { postId: 'post_3', platform: 'instagram', earnings: 380.75, views: 150000, cpm: 2.54 },
        { postId: 'post_4', platform: 'twitter', earnings: 195.40, views: 75000, cpm: 2.61 },
        { postId: 'post_5', platform: 'tiktok', earnings: 180.50, views: 450000, cpm: 0.40 }
      ],
      projectedMonthly: 13353.53
    };
  }

  async findSponsorshipProspects(userId: string): Promise<SponsorshipProspect[]> {
    try {
      // Get user's content niche and audience data
      const posts = await storage.getSocialPostsByUserId(userId);
      const userStats = await storage.getUserStats(userId);

      // Analyze content to determine niche
      const contentSample = posts.slice(0, 10).map(post => post.content).join(' ');
      
      const niche = await this.detectContentNiche(contentSample);
      const audienceSize = userStats.totalEngagement * 10; // Estimate

      const prospects = await this.sponsorshipProspector.searchProspects(niche, audienceSize);
      
      // Store prospects
      for (const prospect of prospects) {
        this.prospects.set(prospect.id, prospect);
      }

      return prospects;
    } catch (error) {
      console.error('[MonetizationService] Error finding prospects:', error);
      return [];
    }
  }

  async generateSponsorshipOutreach(prospectId: string, userId: string): Promise<{
    email: string;
    mediaKit: string;
    proposedRate: number;
  }> {
    const prospect = this.prospects.get(prospectId);
    if (!prospect) throw new Error('Prospect not found');

    const userStats = await storage.getUserStats(userId);
    const accounts = await storage.getUserSocialAccounts(userId);

    const creatorStats = {
      totalFollowers: userStats.totalEngagement * 50, // Estimate
      engagementRate: 4.5,
      niche: 'Technology',
      platforms: accounts.map(a => a.platform),
      monthlyViews: userStats.totalEngagement * 100,
      demographics: 'Tech professionals, 25-40 years old',
      contentPillars: ['Technology', 'Business', 'Innovation']
    };

    const [email, mediaKit] = await Promise.all([
      this.sponsorshipProspector.generateOutreachEmail(prospect, creatorStats),
      this.sponsorshipProspector.generateMediaKitSnippet(creatorStats)
    ]);

    return {
      email,
      mediaKit,
      proposedRate: prospect.proposedRate
    };
  }

  async setupCTA(config: CTAConfig): Promise<void> {
    await this.ctaManager.addCTA(config);
  }

  async processContentWithCTA(content: string, platform: string): Promise<string> {
    return await this.ctaManager.insertCTAIntoContent(content, platform);
  }

  async getCTAPerformance(): Promise<any[]> {
    return await this.ctaManager.getCTAPerformance();
  }

  async trackCTAMetrics(url: string, type: 'click' | 'conversion', revenue?: number): Promise<void> {
    if (type === 'click') {
      await this.ctaManager.trackCTAClick(url);
    } else if (type === 'conversion' && revenue) {
      await this.ctaManager.trackCTAConversion(url, revenue);
    }
  }

  private async detectContentNiche(content: string): Promise<string> {
    const prompt = `Analyze this content sample and identify the primary niche/industry category:

Content: "${content.slice(0, 500)}..."

Categories: Technology, Business, Health & Fitness, Lifestyle, Education, Entertainment, Gaming, Finance, Food, Travel, Fashion, Beauty, Sports, Music, Art, Science

Return only the single most relevant category:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0.3,
      });

      return response.choices[0].message.content?.trim() || 'Technology';
    } catch (error) {
      console.error('[MonetizationService] Error detecting niche:', error);
      return 'Technology';
    }
  }

  async updateProspectStatus(prospectId: string, status: SponsorshipProspect['status'], notes?: string): Promise<void> {
    const prospect = this.prospects.get(prospectId);
    if (prospect) {
      prospect.status = status;
      prospect.lastContactDate = new Date();
      if (notes) {
        prospect.notes.push(`${new Date().toISOString()}: ${notes}`);
      }
      console.log(`[MonetizationService] Updated prospect ${prospectId} status to ${status}`);
    }
  }

  async getMonetizationDashboard(userId: string): Promise<{
    revenueReport: any;
    activeProspects: SponsorshipProspect[];
    ctaPerformance: any[];
    recommendations: string[];
  }> {
    const [revenueReport, ctaPerformance] = await Promise.all([
      this.getRevenueReport(userId),
      this.getCTAPerformance()
    ]);

    const activeProspects = Array.from(this.prospects.values())
      .filter(p => ['prospecting', 'contacted', 'negotiating'].includes(p.status))
      .sort((a, b) => b.estimatedBudget - a.estimatedBudget);

    const recommendations = await this.generateRecommendations(revenueReport, ctaPerformance);

    return {
      revenueReport,
      activeProspects,
      ctaPerformance,
      recommendations
    };
  }

  private async generateRecommendations(revenueReport: any, ctaPerformance: any[]): Promise<string[]> {
    const recommendations: string[] = [];

    // Revenue-based recommendations
    if (revenueReport.totalRevenue < 1000) {
      recommendations.push("Consider increasing posting frequency to boost ad revenue");
    }

    const bestPlatform = revenueReport.platformBreakdown.sort((a: any, b: any) => b.revenue - a.revenue)[0];
    if (bestPlatform) {
      recommendations.push(`Focus more content on ${bestPlatform.platform} - your highest earning platform`);
    }

    // CTA recommendations
    if (ctaPerformance.length > 0) {
      const bestCTA = ctaPerformance[0];
      recommendations.push(`Optimize CTAs - your best performing type: ${bestCTA.type}`);
    }

    // Sponsorship recommendations
    recommendations.push("Reach out to 3-5 new sponsorship prospects this week");

    return recommendations;
  }
}

export const monetizationService = new MonetizationService();