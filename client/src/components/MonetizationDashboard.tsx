import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Target,
  Mail,
  ExternalLink,
  Zap,
  BarChart3,
  RefreshCw,
  Copy,
  CheckCircle,
  Clock,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface RevenueReport {
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
}

interface SponsorshipProspect {
  id: string;
  companyName: string;
  industry: string;
  contactEmail: string;
  contactName: string;
  estimatedBudget: number;
  relevanceScore: number;
  status: 'prospecting' | 'contacted' | 'negotiating' | 'accepted' | 'rejected';
  proposedRate: number;
}

interface CTAPerformance {
  type: string;
  url: string;
  text: string;
  clickThrough: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  revenuePerClick: number;
}

export default function MonetizationDashboard() {
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [outreachContent, setOutreachContent] = useState("");
  const [newCTA, setNewCTA] = useState({
    type: 'affiliate',
    url: '',
    text: '',
    platform: ['twitter']
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch monetization dashboard data
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['/api/monetization/dashboard'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch revenue report
  const { data: revenueReport, isLoading: revenueLoading } = useQuery({
    queryKey: ['/api/monetization/revenue'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Fetch CTA performance
  const { data: ctaPerformance = [], isLoading: ctaLoading } = useQuery({
    queryKey: ['/api/monetization/cta/performance'],
    refetchInterval: 60000,
  });

  // Sync revenue data mutation
  const syncRevenueMutation = useMutation({
    mutationFn: () => apiRequest('/api/monetization/sync', 'POST'),
    onSuccess: () => {
      toast({ title: "Revenue data synced successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/monetization/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monetization/dashboard'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sync revenue data",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Search prospects mutation
  const searchProspectsMutation = useMutation({
    mutationFn: () => apiRequest('/api/monetization/prospects/search', 'POST'),
    onSuccess: () => {
      toast({ title: "New prospects found" });
      queryClient.invalidateQueries({ queryKey: ['/api/monetization/dashboard'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to search prospects",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate outreach mutation
  const generateOutreachMutation = useMutation({
    mutationFn: (prospectId: string) => apiRequest(`/api/monetization/prospects/${prospectId}/outreach`, 'POST'),
    onSuccess: (data) => {
      setOutreachContent(data.email);
      toast({ title: "Outreach email generated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate outreach",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update prospect status mutation
  const updateProspectMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) => 
      apiRequest(`/api/monetization/prospects/${id}`, 'PATCH', { status, notes }),
    onSuccess: () => {
      toast({ title: "Prospect updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/monetization/dashboard'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update prospect",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add CTA mutation
  const addCTAMutation = useMutation({
    mutationFn: (ctaConfig: any) => apiRequest('/api/monetization/cta', 'POST', ctaConfig),
    onSuccess: () => {
      toast({ title: "CTA added successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/monetization/cta/performance'] });
      setNewCTA({ type: 'affiliate', url: '', text: '', platform: ['twitter'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add CTA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      youtube: "#FF0000",
      twitter: "#1DA1F2",
      linkedin: "#0077B5",
      instagram: "#E4405F",
      tiktok: "#000000",
    };
    return colors[platform] || "#6B7280";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      prospecting: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      negotiating: "bg-purple-100 text-purple-800",
      accepted: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (dashboardLoading || revenueLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const revenue = revenueReport as RevenueReport;
  const prospects = dashboard?.activeProspects || [];
  const recommendations = dashboard?.recommendations || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Monetization Dashboard</h2>
          <p className="text-muted-foreground">
            Track revenue, manage sponsorships, and optimize monetization
          </p>
        </div>
        <Button
          onClick={() => syncRevenueMutation.mutate()}
          disabled={syncRevenueMutation.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Sync Revenue
        </Button>
      </div>

      {/* Revenue Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 text-white rounded-lg">
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{formatCurrency(revenue?.totalRevenue || 0)}</div>
                <div className="text-sm text-muted-foreground">Total Revenue (30d)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 text-white rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{formatCurrency(revenue?.projectedMonthly || 0)}</div>
                <div className="text-sm text-muted-foreground">Projected Monthly</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 text-white rounded-lg">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{prospects.length}</div>
                <div className="text-sm text-muted-foreground">Active Prospects</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white rounded-lg">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{ctaPerformance.length}</div>
                <div className="text-sm text-muted-foreground">Active CTAs</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Platform Revenue Breakdown */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Platform Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenue?.platformBreakdown || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="platform" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="revenue" fill="#8884d8">
                  {revenue?.platformBreakdown?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getPlatformColor(entry.platform)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Earning Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Earning Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {revenue?.topEarningPosts?.slice(0, 5).map((post, index) => (
                <div key={post.postId} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">#{index + 1}</span>
                      <Badge 
                        className="text-white"
                        style={{ backgroundColor: getPlatformColor(post.platform) }}
                      >
                        {post.platform.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {post.views.toLocaleString()} views • CPM ${post.cpm}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(post.earnings)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Sponsorship Prospects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Sponsorship Prospects
            </CardTitle>
            <Button
              size="sm"
              onClick={() => searchProspectsMutation.mutate()}
              disabled={searchProspectsMutation.isPending}
            >
              Find Prospects
            </Button>
          </CardHeader>
          <CardContent>
            {prospects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No active prospects</p>
                <p className="text-xs">Click "Find Prospects" to discover potential sponsors</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {prospects.map((prospect: SponsorshipProspect) => (
                  <div key={prospect.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{prospect.companyName}</h4>
                        <p className="text-sm text-muted-foreground">{prospect.industry}</p>
                        <p className="text-sm">{prospect.contactName} • {prospect.contactEmail}</p>
                      </div>
                      <Badge className={getStatusColor(prospect.status)}>
                        {prospect.status}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span>Budget: {formatCurrency(prospect.estimatedBudget)}</span>
                      <span>Proposed: {formatCurrency(prospect.proposedRate)}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedProspect(prospect.id);
                          generateOutreachMutation.mutate(prospect.id);
                        }}
                        disabled={generateOutreachMutation.isPending}
                      >
                        Generate Email
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateProspectMutation.mutate({
                          id: prospect.id,
                          status: 'contacted'
                        })}
                      >
                        Mark Contacted
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Outreach Email Generator */}
            {selectedProspect && outreachContent && (
              <div className="mt-6 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Generated Outreach Email</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(outreachContent)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <Textarea
                  value={outreachContent}
                  onChange={(e) => setOutreachContent(e.target.value)}
                  rows={8}
                  className="mb-3"
                />
                <Button size="sm" className="w-full">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in Email Client
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CTA Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              CTA Performance & Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* CTA Performance */}
            <div className="space-y-4 mb-6">
              <h4 className="font-semibold">Active CTAs</h4>
              {ctaPerformance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No CTAs configured</p>
              ) : (
                ctaPerformance.map((cta: CTAPerformance, index: number) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge>{cta.type}</Badge>
                      <span className="text-sm font-medium">{formatCurrency(cta.revenue)}</span>
                    </div>
                    <p className="text-sm mb-2">{cta.text}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>Clicks: {cta.clickThrough}</span>
                      <span>Conversions: {cta.conversions}</span>
                      <span>Rate: {(cta.conversionRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add New CTA */}
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Add New CTA</h4>
              <div className="space-y-3">
                <Select value={newCTA.type} onValueChange={(value) => setNewCTA({...newCTA, type: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="CTA Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="affiliate">Affiliate Link</SelectItem>
                    <SelectItem value="merch">Merchandise</SelectItem>
                    <SelectItem value="course">Course/Product</SelectItem>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="URL"
                  value={newCTA.url}
                  onChange={(e) => setNewCTA({...newCTA, url: e.target.value})}
                />

                <Input
                  placeholder="CTA Text"
                  value={newCTA.text}
                  onChange={(e) => setNewCTA({...newCTA, text: e.target.value})}
                />

                <Button
                  className="w-full"
                  onClick={() => addCTAMutation.mutate({
                    ...newCTA,
                    active: true
                  })}
                  disabled={!newCTA.url || !newCTA.text || addCTAMutation.isPending}
                >
                  Add CTA
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec: string, index: number) => (
                <div key={index} className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <p className="text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}