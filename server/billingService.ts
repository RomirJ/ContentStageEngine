import { storage } from './storage';

interface UsageMetrics {
  userId: string;
  period: string; // YYYY-MM format
  uploadsCount: number;
  transcriptionMinutes: number;
  segmentsGenerated: number;
  postsScheduled: number;
  apiCalls: number;
  storageUsed: number; // in MB
  bandwidthUsed: number; // in MB
  lastUpdated: Date;
}

interface PricingTier {
  name: string;
  limits: {
    uploads: number;
    transcriptionMinutes: number;
    segments: number;
    posts: number;
    apiCalls: number;
    storage: number; // in MB
    bandwidth: number; // in MB
  };
  pricing: {
    basePrice: number;
    overageRates: {
      uploads: number;
      transcriptionMinutes: number;
      segments: number;
      posts: number;
      apiCalls: number;
      storage: number;
      bandwidth: number;
    };
  };
}

const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    name: 'Free',
    limits: {
      uploads: 5,
      transcriptionMinutes: 30,
      segments: 50,
      posts: 20,
      apiCalls: 1000,
      storage: 1000, // 1GB
      bandwidth: 5000 // 5GB
    },
    pricing: {
      basePrice: 0,
      overageRates: {
        uploads: 2.00,
        transcriptionMinutes: 0.10,
        segments: 0.05,
        posts: 0.20,
        apiCalls: 0.001,
        storage: 0.02,
        bandwidth: 0.01
      }
    }
  },
  creator: {
    name: 'Creator',
    limits: {
      uploads: 50,
      transcriptionMinutes: 300,
      segments: 500,
      posts: 200,
      apiCalls: 10000,
      storage: 10000, // 10GB
      bandwidth: 50000 // 50GB
    },
    pricing: {
      basePrice: 29.00,
      overageRates: {
        uploads: 1.50,
        transcriptionMinutes: 0.08,
        segments: 0.04,
        posts: 0.15,
        apiCalls: 0.0008,
        storage: 0.015,
        bandwidth: 0.008
      }
    }
  },
  studio: {
    name: 'Studio',
    limits: {
      uploads: 200,
      transcriptionMinutes: 1200,
      segments: 2000,
      posts: 1000,
      apiCalls: 50000,
      storage: 100000, // 100GB
      bandwidth: 500000 // 500GB
    },
    pricing: {
      basePrice: 99.00,
      overageRates: {
        uploads: 1.00,
        transcriptionMinutes: 0.06,
        segments: 0.03,
        posts: 0.10,
        apiCalls: 0.0006,
        storage: 0.01,
        bandwidth: 0.005
      }
    }
  },
  enterprise: {
    name: 'Enterprise',
    limits: {
      uploads: -1, // unlimited
      transcriptionMinutes: -1,
      segments: -1,
      posts: -1,
      apiCalls: -1,
      storage: -1,
      bandwidth: -1
    },
    pricing: {
      basePrice: 299.00,
      overageRates: {
        uploads: 0,
        transcriptionMinutes: 0,
        segments: 0,
        posts: 0,
        apiCalls: 0,
        storage: 0,
        bandwidth: 0
      }
    }
  }
};

export class BillingService {
  async recordUsage(userId: string, type: keyof UsageMetrics, amount: number): Promise<void> {
    try {
      const currentPeriod = this.getCurrentPeriod();
      const existing = await this.getUsageMetrics(userId, currentPeriod);
      
      const updated: UsageMetrics = {
        ...existing,
        [type]: (existing[type] as number) + amount,
        lastUpdated: new Date()
      };

      await this.saveUsageMetrics(updated);
      
      // Check for limit violations
      await this.checkLimits(userId, updated);
      
      console.log(`[BillingService] Recorded ${amount} ${type} for user ${userId}`);
    } catch (error) {
      console.error(`[BillingService] Error recording usage:`, error);
    }
  }

