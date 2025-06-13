import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Twitter, 
  Linkedin, 
  Instagram, 
  Youtube,
  Plus,
  CheckCircle,
  XCircle,
  RefreshCw,
  Unlink
} from "lucide-react";
import { SiTiktok } from "react-icons/si";

interface SocialAccount {
  id: string;
  platform: string;
  accountId: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const platformConfig = {
  twitter: {
    name: "Twitter",
    icon: Twitter,
    color: "bg-blue-500",
    description: "Share posts and engage with your Twitter audience"
  },
  linkedin: {
    name: "LinkedIn",
    icon: Linkedin,
    color: "bg-blue-700",
    description: "Professional content for your LinkedIn network"
  },
  instagram: {
    name: "Instagram",
    icon: Instagram,
    color: "bg-pink-500",
    description: "Visual content for Instagram feed and stories"
  },
  tiktok: {
    name: "TikTok",
    icon: SiTiktok,
    color: "bg-black",
    description: "Short-form video content for TikTok"
  },
  youtube: {
    name: "YouTube",
    icon: Youtube,
    color: "bg-red-500",
    description: "Video content for your YouTube channel"
  }
};

export default function SocialAccountsManager() {
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch connected accounts
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['/api/social-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/social-accounts');
      if (!response.ok) throw new Error('Failed to fetch social accounts');
      return response.json();
    },
  });

  // Connect account mutation
  const connectAccountMutation = useMutation({
    mutationFn: async (platform: string) => {
      // Redirect to OAuth flow
      window.location.href = `/api/auth/${platform}/connect`;
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to connect account",
        description: error.message,
        variant: "destructive",
      });
      setIsConnecting(null);
    },
  });

  // Toggle account status
  const toggleAccountMutation = useMutation({
    mutationFn: async ({ accountId, isActive }: { accountId: string; isActive: boolean }) => {
      return apiRequest(`/api/social-accounts/${accountId}`, 'PATCH', { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] });
      toast({ title: "Account status updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refresh token mutation
  const refreshTokenMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}/refresh`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] });
      toast({ title: "Account refreshed successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to refresh account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect account mutation
  const disconnectAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] });
      toast({ title: "Account disconnected" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to disconnect account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleConnect = (platform: string) => {
    setIsConnecting(platform);
    connectAccountMutation.mutate(platform);
  };

  const getAccountForPlatform = (platform: string) => {
    return accounts.find((account: SocialAccount) => account.platform === platform);
  };

  const isTokenExpired = (account: SocialAccount) => {
    if (!account.expiresAt) return false;
    return new Date(account.expiresAt) < new Date();
  };

  const formatAccountId = (accountId: string) => {
    if (accountId.length > 15) {
      return `${accountId.substring(0, 12)}...`;
    }
    return accountId;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Social Media Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {Object.entries(platformConfig).map(([platform, config]) => {
              const account = getAccountForPlatform(platform);
              const IconComponent = config.icon;
              const isExpired = account ? isTokenExpired(account) : false;

              return (
                <div key={platform} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.color} text-white`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-medium">{config.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {config.description}
                        </p>
                        {account && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Connected as: {formatAccountId(account.accountId)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {account ? (
                        <>
                          <div className="flex items-center gap-2">
                            {isExpired ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                Expired
                              </Badge>
                            ) : (
                              <Badge variant="default" className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Connected
                              </Badge>
                            )}
                            
                            <Switch
                              checked={account.isActive}
                              onCheckedChange={(checked) =>
                                toggleAccountMutation.mutate({
                                  accountId: account.id,
                                  isActive: checked,
                                })
                              }
                              disabled={isExpired || toggleAccountMutation.isPending}
                            />
                          </div>

                          <div className="flex gap-1">
                            {isExpired && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refreshTokenMutation.mutate(account.id)}
                                disabled={refreshTokenMutation.isPending}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectAccountMutation.mutate(account.id)}
                              disabled={disconnectAccountMutation.isPending}
                            >
                              <Unlink className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          onClick={() => handleConnect(platform)}
                          disabled={isConnecting === platform}
                          className={config.color}
                        >
                          {isConnecting === platform ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Connect {config.name}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Account Statistics */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Account Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {accounts.filter((a: SocialAccount) => a.isActive).length}
                </div>
                <div className="text-sm text-muted-foreground">Active Accounts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {accounts.filter((a: SocialAccount) => isTokenExpired(a)).length}
                </div>
                <div className="text-sm text-muted-foreground">Expired Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {accounts.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Connected</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {Object.keys(platformConfig).length - accounts.length}
                </div>
                <div className="text-sm text-muted-foreground">Available Platforms</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}