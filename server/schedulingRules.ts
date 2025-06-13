interface TimeSlot {
  day: number; // 0-6 (Sunday-Saturday)
  hour: number; // 0-23
  minute: number; // 0-59
}

interface PlatformRules {
  platform: string;
  timezone: string;
  vertical: string;
  bestTimes: TimeSlot[];
  avoidTimes: TimeSlot[];
  frequency: {
    maxPerDay: number;
    minHoursBetween: number;
  };
  engagement: {
    peakHours: number[];
    lowHours: number[];
  };
}

interface SchedulingRecommendation {
  suggestedTime: Date;
  confidence: number;
  reason: string;
  alternativeTimes: Date[];
}

export class SchedulingRulesEngine {
  private rules: Map<string, PlatformRules[]> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    // YouTube rules by vertical and timezone
    this.addRule({
      platform: 'youtube',
      timezone: 'America/New_York',
      vertical: 'general',
      bestTimes: [
        { day: 1, hour: 14, minute: 0 }, // Monday 2 PM
        { day: 2, hour: 15, minute: 0 }, // Tuesday 3 PM
        { day: 3, hour: 14, minute: 0 }, // Wednesday 2 PM
        { day: 4, hour: 15, minute: 0 }, // Thursday 3 PM
        { day: 5, hour: 12, minute: 0 }, // Friday 12 PM
        { day: 6, hour: 10, minute: 0 }, // Saturday 10 AM
        { day: 0, hour: 14, minute: 0 }, // Sunday 2 PM
      ],
      avoidTimes: [
        { day: 1, hour: 6, minute: 0 },  // Monday 6 AM
        { day: 5, hour: 18, minute: 0 }, // Friday 6 PM
      ],
      frequency: {
        maxPerDay: 1,
        minHoursBetween: 24,
      },
      engagement: {
        peakHours: [14, 15, 16, 20, 21],
        lowHours: [0, 1, 2, 3, 4, 5, 6],
      },
    });

    // TikTok rules
    this.addRule({
      platform: 'tiktok',
      timezone: 'America/New_York',
      vertical: 'general',
      bestTimes: [
        { day: 1, hour: 6, minute: 0 },  // Monday 6 AM
        { day: 2, hour: 10, minute: 0 }, // Tuesday 10 AM
        { day: 3, hour: 7, minute: 0 },  // Wednesday 7 AM
        { day: 4, hour: 9, minute: 0 },  // Thursday 9 AM
        { day: 5, hour: 5, minute: 0 },  // Friday 5 AM
        { day: 6, hour: 11, minute: 0 }, // Saturday 11 AM
        { day: 0, hour: 7, minute: 0 },  // Sunday 7 AM
      ],
      avoidTimes: [
        { day: 0, hour: 15, minute: 0 }, // Sunday 3 PM
      ],
      frequency: {
        maxPerDay: 3,
        minHoursBetween: 4,
      },
      engagement: {
        peakHours: [6, 10, 19, 20, 21],
        lowHours: [13, 14, 15, 16],
      },
    });

    // Twitter/X rules
    this.addRule({
      platform: 'twitter',
      timezone: 'America/New_York',
      vertical: 'general',
      bestTimes: [
        { day: 1, hour: 8, minute: 0 },  // Monday 8 AM
        { day: 1, hour: 19, minute: 0 }, // Monday 7 PM
        { day: 2, hour: 8, minute: 0 },  // Tuesday 8 AM
        { day: 3, hour: 9, minute: 0 },  // Wednesday 9 AM
        { day: 4, hour: 8, minute: 0 },  // Thursday 8 AM
        { day: 5, hour: 7, minute: 0 },  // Friday 7 AM
      ],
      avoidTimes: [
        { day: 6, hour: 15, minute: 0 }, // Saturday 3 PM
        { day: 0, hour: 15, minute: 0 }, // Sunday 3 PM
      ],
      frequency: {
        maxPerDay: 5,
        minHoursBetween: 2,
      },
      engagement: {
        peakHours: [8, 9, 12, 17, 18, 19],
        lowHours: [2, 3, 4, 5],
      },
    });