  async getUsageMetrics(userId: string, period?: string): Promise<UsageMetrics> {
    const targetPeriod = period || this.getCurrentPeriod();
    
    try {
      // In a real implementation, this would query the database
      // For now, we'll return a default structure
      return {
        userId,
        period: targetPeriod,
        uploadsCount: 0,
        transcriptionMinutes: 0,
        segmentsGenerated: 0,
        postsScheduled: 0,
        apiCalls: 0,
        storageUsed: 0,
        bandwidthUsed: 0,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`[BillingService] Error fetching usage metrics:`, error);
      return {
        userId,
        period: targetPeriod,
        uploadsCount: 0,
        transcriptionMinutes: 0,
        segmentsGenerated: 0,
        postsScheduled: 0,
        apiCalls: 0,
        storageUsed: 0,
        bandwidthUsed: 0,
        lastUpdated: new Date()
      };
    }
  }

  private async saveUsageMetrics(metrics: UsageMetrics): Promise<void> {
    // In a real implementation, this would save to the database
    // For now, we'll just log it
    console.log(`[BillingService] Saving usage metrics for ${metrics.userId}:`, metrics);
  }

  async calculateBill(userId: string, period?: string): Promise<{
    period: string;
    tier: string;
    baseCharge: number;
    overages: Record<string, { used: number; limit: number; overage: number; cost: number }>;
    totalOverages: number;
    totalBill: number;
    dueDate: Date;
  }> {
    const targetPeriod = period || this.getCurrentPeriod();
    const usage = await this.getUsageMetrics(userId, targetPeriod);
    
    // Get user's tier (would normally come from user record)
    const userTier = await this.getUserTier(userId);
    const tier = PRICING_TIERS[userTier];
    
    const overages: Record<string, any> = {};
    let totalOverages = 0;

    // Calculate overages for each metric
    const metrics = ['uploads', 'transcriptionMinutes', 'segments', 'posts', 'apiCalls', 'storage', 'bandwidth'] as const;
    
    for (const metric of metrics) {
      const used = this.getUsageValue(usage, metric);
      const limit = tier.limits[metric === 'uploads' ? 'uploads' : 
                              metric === 'transcriptionMinutes' ? 'transcriptionMinutes' :
                              metric === 'segments' ? 'segments' :
                              metric === 'posts' ? 'posts' :
                              metric === 'apiCalls' ? 'apiCalls' :
                              metric === 'storage' ? 'storage' : 'bandwidth'];
      
      let overage = 0;
      let cost = 0;
      
      if (limit !== -1 && used > limit) {
        overage = used - limit;
        cost = overage * tier.pricing.overageRates[metric === 'uploads' ? 'uploads' :
                                                  metric === 'transcriptionMinutes' ? 'transcriptionMinutes' :
                                                  metric === 'segments' ? 'segments' :
                                                  metric === 'posts' ? 'posts' :
                                                  metric === 'apiCalls' ? 'apiCalls' :
                                                  metric === 'storage' ? 'storage' : 'bandwidth'];
        totalOverages += cost;
      }

      overages[metric] = { used, limit, overage, cost };
    }

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(1); // First of next month

    return {
      period: targetPeriod,
      tier: tier.name,
      baseCharge: tier.pricing.basePrice,
      overages,
      totalOverages,
      totalBill: tier.pricing.basePrice + totalOverages,
      dueDate
    };
  }

  private getUsageValue(usage: UsageMetrics, metric: string): number {
    switch (metric) {
      case 'uploads': return usage.uploadsCount;
      case 'transcriptionMinutes': return usage.transcriptionMinutes;
      case 'segments': return usage.segmentsGenerated;
      case 'posts': return usage.postsScheduled;
      case 'apiCalls': return usage.apiCalls;
      case 'storage': return usage.storageUsed;
      case 'bandwidth': return usage.bandwidthUsed;
      default: return 0;
    }
  }

