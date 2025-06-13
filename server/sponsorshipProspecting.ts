import OpenAI from 'openai';
import { storage } from './storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ProspectProfile {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  linkedinUrl: string;
  email?: string;
  companySize: string;
  revenue?: string;
  location: string;
  relevanceScore: number;
  reasoning: string;
}

interface SponsorshipPitch {
  subject: string;
  emailBody: string;
  deckSnippet: string;
  cta: string;
  followUpSequence: string[];
}

interface ApolloSearchParams {
  titles: string[];
  industries: string[];
  companySize: string[];
  location?: string;
  keywords: string[];
}

class ApolloAPI {
  private apiKey: string;
  private baseUrl = 'https://api.apollo.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchPeople(params: ApolloSearchParams): Promise<ProspectProfile[]> {
    try {
      const searchPayload = {
        api_key: this.apiKey,
        q_person_titles: params.titles,
        q_organization_industries: params.industries,
        q_organization_num_employees_ranges: params.companySize,
        q_organization_locations: params.location ? [params.location] : undefined,
        q_keywords: params.keywords.join(' '),
        page: 1,
        per_page: 50,
        person_locations: params.location ? [params.location] : undefined
      };

      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(searchPayload)
      });

      if (!response.ok) {
        throw new Error(`Apollo API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.people?.map((person: any) => ({
        id: person.id,
        name: `${person.first_name} ${person.last_name}`,
        title: person.title || 'Unknown Title',
        company: person.organization?.name || 'Unknown Company',
        industry: person.organization?.industry || 'Unknown Industry',
        linkedinUrl: person.linkedin_url || '',
        email: person.email,
        companySize: person.organization?.estimated_num_employees || 'Unknown',
        revenue: person.organization?.estimated_annual_revenue || 'Unknown',
        location: person.city || 'Unknown Location',
        relevanceScore: 0, // Will be calculated later
        reasoning: ''
      })) || [];
    } catch (error) {
      console.error('[ApolloAPI] Search failed:', error);
      throw error;
    }
  }

  async enrichPerson(personId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/people/${personId}`, {
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Apollo enrichment error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[ApolloAPI] Person enrichment failed:', error);
      return null;
    }
  }
}

class LinkedInAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async searchCompanies(query: string, industry?: string): Promise<any[]> {
    try {
      const searchParams = new URLSearchParams({
        q: 'universal',
        query: query,
        entity: 'company',
        count: '25'
      });

      if (industry) {
        searchParams.append('facet', `industry,${industry}`);
      }

      const response = await fetch(`https://api.linkedin.com/v2/search?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.status}`);
      }

      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      console.error('[LinkedInAPI] Company search failed:', error);
      return [];
    }
  }

  async getCompanyInsights(companyId: string): Promise<any> {
    try {
      const response = await fetch(`https://api.linkedin.com/v2/companies/${companyId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[LinkedInAPI] Company insights failed:', error);
      return null;
    }
  }
}

export class SponsorshipProspectingService {
  private apolloAPI?: ApolloAPI;
  private linkedInAPI?: LinkedInAPI;

  constructor() {
    if (process.env.APOLLO_API_KEY) {
      this.apolloAPI = new ApolloAPI(process.env.APOLLO_API_KEY);
    }
  }

  async initializeLinkedIn(userId: string): Promise<void> {
    const { oauthService } = await import('./oauthService');
    const accessToken = await oauthService.getValidToken(userId, 'linkedin');
    
    if (accessToken) {
      this.linkedInAPI = new LinkedInAPI(accessToken);
    }
  }

  async findSponsors(userId: string, contentNiche: string, audienceSize: number, location?: string): Promise<{
    prospects: ProspectProfile[];
    searchSummary: {
      totalFound: number;
      averageRelevanceScore: number;
      topIndustries: string[];
      recommendedApproach: string;
    };
  }> {
    if (!this.apolloAPI) {
      throw new Error('Apollo API key not configured. Please add APOLLO_API_KEY to environment variables.');
    }

    await this.initializeLinkedIn(userId);

    // Define search parameters based on content niche
    const searchParams = this.buildSearchParams(contentNiche, audienceSize);
    
    console.log(`[SponsorshipProspecting] Searching for sponsors in ${contentNiche} niche...`);
    
    const rawProspects = await this.apolloAPI.searchPeople(searchParams);
    
    // Score and filter prospects using AI
    const scoredProspects = await this.scoreProspects(rawProspects, contentNiche, audienceSize);
    
    // Sort by relevance score and take top 25
    const topProspects = scoredProspects
      .filter(p => p.relevanceScore > 0.6)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 25);

    const searchSummary = this.generateSearchSummary(topProspects);

    console.log(`[SponsorshipProspecting] Found ${topProspects.length} high-quality prospects`);

    return {
      prospects: topProspects,
      searchSummary
    };
  }

  private buildSearchParams(contentNiche: string, audienceSize: number): ApolloSearchParams {
    const nicheMapping: Record<string, ApolloSearchParams> = {
      'tech': {
        titles: ['Marketing Director', 'Brand Manager', 'CMO', 'VP Marketing', 'Head of Marketing'],
        industries: ['Software Development', 'Information Technology', 'Computer Software', 'SaaS'],
        companySize: audienceSize > 100000 ? ['201-500', '501-1000', '1001-5000', '5001+'] : ['51-200', '201-500'],
        keywords: ['developer tools', 'SaaS', 'technology', 'software']
      },
      'business': {
        titles: ['Marketing Manager', 'Brand Director', 'CMO', 'VP Marketing', 'Head of Growth'],
        industries: ['Business Services', 'Financial Services', 'Consulting', 'Management Consulting'],
        companySize: audienceSize > 50000 ? ['201-500', '501-1000', '1001+'] : ['11-50', '51-200'],
        keywords: ['business growth', 'entrepreneurship', 'consulting', 'finance']
      },
      'lifestyle': {
        titles: ['Marketing Manager', 'Brand Manager', 'Social Media Manager', 'Influencer Marketing'],
        industries: ['Consumer Goods', 'Retail', 'Fashion', 'Food & Beverages', 'Health & Wellness'],
        companySize: ['11-50', '51-200', '201-500'],
        keywords: ['lifestyle', 'consumer products', 'wellness', 'fashion']
      },
      'education': {
        titles: ['Marketing Director', 'Content Manager', 'VP Marketing', 'Head of Marketing'],
        industries: ['Education', 'E-Learning', 'Training', 'Professional Development'],
        companySize: ['11-50', '51-200', '201-500', '501+'],
        keywords: ['education', 'online learning', 'training', 'courses']
      }
    };

    return nicheMapping[contentNiche.toLowerCase()] || nicheMapping['business'];
  }

  private async scoreProspects(prospects: ProspectProfile[], contentNiche: string, audienceSize: number): Promise<ProspectProfile[]> {
    const batchSize = 10;
    const scoredProspects: ProspectProfile[] = [];

    for (let i = 0; i < prospects.length; i += batchSize) {
      const batch = prospects.slice(i, i + batchSize);
      
      try {
        const prompt = `
          Analyze these potential sponsors for a ${contentNiche} content creator with ${audienceSize} followers.
          
          Score each prospect 0-1 based on:
          1. Industry relevance to ${contentNiche}
          2. Company size/budget likelihood
          3. Title seniority for sponsorship decisions
          4. Brand-audience fit potential
          
          Prospects:
          ${batch.map((p, idx) => `${idx + 1}. ${p.name} - ${p.title} at ${p.company} (${p.industry}, ${p.companySize} employees)`).join('\n')}
          
          Return JSON: {"scores": [{"index": 0, "score": 0.85, "reasoning": "Strong brand fit..."}]}
        `;

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{"scores": []}');
        
        for (const scoreData of result.scores) {
          const prospectIndex = scoreData.index;
          if (prospectIndex < batch.length) {
            const prospect = { ...batch[prospectIndex] };
            prospect.relevanceScore = scoreData.score;
            prospect.reasoning = scoreData.reasoning;
            scoredProspects.push(prospect);
          }
        }
      } catch (error) {
        console.error('[SponsorshipProspecting] Error scoring batch:', error);
        // Add prospects with default score if AI scoring fails
        batch.forEach(prospect => {
          prospect.relevanceScore = 0.5;
          prospect.reasoning = 'Default scoring due to AI error';
          scoredProspects.push(prospect);
        });
      }
    }

    return scoredProspects;
  }

  private generateSearchSummary(prospects: ProspectProfile[]) {
    const totalFound = prospects.length;
    const averageRelevanceScore = prospects.reduce((sum, p) => sum + p.relevanceScore, 0) / totalFound;
    
    const industries = prospects.map(p => p.industry);
    const industryCount = industries.reduce((acc, industry) => {
      acc[industry] = (acc[industry] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topIndustries = Object.entries(industryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([industry]) => industry);

    let recommendedApproach = '';
    if (averageRelevanceScore > 0.8) {
      recommendedApproach = 'High-quality prospects found. Focus on personalized outreach highlighting audience alignment.';
    } else if (averageRelevanceScore > 0.6) {
      recommendedApproach = 'Good prospects available. Emphasize ROI and audience demographics in outreach.';
    } else {
      recommendedApproach = 'Limited high-quality matches. Consider broadening search criteria or focusing on micro-sponsorships.';
    }

    return {
      totalFound,
      averageRelevanceScore,
      topIndustries,
      recommendedApproach
    };
  }

  async generateSponsorshipPitch(prospect: ProspectProfile, userMetrics: {
    followerCount: number;
    avgViews: number;
    engagementRate: number;
    demographics: {
      ageRange: string;
      topLocations: string[];
      interests: string[];
    };
  }, contentNiche: string): Promise<SponsorshipPitch> {
    try {
      const prompt = `
        Create a personalized sponsorship pitch email for:
        
        Prospect: ${prospect.name}, ${prospect.title} at ${prospect.company}
        Industry: ${prospect.industry}
        Company Size: ${prospect.companySize} employees
        
        Creator Metrics:
        - ${userMetrics.followerCount} followers
        - ${userMetrics.avgViews} average views
        - ${userMetrics.engagementRate}% engagement rate
        - Audience: ${userMetrics.demographics.ageRange}, primarily in ${userMetrics.demographics.topLocations.join(', ')}
        - Content: ${contentNiche}
        
        Generate:
        1. Compelling subject line
        2. 200-word email body (professional, value-focused)
        3. One-slide deck snippet text
        4. Clear call-to-action
        5. Two follow-up email templates
        
        Return JSON format: {"subject": "", "emailBody": "", "deckSnippet": "", "cta": "", "followUpSequence": []}
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        subject: result.subject || `Partnership Opportunity - ${userMetrics.followerCount} Engaged ${contentNiche} Audience`,
        emailBody: result.emailBody || 'Generic pitch email body...',
        deckSnippet: result.deckSnippet || 'One-page sponsor deck content...',
        cta: result.cta || 'Would you be interested in exploring a partnership?',
        followUpSequence: result.followUpSequence || ['Follow-up 1', 'Follow-up 2']
      };
    } catch (error) {
      console.error('[SponsorshipProspecting] Error generating pitch:', error);
      
      // Fallback pitch
      return {
        subject: `Partnership Opportunity - ${userMetrics.followerCount} Engaged ${contentNiche} Audience`,
        emailBody: `Hi ${prospect.name},\n\nI'm reaching out regarding a potential partnership between ${prospect.company} and my ${contentNiche} content.\n\nWith ${userMetrics.followerCount} highly engaged followers averaging ${userMetrics.avgViews} views per post, I believe there's strong alignment with your target audience.\n\nWould you be open to a brief call to discuss partnership opportunities?\n\nBest regards`,
        deckSnippet: `${prospect.company} x Creator Partnership\n\n${userMetrics.followerCount} followers | ${userMetrics.engagementRate}% engagement\nPrimary audience: ${userMetrics.demographics.ageRange}\nContent focus: ${contentNiche}`,
        cta: 'Schedule a 15-minute call to discuss partnership opportunities',
        followUpSequence: [
          'Quick follow-up on partnership opportunity',
          'Final follow-up - partnership proposal attached'
        ]
      };
    }
  }

  async trackProspectInteractions(userId: string, prospectId: string, interaction: {
    type: 'email_sent' | 'email_opened' | 'email_replied' | 'meeting_scheduled' | 'deal_closed';
    timestamp: Date;
    notes?: string;
    value?: number;
  }): Promise<void> {
    try {
      // Store interaction in database for tracking
      console.log(`[SponsorshipProspecting] Tracking interaction: ${interaction.type} for prospect ${prospectId}`);
      
      // In a real implementation, this would save to database
      // await storage.createProspectInteraction({
      //   userId,
      //   prospectId,
      //   ...interaction
      // });
    } catch (error) {
      console.error('[SponsorshipProspecting] Error tracking interaction:', error);
    }
  }

  async generateProspectingReport(userId: string, startDate: Date, endDate: Date): Promise<{
    summary: {
      totalProspects: number;
      emailsSent: number;
      responseRate: number;
      meetingsScheduled: number;
      dealsInProgress: number;
      totalRevenue: number;
    };
    topPerformingIndustries: Array<{
      industry: string;
      responseRate: number;
      avgDealValue: number;
    }>;
    recommendations: string[];
  }> {
    // This would query actual interaction data from database
    // For now, return mock structure
    return {
      summary: {
        totalProspects: 0,
        emailsSent: 0,
        responseRate: 0,
        meetingsScheduled: 0,
        dealsInProgress: 0,
        totalRevenue: 0
      },
      topPerformingIndustries: [],
      recommendations: [
        'Set up Apollo API key to begin prospecting',
        'Connect LinkedIn account for enhanced company insights',
        'Define your content niche for better targeting'
      ]
    };
  }
}

export const sponsorshipProspectingService = new SponsorshipProspectingService();