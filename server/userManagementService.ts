import { storage } from "./storage";
import { User } from "@shared/schema";

interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  brandingConfig: {
    logo?: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
  settings: {
    timezone: string;
    currency: string;
    defaultPlatforms: string[];
    contentGuidelines?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'editor' | 'analyst' | 'sponsor-viewer';
  permissions: string[];
  invitedBy: string;
  joinedAt: Date;
  lastActive: Date;
}

interface UserProfile {
  userId: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  preferences: {
    timezone: string;
    language: string;
    notifications: {
      email: boolean;
      push: boolean;
      digest: boolean;
    };
  };
  onboardingCompleted: boolean;
  lastLogin: Date;
}

interface UsageMetrics {
  workspaceId: string;
  period: 'daily' | 'weekly' | 'monthly';
  date: Date;
  metrics: {
    uploadsCount: number;
    transcriptionMinutes: number;
    segmentsGenerated: number;
    postsScheduled: number;
    apiCalls: number;
    storageUsed: number; // in MB
  };
  costs: {
    transcription: number;
    ai: number;
    storage: number;
    platforms: number;
    total: number;
  };
}

interface BillingPlan {
  id: string;
  name: string;
  tier: 'starter' | 'professional' | 'studio' | 'enterprise';
  limits: {
    workspaces: number;
    uploads: number;
    transcriptionMinutes: number;
    aiGenerations: number;
    storage: number; // in GB
    teamMembers: number;
  };
  pricing: {
    monthly: number;
    yearly: number;
  };
  features: string[];
}

const ROLE_PERMISSIONS = {
  owner: [
    'workspace.manage',
    'workspace.delete',
    'members.invite',
    'members.remove',
    'content.create',
    'content.edit',
    'content.delete',
    'content.publish',
    'analytics.view',
    'analytics.export',
    'billing.manage',
    'settings.manage'
  ],
  editor: [
    'content.create',
    'content.edit',
    'content.delete',
    'content.publish',
    'analytics.view',
    'members.view'
  ],
  analyst: [
    'content.view',
    'analytics.view',
    'analytics.export',
    'members.view'
  ],
  'sponsor-viewer': [
    'content.view',
    'analytics.view'
  ]
};

const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    limits: {
      workspaces: 1,
      uploads: 10,
      transcriptionMinutes: 120,
      aiGenerations: 50,
      storage: 5,
      teamMembers: 2
    },
    pricing: {
      monthly: 29,
      yearly: 290
    },
    features: [
      'Basic transcription',
      'Social media posting',
      'Analytics dashboard',
      'Email support'
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: 'professional',
    limits: {
      workspaces: 3,
      uploads: 100,
      transcriptionMinutes: 1000,
      aiGenerations: 500,
      storage: 50,
      teamMembers: 5
    },
    pricing: {
      monthly: 79,
      yearly: 790
    },
    features: [
      'Advanced AI features',
      'Quote graphics generation',
      'Multi-platform scheduling',
      'Team collaboration',
      'Priority support'
    ]
  },
  {
    id: 'studio',
    name: 'Studio',
    tier: 'studio',
    limits: {
      workspaces: 10,
      uploads: 500,
      transcriptionMinutes: 5000,
      aiGenerations: 2500,
      storage: 200,
      teamMembers: 15
    },
    pricing: {
      monthly: 199,
      yearly: 1990
    },
    features: [
      'White-label branding',
      'API access',
      'Custom integrations',
      'Advanced analytics',
      'Dedicated support'
    ]
  }
];

export class UserManagementService {
  private workspaces: Map<string, Workspace> = new Map();
  private members: Map<string, WorkspaceMember[]> = new Map();
  private profiles: Map<string, UserProfile> = new Map();
  private usage: Map<string, UsageMetrics[]> = new Map();

  async createWorkspace(ownerId: string, data: {
    name: string;
    description?: string;
    brandingConfig?: Partial<Workspace['brandingConfig']>;
    settings?: Partial<Workspace['settings']>;
  }): Promise<Workspace> {
    const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const workspace: Workspace = {
      id: workspaceId,
      name: data.name,
      description: data.description,
      ownerId,
      brandingConfig: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1F2937',
        fontFamily: 'Inter, sans-serif',
        ...data.brandingConfig
      },
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        defaultPlatforms: ['twitter', 'linkedin'],
        ...data.settings
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.workspaces.set(workspaceId, workspace);

    // Add owner as member
    await this.addWorkspaceMember(workspaceId, ownerId, 'owner', ownerId);

    console.log(`[UserManagement] Created workspace: ${workspaceId} for user ${ownerId}`);
    return workspace;
  }