  async checkLimits(userId: string, usage: UsageMetrics): Promise<{
    withinLimits: boolean;
    violations: string[];
    recommendations: string[];
  }> {
    const userTier = await this.getUserTier(userId);
    const tier = PRICING_TIERS[userTier];
    
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check each limit
    if (tier.limits.uploads !== -1 && usage.uploadsCount > tier.limits.uploads) {
      violations.push(`Upload limit exceeded: ${usage.uploadsCount}/${tier.limits.uploads}`);
      recommendations.push('Consider upgrading your plan for more uploads');
    }

    if (tier.limits.transcriptionMinutes !== -1 && usage.transcriptionMinutes > tier.limits.transcriptionMinutes) {
      violations.push(`Transcription limit exceeded: ${usage.transcriptionMinutes}/${tier.limits.transcriptionMinutes} minutes`);
      recommendations.push('Optimize video length or upgrade for more transcription minutes');
    }

    if (tier.limits.segments !== -1 && usage.segmentsGenerated > tier.limits.segments) {
      violations.push(`Segment limit exceeded: ${usage.segmentsGenerated}/${tier.limits.segments}`);
      recommendations.push('Consider fewer segments per video or upgrade your plan');
    }

    if (tier.limits.posts !== -1 && usage.postsScheduled > tier.limits.posts) {
      violations.push(`Post limit exceeded: ${usage.postsScheduled}/${tier.limits.posts}`);
      recommendations.push('Upgrade to schedule more posts per month');
    }

    if (tier.limits.storage !== -1 && usage.storageUsed > tier.limits.storage) {
      violations.push(`Storage limit exceeded: ${usage.storageUsed}/${tier.limits.storage} MB`);
      recommendations.push('Delete old files or upgrade for more storage');
    }

    // Send alerts if approaching limits (90% threshold)
    if (violations.length === 0) {
      if (tier.limits.uploads !== -1 && usage.uploadsCount > tier.limits.uploads * 0.9) {
        recommendations.push('Approaching upload limit - consider upgrading soon');
      }
      if (tier.limits.transcriptionMinutes !== -1 && usage.transcriptionMinutes > tier.limits.transcriptionMinutes * 0.9) {
        recommendations.push('Approaching transcription limit - optimize content length');
      }
    }

    return {
      withinLimits: violations.length === 0,
      violations,
      recommendations
    };
  }