    // Instagram rules
    this.addRule({
      platform: 'instagram',
      timezone: 'America/New_York',
      vertical: 'general',
      bestTimes: [
        { day: 1, hour: 11, minute: 0 }, // Monday 11 AM
        { day: 2, hour: 13, minute: 0 }, // Tuesday 1 PM
        { day: 3, hour: 11, minute: 0 }, // Wednesday 11 AM
        { day: 4, hour: 14, minute: 0 }, // Thursday 2 PM
        { day: 5, hour: 10, minute: 0 }, // Friday 10 AM
        { day: 6, hour: 10, minute: 0 }, // Saturday 10 AM
        { day: 0, hour: 13, minute: 0 }, // Sunday 1 PM
      ],
      avoidTimes: [],
      frequency: {
        maxPerDay: 2,
        minHoursBetween: 6,
      },
      engagement: {
        peakHours: [11, 13, 17, 19, 20],
        lowHours: [3, 4, 5, 6, 7],
      },
    });

    // LinkedIn rules
    this.addRule({
      platform: 'linkedin',
      timezone: 'America/New_York',
      vertical: 'general',
      bestTimes: [
        { day: 1, hour: 8, minute: 0 },  // Monday 8 AM
        { day: 2, hour: 10, minute: 0 }, // Tuesday 10 AM
        { day: 3, hour: 8, minute: 0 },  // Wednesday 8 AM
        { day: 4, hour: 9, minute: 0 },  // Thursday 9 AM
        { day: 5, hour: 8, minute: 0 },  // Friday 8 AM
      ],
      avoidTimes: [
        { day: 6, hour: 14, minute: 0 }, // Saturday 2 PM
        { day: 0, hour: 14, minute: 0 }, // Sunday 2 PM
      ],
      frequency: {
        maxPerDay: 1,
        minHoursBetween: 24,
      },
      engagement: {
        peakHours: [8, 9, 10, 12, 17],
        lowHours: [19, 20, 21, 22, 23],
      },
    });

