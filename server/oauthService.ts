import { storage } from './storage';

interface OAuthToken {
  platform: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string[];
  tokenType: 'Bearer' | 'OAuth';
}

interface PlatformConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  apiBaseUrl: string;
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
    apiBaseUrl: 'https://www.googleapis.com/youtube/v3'
  },
  tiktok: {
    clientId: process.env.TIKTOK_CLIENT_ID || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || '',
    authUrl: 'https://www.tiktok.com/auth/authorize/',
    tokenUrl: 'https://open-api.tiktok.com/oauth/access_token/',
    scopes: ['video.upload', 'video.publish'],
    apiBaseUrl: 'https://open-api.tiktok.com'
  },
  twitter: {
    clientId: process.env.TWITTER_CLIENT_ID || '',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
    redirectUri: process.env.TWITTER_REDIRECT_URI || '',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    apiBaseUrl: 'https://api.twitter.com/2'
  },
  instagram: {
    clientId: process.env.INSTAGRAM_CLIENT_ID || '',
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || '',
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: ['user_profile', 'user_media'],
    apiBaseUrl: 'https://graph.instagram.com'
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_liteprofile', 'w_member_social'],
    apiBaseUrl: 'https://api.linkedin.com/v2'
  }
};

export class OAuthService {
  private tokenExpiryAlerts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    // Check for expiring tokens every hour
    setInterval(() => {
      this.checkExpiringTokens();
    }, 60 * 60 * 1000);
  }

  generateAuthUrl(platform: string, state?: string): string {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state: state || '',
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(platform: string, code: string, userId: string): Promise<OAuthToken> {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const tokenData = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    };

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams(tokenData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

    const token: OAuthToken = {
      platform,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: config.scopes,
      tokenType: data.token_type || 'Bearer',
    };

    // Store token securely
    await this.storeToken(userId, token);

    // Set up expiry alert
    this.scheduleExpiryAlert(userId, platform, token.expiresAt);

    return token;
  }

  private async storeToken(userId: string, token: OAuthToken): Promise<void> {
    const account = await storage.getSocialAccountByUserAndPlatform(userId, token.platform);
    
    if (account) {
      // Update existing account
      await storage.updateSocialAccount(account.id, {
        accessToken: this.encryptToken(token.accessToken),
        refreshToken: token.refreshToken ? this.encryptToken(token.refreshToken) : null,
        expiresAt: token.expiresAt.toISOString(),
        scope: token.scope.join(','),
        tokenType: token.tokenType,
        status: 'active'
      });
    } else {
      // Create new account
      await storage.createSocialAccount({
        userId,
        platform: token.platform,
        platformUserId: '', // Will be fetched separately
        username: '', // Will be fetched separately
        accessToken: this.encryptToken(token.accessToken),
        refreshToken: token.refreshToken ? this.encryptToken(token.refreshToken) : null,
        expiresAt: token.expiresAt.toISOString(),
        scope: token.scope.join(','),
        tokenType: token.tokenType,
        status: 'active'
      });
    }
  }

  async refreshToken(userId: string, platform: string): Promise<OAuthToken | null> {
    const account = await storage.getSocialAccountByUserAndPlatform(userId, platform);
    if (!account?.refreshToken) {
      console.warn(`[OAuthService] No refresh token available for ${platform}`);
      return null;
    }

    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const tokenData = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: this.decryptToken(account.refreshToken),
      grant_type: 'refresh_token',
    };

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(tokenData),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[OAuthService] Token refresh failed for ${platform}:`, error);
        
        // Mark account as expired
        await storage.updateSocialAccount(account.id, { status: 'expired' });
        return null;
      }

      const data = await response.json();
      
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

      const newToken: OAuthToken = {
        platform,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
        expiresAt,
        scope: config.scopes,
        tokenType: data.token_type || 'Bearer',
      };

      // Update stored token
      await this.storeToken(userId, newToken);

      // Reschedule expiry alert
      this.scheduleExpiryAlert(userId, platform, newToken.expiresAt);

      console.log(`[OAuthService] Token refreshed successfully for ${platform}`);
      return newToken;
    } catch (error) {
      console.error(`[OAuthService] Error refreshing token for ${platform}:`, error);
      await storage.updateSocialAccount(account.id, { status: 'error' });
      return null;
    }
  }

  async getValidToken(userId: string, platform: string): Promise<string | null> {
    const account = await storage.getSocialAccountByUserAndPlatform(userId, platform);
    if (!account) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(account.expiresAt || 0);

    // If token expires within 5 minutes, try to refresh
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (expiresAt <= fiveMinutesFromNow) {
      console.log(`[OAuthService] Token expiring soon for ${platform}, attempting refresh...`);
      const refreshedToken = await this.refreshToken(userId, platform);
      return refreshedToken ? refreshedToken.accessToken : null;
    }

    return this.decryptToken(account.accessToken || '');
  }

  private scheduleExpiryAlert(userId: string, platform: string, expiresAt: Date): void {
    const alertKey = `${userId}-${platform}`;
    
    // Clear existing alert
    const existingAlert = this.tokenExpiryAlerts.get(alertKey);
    if (existingAlert) {
      clearTimeout(existingAlert);
    }

    // Schedule new alert for 1 hour before expiry
    const alertTime = new Date(expiresAt.getTime() - 60 * 60 * 1000);
    const now = new Date();

    if (alertTime > now) {
      const timeout = setTimeout(() => {
        this.sendExpiryAlert(userId, platform, expiresAt);
      }, alertTime.getTime() - now.getTime());

      this.tokenExpiryAlerts.set(alertKey, timeout);
    }
  }

  private async sendExpiryAlert(userId: string, platform: string, expiresAt: Date): Promise<void> {
    console.warn(`[OAuthService] Token expiry alert: ${platform} token for user ${userId} expires at ${expiresAt}`);
    
    // Here you would send actual notifications (email, in-app, etc.)
    // For now, we'll just log and attempt auto-refresh
    
    const refreshed = await this.refreshToken(userId, platform);
    if (!refreshed) {
      console.error(`[OAuthService] Failed to auto-refresh token for ${platform}. Manual re-authorization required.`);
    }
  }

  private async checkExpiringTokens(): Promise<void> {
    try {
      const accounts = await storage.getAllSocialAccounts();
      const now = new Date();
      const checkTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      for (const account of accounts) {
        if (!account.isActive) continue;

        const expiresAt = new Date(account.expiresAt || 0);
        if (expiresAt <= checkTime) {
          console.log(`[OAuthService] Proactively refreshing token for ${account.platform}`);
          await this.refreshToken(account.userId, account.platform);
        }
      }
    } catch (error) {
      console.error('[OAuthService] Error checking expiring tokens:', error);
    }
  }

  async revokeToken(userId: string, platform: string): Promise<void> {
    const account = await storage.getSocialAccountByUserAndPlatform(userId, platform);
    if (!account) {
      return;
    }

    const config = PLATFORM_CONFIGS[platform];
    if (config) {
      try {
        // Platform-specific revocation logic would go here
        console.log(`[OAuthService] Revoking token for ${platform}`);
      } catch (error) {
        console.error(`[OAuthService] Error revoking token for ${platform}:`, error);
      }
    }

    // Mark account as revoked
    await storage.updateSocialAccount(account.id, { 
      status: 'revoked',
      accessToken: '',
      refreshToken: null
    });

    // Clear expiry alert
    const alertKey = `${userId}-${platform}`;
    const alert = this.tokenExpiryAlerts.get(alertKey);
    if (alert) {
      clearTimeout(alert);
      this.tokenExpiryAlerts.delete(alertKey);
    }
  }

  private encryptToken(token: string): string {
    // In production, use proper encryption (AES-256 with KMS)
    // For demo purposes, we'll use simple base64 encoding
    return Buffer.from(token).toString('base64');
  }

  private decryptToken(encryptedToken: string): string {
    // In production, use proper decryption
    // For demo purposes, we'll use simple base64 decoding
    return Buffer.from(encryptedToken, 'base64').toString('utf8');
  }

  getPlatformConfig(platform: string): PlatformConfig | null {
    return PLATFORM_CONFIGS[platform] || null;
  }

  getSupportedPlatforms(): string[] {
    return Object.keys(PLATFORM_CONFIGS);
  }
}

export const oauthService = new OAuthService();