  async getWorkspacesByUser(userId: string): Promise<Workspace[]> {
    const userWorkspaces: Workspace[] = [];
    
    for (const [workspaceId, members] of this.members.entries()) {
      const member = members.find(m => m.userId === userId);
      if (member) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
          userWorkspaces.push(workspace);
        }
      }
    }

    return userWorkspaces.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    return this.workspaces.get(workspaceId);
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const updatedWorkspace = {
      ...workspace,
      ...updates,
      updatedAt: new Date()
    };

    this.workspaces.set(workspaceId, updatedWorkspace);
    console.log(`[UserManagement] Updated workspace: ${workspaceId}`);
  }

  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (workspace.ownerId !== userId) {
      throw new Error('Only workspace owner can delete workspace');
    }

    this.workspaces.delete(workspaceId);
    this.members.delete(workspaceId);
    this.usage.delete(workspaceId);

    console.log(`[UserManagement] Deleted workspace: ${workspaceId}`);
  }

  async addWorkspaceMember(
    workspaceId: string, 
    userId: string, 
    role: WorkspaceMember['role'],
    invitedBy: string
  ): Promise<WorkspaceMember> {
    const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const member: WorkspaceMember = {
      id: memberId,
      workspaceId,
      userId,
      role,
      permissions: ROLE_PERMISSIONS[role],
      invitedBy,
      joinedAt: new Date(),
      lastActive: new Date()
    };

    const workspaceMembers = this.members.get(workspaceId) || [];
    workspaceMembers.push(member);
    this.members.set(workspaceId, workspaceMembers);

    console.log(`[UserManagement] Added member ${userId} to workspace ${workspaceId} as ${role}`);
    return member;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.members.get(workspaceId) || [];
  }

  async updateMemberRole(
    workspaceId: string, 
    userId: string, 
    newRole: WorkspaceMember['role']
  ): Promise<void> {
    const members = this.members.get(workspaceId) || [];
    const memberIndex = members.findIndex(m => m.userId === userId);
    
    if (memberIndex === -1) {
      throw new Error('Member not found');
    }

    members[memberIndex].role = newRole;
    members[memberIndex].permissions = ROLE_PERMISSIONS[newRole];
    
    this.members.set(workspaceId, members);
    console.log(`[UserManagement] Updated member ${userId} role to ${newRole}`);
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const members = this.members.get(workspaceId) || [];
    const filteredMembers = members.filter(m => m.userId !== userId);
    
    this.members.set(workspaceId, filteredMembers);
    console.log(`[UserManagement] Removed member ${userId} from workspace ${workspaceId}`);
  }

  async checkPermission(userId: string, workspaceId: string, permission: string): Promise<boolean> {
    const members = this.members.get(workspaceId) || [];
    const member = members.find(m => m.userId === userId);
    
    if (!member) {
      return false;
    }

    return member.permissions.includes(permission);
  }

  async createUserProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const profile: UserProfile = {
      userId,
      displayName: data.displayName || 'User',
      bio: data.bio,
      avatar: data.avatar,
      preferences: {
        timezone: 'UTC',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          digest: true
        },
        ...data.preferences
      },
      onboardingCompleted: false,
      lastLogin: new Date()
    };

    this.profiles.set(userId, profile);
    console.log(`[UserManagement] Created profile for user: ${userId}`);
    return profile;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return this.profiles.get(userId);
  }

  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    const updatedProfile = { ...profile, ...updates };
    this.profiles.set(userId, updatedProfile);
    console.log(`[UserManagement] Updated profile for user: ${userId}`);
  }

  async completeOnboarding(userId: string): Promise<void> {
    const profile = this.profiles.get(userId);
    if (profile) {
      profile.onboardingCompleted = true;
      this.profiles.set(userId, profile);
    }
  }

  async recordUsage(workspaceId: string, metrics: Partial<UsageMetrics['metrics']>): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const workspaceUsage = this.usage.get(workspaceId) || [];
    let todayUsage = workspaceUsage.find(u => 
      u.date.getTime() === today.getTime() && u.period === 'daily'
    );

    if (!todayUsage) {
      todayUsage = {
        workspaceId,
        period: 'daily',
        date: today,
        metrics: {
          uploadsCount: 0,
          transcriptionMinutes: 0,
          segmentsGenerated: 0,
          postsScheduled: 0,
          apiCalls: 0,
          storageUsed: 0
        },
        costs: {
          transcription: 0,
          ai: 0,
          storage: 0,
          platforms: 0,
          total: 0
        }
      };
      workspaceUsage.push(todayUsage);
    }

    // Update metrics
    Object.assign(todayUsage.metrics, metrics);
    
    // Calculate costs
    todayUsage.costs = {
      transcription: todayUsage.metrics.transcriptionMinutes * 0.006, // $0.006 per minute
      ai: todayUsage.metrics.segmentsGenerated * 0.02, // $0.02 per generation
      storage: todayUsage.metrics.storageUsed * 0.001, // $0.001 per MB
      platforms: todayUsage.metrics.postsScheduled * 0.01, // $0.01 per post
      total: 0
    };
    todayUsage.costs.total = Object.values(todayUsage.costs).reduce((sum, cost) => sum + cost, 0);

    this.usage.set(workspaceId, workspaceUsage);
  }

  async getUsageReport(workspaceId: string, days: number = 30): Promise<{
    currentPeriod: UsageMetrics;
    history: UsageMetrics[];
    limits: BillingPlan['limits'];
    overages: Record<string, number>;
  }> {
    const workspaceUsage = this.usage.get(workspaceId) || [];
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const history = workspaceUsage
      .filter(u => u.date >= cutoffDate)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    // Calculate current period totals
    const currentPeriod: UsageMetrics = {
      workspaceId,
      period: 'monthly',
      date: new Date(),
      metrics: history.reduce((total, usage) => ({
        uploadsCount: total.uploadsCount + usage.metrics.uploadsCount,
        transcriptionMinutes: total.transcriptionMinutes + usage.metrics.transcriptionMinutes,
        segmentsGenerated: total.segmentsGenerated + usage.metrics.segmentsGenerated,
        postsScheduled: total.postsScheduled + usage.metrics.postsScheduled,
        apiCalls: total.apiCalls + usage.metrics.apiCalls,
        storageUsed: total.storageUsed + usage.metrics.storageUsed
      }), {
        uploadsCount: 0,
        transcriptionMinutes: 0,
        segmentsGenerated: 0,
        postsScheduled: 0,
        apiCalls: 0,
        storageUsed: 0
      }),
      costs: history.reduce((total, usage) => ({
        transcription: total.transcription + usage.costs.transcription,
        ai: total.ai + usage.costs.ai,
        storage: total.storage + usage.costs.storage,
        platforms: total.platforms + usage.costs.platforms,
        total: total.total + usage.costs.total
      }), {
        transcription: 0,
        ai: 0,
        storage: 0,
        platforms: 0,
        total: 0
      })
    };

    // Get plan limits (defaulting to professional plan)
    const planLimits = BILLING_PLANS.find(p => p.id === 'professional')!.limits;

    // Calculate overages
    const overages: Record<string, number> = {};
    if (currentPeriod.metrics.uploads > planLimits.uploads) {
      overages.uploads = currentPeriod.metrics.uploads - planLimits.uploads;
    }
    if (currentPeriod.metrics.transcriptionMinutes > planLimits.transcriptionMinutes) {
      overages.transcriptionMinutes = currentPeriod.metrics.transcriptionMinutes - planLimits.transcriptionMinutes;
    }
    if (currentPeriod.metrics.storageUsed > planLimits.storage * 1024) {
      overages.storage = currentPeriod.metrics.storageUsed - (planLimits.storage * 1024);
    }

    return {
      currentPeriod,
      history,
      limits: planLimits,
      overages
    };
  }

  async getBillingPlans(): Promise<BillingPlan[]> {
    return BILLING_PLANS;
  }

  async getOnboardingChecklist(userId: string): Promise<{
    steps: Array<{
      id: string;
      title: string;
      description: string;
      completed: boolean;
      required: boolean;
    }>;
    completionRate: number;
  }> {
    const profile = this.profiles.get(userId);
    const workspaces = await this.getWorkspacesByUser(userId);
    
    const steps = [
      {
        id: 'profile',
        title: 'Complete your profile',
        description: 'Add your name and preferences',
        completed: !!profile?.displayName,
        required: true
      },
      {
        id: 'workspace',
        title: 'Create your first workspace',
        description: 'Set up a workspace for your content',
        completed: workspaces.length > 0,
        required: true
      },
      {
        id: 'upload',
        title: 'Upload your first content',
        description: 'Upload a video or audio file to get started',
        completed: false, // Would check actual uploads
        required: true
      },
      {
        id: 'social',
        title: 'Connect social accounts',
        description: 'Link your social media accounts for posting',
        completed: false, // Would check connected accounts
        required: false
      },
      {
        id: 'schedule',
        title: 'Schedule your first post',
        description: 'Create and schedule content for publishing',
        completed: false, // Would check scheduled posts
        required: false
      }
    ];

    const completed = steps.filter(s => s.completed).length;
    const completionRate = Math.round((completed / steps.length) * 100);

    return { steps, completionRate };
  }
}

export const userManagementService = new UserManagementService();