    // Add vertical-specific rules
    this.addVerticalSpecificRules();
  }

  private addVerticalSpecificRules(): void {
    // Tech/Business content
    this.addRule({
      platform: 'youtube',
      timezone: 'America/New_York',
      vertical: 'tech',
      bestTimes: [
        { day: 1, hour: 9, minute: 0 },  // Monday 9 AM
        { day: 3, hour: 10, minute: 0 }, // Wednesday 10 AM
        { day: 5, hour: 14, minute: 0 }, // Friday 2 PM
      ],
      avoidTimes: [],
      frequency: { maxPerDay: 1, minHoursBetween: 48 },
      engagement: { peakHours: [9, 10, 14, 15], lowHours: [19, 20, 21] },
    });

    // Entertainment content
    this.addRule({
      platform: 'tiktok',
      timezone: 'America/New_York',
      vertical: 'entertainment',
      bestTimes: [
        { day: 5, hour: 18, minute: 0 }, // Friday 6 PM
        { day: 6, hour: 14, minute: 0 }, // Saturday 2 PM
        { day: 0, hour: 16, minute: 0 }, // Sunday 4 PM
      ],
      avoidTimes: [
        { day: 1, hour: 8, minute: 0 },  // Monday 8 AM
      ],
      frequency: { maxPerDay: 4, minHoursBetween: 3 },
      engagement: { peakHours: [16, 17, 18, 19, 20], lowHours: [6, 7, 8, 9] },
    });

    // Fitness content
    this.addRule({
      platform: 'instagram',
      timezone: 'America/New_York',
      vertical: 'fitness',
      bestTimes: [
        { day: 1, hour: 6, minute: 0 },  // Monday 6 AM
        { day: 3, hour: 7, minute: 0 },  // Wednesday 7 AM
        { day: 5, hour: 6, minute: 0 },  // Friday 6 AM
        { day: 0, hour: 10, minute: 0 }, // Sunday 10 AM
      ],
      avoidTimes: [],
      frequency: { maxPerDay: 2, minHoursBetween: 8 },
      engagement: { peakHours: [6, 7, 17, 18], lowHours: [13, 14, 15] },
    });
  }

  private addRule(rule: PlatformRules): void {
    const key = `${rule.platform}_${rule.timezone}_${rule.vertical}`;
    const existing = this.rules.get(key) || [];
    existing.push(rule);
    this.rules.set(key, existing);
  }

  getOptimalTime(
    platform: string,
    timezone: string = 'America/New_York',
    vertical: string = 'general',
    preferredDate?: Date
  ): SchedulingRecommendation {
    const key = `${platform}_${timezone}_${vertical}`;
    const fallbackKey = `${platform}_${timezone}_general`;
    
    const rules = this.rules.get(key) || this.rules.get(fallbackKey);
    
    if (!rules || rules.length === 0) {
      // Fallback to general rules for the platform
      return this.getFallbackRecommendation(platform, preferredDate);
    }

    const rule = rules[0];
    const now = new Date();
    const targetDate = preferredDate || new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to tomorrow

    // Find the best time slot for the target date
    const bestSlot = this.findBestTimeSlot(rule, targetDate);
    const suggestedTime = this.createDateFromSlot(targetDate, bestSlot);

    // Generate alternative times
    const alternatives = this.generateAlternatives(rule, targetDate, bestSlot);

    return {
      suggestedTime,
      confidence: this.calculateConfidence(rule, bestSlot),
      reason: this.generateReason(platform, vertical, bestSlot),
      alternativeTimes: alternatives,
    };
  }

  private findBestTimeSlot(rule: PlatformRules, targetDate: Date): TimeSlot {
    const targetDay = targetDate.getDay();
    
    // Find slots for the target day
    const daySlots = rule.bestTimes.filter(slot => slot.day === targetDay);
    
    if (daySlots.length > 0) {
      // Return the first best time for that day
      return daySlots[0];
    }

    // If no slots for target day, find the closest day
    const allSlots = rule.bestTimes;
    const sortedSlots = allSlots.sort((a, b) => {
      const aDiff = Math.abs(a.day - targetDay);
      const bDiff = Math.abs(b.day - targetDay);
      return aDiff - bDiff;
    });

    return sortedSlots[0] || { day: targetDay, hour: 12, minute: 0 };
  }

  private createDateFromSlot(baseDate: Date, slot: TimeSlot): Date {
    const result = new Date(baseDate);
    
    // Adjust to the correct day of week
    const dayDiff = slot.day - baseDate.getDay();
    result.setDate(baseDate.getDate() + dayDiff);
    
    // Set the time
    result.setHours(slot.hour, slot.minute, 0, 0);
    
    // If the time is in the past, move to next week
    if (result < new Date()) {
      result.setDate(result.getDate() + 7);
    }
    
    return result;
  }

  private generateAlternatives(rule: PlatformRules, targetDate: Date, selectedSlot: TimeSlot): Date[] {
    const alternatives: Date[] = [];
    
    // Get other time slots for the same day
    const sameDaySlots = rule.bestTimes.filter(
      slot => slot.day === selectedSlot.day && 
      (slot.hour !== selectedSlot.hour || slot.minute !== selectedSlot.minute)
    );
    
    sameDaySlots.forEach(slot => {
      alternatives.push(this.createDateFromSlot(targetDate, slot));
    });

    // Add slots from adjacent days
    const adjacentDays = [
      (selectedSlot.day + 1) % 7,
      (selectedSlot.day + 6) % 7
    ];
    
    adjacentDays.forEach(day => {
      const daySlots = rule.bestTimes.filter(slot => slot.day === day);
      if (daySlots.length > 0) {
        alternatives.push(this.createDateFromSlot(targetDate, daySlots[0]));
      }
    });

    return alternatives.slice(0, 3); // Return top 3 alternatives
  }

  private calculateConfidence(rule: PlatformRules, slot: TimeSlot): number {
    // Calculate confidence based on:
    // 1. If it's a peak engagement hour
    // 2. If it avoids low engagement hours
    // 3. If it respects frequency rules
    
    let confidence = 0.7; // Base confidence
    
    if (rule.engagement.peakHours.includes(slot.hour)) {
      confidence += 0.2;
    }
    
    if (!rule.engagement.lowHours.includes(slot.hour)) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  private generateReason(platform: string, vertical: string, slot: TimeSlot): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[slot.day];
    const hour12 = slot.hour > 12 ? slot.hour - 12 : slot.hour === 0 ? 12 : slot.hour;
    const ampm = slot.hour >= 12 ? 'PM' : 'AM';
    
    return `Optimal ${platform} posting time for ${vertical} content: ${dayName} at ${hour12}:${slot.minute.toString().padStart(2, '0')} ${ampm} shows highest engagement rates.`;
  }

  private getFallbackRecommendation(platform: string, preferredDate?: Date): SchedulingRecommendation {
    const now = new Date();
    const targetDate = preferredDate || new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Generic best times by platform
    const fallbackTimes: { [key: string]: TimeSlot } = {
      youtube: { day: 1, hour: 15, minute: 0 }, // Monday 3 PM
      tiktok: { day: 2, hour: 9, minute: 0 },   // Tuesday 9 AM
      twitter: { day: 1, hour: 8, minute: 0 },  // Monday 8 AM
      instagram: { day: 3, hour: 11, minute: 0 }, // Wednesday 11 AM
      linkedin: { day: 2, hour: 10, minute: 0 }, // Tuesday 10 AM
    };
    
    const slot = fallbackTimes[platform] || { day: 1, hour: 12, minute: 0 };
    
    return {
      suggestedTime: this.createDateFromSlot(targetDate, slot),
      confidence: 0.5,
      reason: `Using general best practice timing for ${platform}`,
      alternativeTimes: [],
    };
  }

  getBestTimesForPlatform(
    platform: string, 
    timezone: string = 'America/New_York', 
    vertical: string = 'general'
  ): TimeSlot[] {
    const key = `${platform}_${timezone}_${vertical}`;
    const fallbackKey = `${platform}_${timezone}_general`;
    
    const rules = this.rules.get(key) || this.rules.get(fallbackKey);
    return rules?.[0]?.bestTimes || [];
  }

  validateFrequencyRules(
    platform: string,
    scheduledPosts: Date[],
    newPostTime: Date,
    timezone: string = 'America/New_York',
    vertical: string = 'general'
  ): { valid: boolean; reason?: string } {
    const key = `${platform}_${timezone}_${vertical}`;
    const rules = this.rules.get(key);
    
    if (!rules || rules.length === 0) {
      return { valid: true };
    }
    
    const rule = rules[0];
    const newPostDate = new Date(newPostTime);
    
    // Check daily frequency
    const sameDay = scheduledPosts.filter(date => {
      const postDate = new Date(date);
      return postDate.toDateString() === newPostDate.toDateString();
    });
    
    if (sameDay.length >= rule.frequency.maxPerDay) {
      return {
        valid: false,
        reason: `Maximum ${rule.frequency.maxPerDay} posts per day limit reached for ${platform}`,
      };
    }
    
    // Check minimum hours between posts
    const recentPosts = scheduledPosts.filter(date => {
      const timeDiff = Math.abs(newPostTime.getTime() - new Date(date).getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      return hoursDiff < rule.frequency.minHoursBetween;
    });
    
    if (recentPosts.length > 0) {
      return {
        valid: false,
        reason: `Minimum ${rule.frequency.minHoursBetween} hours between posts required for ${platform}`,
      };
    }
    
    return { valid: true };
  }

  addCustomRule(rule: PlatformRules): void {
    this.addRule(rule);
  }

  getAvailableVerticals(): string[] {
    const verticals = new Set<string>();
    
    for (const rules of this.rules.values()) {
      rules.forEach(rule => verticals.add(rule.vertical));
    }
    
    return Array.from(verticals);
  }

  getAvailableTimezones(): string[] {
    const timezones = new Set<string>();
    
    for (const rules of this.rules.values()) {
      rules.forEach(rule => timezones.add(rule.timezone));
    }
    
    return Array.from(timezones);
  }
}

export const schedulingRules = new SchedulingRulesEngine();