  private async getUserTier(userId: string): Promise<string> {
    try {
      const user = await storage.getUser(userId);
      // In a real implementation, the user would have a tier field
      // For now, we'll default to 'free'
      return 'free';
    } catch (error) {
      console.error(`[BillingService] Error getting user tier:`, error);
      return 'free';
    }
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async generateInvoice(userId: string, period?: string): Promise<{
    invoiceNumber: string;
    period: string;
    userInfo: any;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    dueDate: Date;
  }> {
    const bill = await this.calculateBill(userId, period);
    const user = await storage.getUser(userId);
    
    const lineItems = [
      {
        description: `${bill.tier} Plan - ${bill.period}`,
        quantity: 1,
        unitPrice: bill.baseCharge,
        total: bill.baseCharge
      }
    ];

    // Add overage line items
    for (const [metric, details] of Object.entries(bill.overages)) {
      if (details.cost > 0) {
        lineItems.push({
          description: `${metric} overage (${details.overage} units)`,
          quantity: details.overage,
          unitPrice: details.cost / details.overage,
          total: details.cost
        });
      }
    }

    const subtotal = bill.totalBill;
    const tax = subtotal * 0.08; // 8% tax rate
    const total = subtotal + tax;

    return {
      invoiceNumber: `INV-${userId}-${bill.period}`,
      period: bill.period,
      userInfo: user,
      lineItems,
      subtotal,
      tax,
      total,
      dueDate: bill.dueDate
    };
  }

  async getUpgradeSuggestions(userId: string): Promise<{
    currentTier: string;
    suggestedTier: string;
    reason: string;
    savings: number;
    benefits: string[];
  }> {
    const usage = await this.getUsageMetrics(userId);
    const currentTier = await this.getUserTier(userId);
    const currentBill = await this.calculateBill(userId);

    // Calculate what the bill would be on each tier
    const tierComparisons = await Promise.all(
      Object.keys(PRICING_TIERS).map(async (tierName) => {
        if (tierName === currentTier) return null;
        
        const tier = PRICING_TIERS[tierName];
        let projectedCost = tier.pricing.basePrice;
        
        // Calculate overages on this tier
        const metrics = ['uploads', 'transcriptionMinutes', 'segments', 'posts', 'apiCalls', 'storage', 'bandwidth'] as const;
        for (const metric of metrics) {
          const used = this.getUsageValue(usage, metric);
          const limit = tier.limits[metric === 'uploads' ? 'uploads' : 
                                  metric === 'transcriptionMinutes' ? 'transcriptionMinutes' :
                                  metric === 'segments' ? 'segments' :
                                  metric === 'posts' ? 'posts' :
                                  metric === 'apiCalls' ? 'apiCalls' :
                                  metric === 'storage' ? 'storage' : 'bandwidth'];
          
          if (limit !== -1 && used > limit) {
            const overage = used - limit;
            projectedCost += overage * tier.pricing.overageRates[metric === 'uploads' ? 'uploads' :
                                                              metric === 'transcriptionMinutes' ? 'transcriptionMinutes' :
                                                              metric === 'segments' ? 'segments' :
                                                              metric === 'posts' ? 'posts' :
                                                              metric === 'apiCalls' ? 'apiCalls' :
                                                              metric === 'storage' ? 'storage' : 'bandwidth'];
          }
        }

        return {
          tier: tierName,
          name: tier.name,
          cost: projectedCost,
          savings: currentBill.totalBill - projectedCost
        };
      })
    );

    const validComparisons = tierComparisons.filter(Boolean);
    const bestOption = validComparisons.reduce((best, current) => 
      current!.savings > (best?.savings || 0) ? current : best, null
    );

    if (!bestOption || bestOption.savings <= 0) {
      return {
        currentTier,
        suggestedTier: currentTier,
        reason: 'Current plan is optimal for your usage',
        savings: 0,
        benefits: []
      };
    }

    const suggestedTierData = PRICING_TIERS[bestOption.tier];
    const benefits = [
      `Save $${bestOption.savings.toFixed(2)} per month`,
      `Higher limits reduce overage charges`,
      `Better value for your usage patterns`
    ];

    return {
      currentTier,
      suggestedTier: bestOption.tier,
      reason: `Based on your current usage, upgrading would save money on overage charges`,
      savings: bestOption.savings,
      benefits
    };
  }

  // Helper methods for recording specific usage types
  async recordUpload(userId: string, fileSizeMB: number): Promise<void> {
    await this.recordUsage(userId, 'uploadsCount', 1);
    await this.recordUsage(userId, 'storageUsed', fileSizeMB);
  }

  async recordTranscription(userId: string, durationMinutes: number): Promise<void> {
    await this.recordUsage(userId, 'transcriptionMinutes', durationMinutes);
    await this.recordUsage(userId, 'apiCalls', 1);
  }

  async recordSegmentGeneration(userId: string, segmentCount: number): Promise<void> {
    await this.recordUsage(userId, 'segmentsGenerated', segmentCount);
    await this.recordUsage(userId, 'apiCalls', segmentCount * 2); // Assuming 2 API calls per segment
  }

  async recordPostScheduling(userId: string, postCount: number): Promise<void> {
    await this.recordUsage(userId, 'postsScheduled', postCount);
    await this.recordUsage(userId, 'apiCalls', postCount);
  }

  async recordBandwidthUsage(userId: string, bandwidthMB: number): Promise<void> {
    await this.recordUsage(userId, 'bandwidthUsed', bandwidthMB);
  }
}

export const billingService = new BillingService();