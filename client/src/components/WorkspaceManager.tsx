import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Settings, 
  Users, 
  Crown,
  Edit,
  Trash2,
  UserPlus,
  BarChart3,
  Calendar,
  Palette,
  Globe,
  CreditCard
} from "lucide-react";
import { format } from "date-fns";

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
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'editor' | 'analyst' | 'sponsor-viewer';
  permissions: string[];
  invitedBy: string;
  joinedAt: string;
  lastActive: string;
}

interface UsageReport {
  currentPeriod: {
    metrics: {
      uploadsCount: number;
      transcriptionMinutes: number;
      segmentsGenerated: number;
      postsScheduled: number;
      apiCalls: number;
      storageUsed: number;
    };
    costs: {
      total: number;
    };
  };
  limits: {
    uploads: number;
    transcriptionMinutes: number;
    storage: number;
    teamMembers: number;
  };
  overages: Record<string, number>;
}

export default function WorkspaceManager() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState({
    name: '',
    description: '',
    brandingConfig: {
      primaryColor: '#3B82F6',
      secondaryColor: '#1F2937',
      fontFamily: 'Inter, sans-serif'
    },
    settings: {
      timezone: 'UTC',
      currency: 'USD',
      defaultPlatforms: ['twitter', 'linkedin']
    }
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch workspaces
  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery({
    queryKey: ['/api/workspaces'],
  });

  // Fetch workspace members
  const { data: members = [] } = useQuery({
    queryKey: [`/api/workspaces/${selectedWorkspace}/members`],
    enabled: !!selectedWorkspace,
  });

  // Fetch usage report
  const { data: usageReport } = useQuery({
    queryKey: [`/api/workspaces/${selectedWorkspace}/usage`],
    enabled: !!selectedWorkspace,
  });

  // Create workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: (workspaceData: any) => apiRequest('/api/workspaces', 'POST', workspaceData),
    onSuccess: () => {
      toast({ title: "Workspace created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      setShowCreateDialog(false);
      setNewWorkspace({
        name: '',
        description: '',
        brandingConfig: {
          primaryColor: '#3B82F6',
          secondaryColor: '#1F2937',
          fontFamily: 'Inter, sans-serif'
        },
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          defaultPlatforms: ['twitter', 'linkedin']
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => 
      apiRequest(`/api/workspaces/${id}`, 'PATCH', updates),
    onSuccess: () => {
      toast({ title: "Workspace updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      setShowSettingsDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/workspaces/${id}`, 'DELETE'),
    onSuccess: () => {
      toast({ title: "Workspace deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      setSelectedWorkspace(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      owner: "bg-purple-100 text-purple-800",
      editor: "bg-blue-100 text-blue-800",
      analyst: "bg-green-100 text-green-800",
      'sponsor-viewer': "bg-gray-100 text-gray-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsagePercentage = (used: number, limit: number) => {
    return Math.round((used / limit) * 100);
  };

  const selectedWorkspaceData = workspaces.find((w: Workspace) => w.id === selectedWorkspace);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Workspace Management</h2>
          <p className="text-muted-foreground">
            Manage your workspaces, team members, and settings
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Workspace Name</Label>
                  <Input
                    value={newWorkspace.name}
                    onChange={(e) => setNewWorkspace({...newWorkspace, name: e.target.value})}
                    placeholder="My Awesome Brand"
                  />
                </div>
                <div>
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={newWorkspace.brandingConfig.primaryColor}
                      onChange={(e) => setNewWorkspace({
                        ...newWorkspace,
                        brandingConfig: {...newWorkspace.brandingConfig, primaryColor: e.target.value}
                      })}
                      className="w-12 h-8 p-1"
                    />
                    <Input
                      value={newWorkspace.brandingConfig.primaryColor}
                      onChange={(e) => setNewWorkspace({
                        ...newWorkspace,
                        brandingConfig: {...newWorkspace.brandingConfig, primaryColor: e.target.value}
                      })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <Label>Description</Label>
                <Textarea
                  value={newWorkspace.description}
                  onChange={(e) => setNewWorkspace({...newWorkspace, description: e.target.value})}
                  placeholder="Brief description of this workspace"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Timezone</Label>
                  <Select 
                    value={newWorkspace.settings.timezone}
                    onValueChange={(value) => setNewWorkspace({
                      ...newWorkspace,
                      settings: {...newWorkspace.settings, timezone: value}
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Berlin">Berlin</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select 
                    value={newWorkspace.settings.currency}
                    onValueChange={(value) => setNewWorkspace({
                      ...newWorkspace,
                      settings: {...newWorkspace.settings, currency: value}
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => createWorkspaceMutation.mutate(newWorkspace)}
                  disabled={!newWorkspace.name || createWorkspaceMutation.isPending}
                >
                  Create Workspace
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Workspaces List */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Your Workspaces
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workspacesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse border rounded-lg p-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No workspaces found</p>
                <p className="text-xs">Create your first workspace to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {workspaces.map((workspace: Workspace) => (
                  <div 
                    key={workspace.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      selectedWorkspace === workspace.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedWorkspace(workspace.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold">{workspace.name}</h4>
                      <Crown className="h-4 w-4 text-purple-500" />
                    </div>
                    {workspace.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {workspace.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Created {format(new Date(workspace.createdAt), 'MMM dd, yyyy')}</span>
                      <div 
                        className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: workspace.brandingConfig.primaryColor }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workspace Details */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {selectedWorkspaceData ? selectedWorkspaceData.name : 'Select a Workspace'}
              </span>
              {selectedWorkspaceData && (
                <div className="flex gap-2">
                  <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Users className="h-4 w-4 mr-1" />
                        Members
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Workspace Members</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">
                            {members.length} member{members.length !== 1 ? 's' : ''}
                          </p>
                          <Button size="sm">
                            <UserPlus className="h-4 w-4 mr-1" />
                            Invite Member
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {members.map((member: WorkspaceMember) => (
                            <div key={member.id} className="flex items-center justify-between border rounded-lg p-3">
                              <div>
                                <p className="font-medium">User {member.userId}</p>
                                <p className="text-sm text-muted-foreground">
                                  Joined {format(new Date(member.joinedAt), 'MMM dd, yyyy')}
                                </p>
                              </div>
                              <Badge className={getRoleColor(member.role)}>
                                {member.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Edit className="h-4 w-4 mr-1" />
                        Settings
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Workspace Settings</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {/* Settings form would go here */}
                        <p className="text-muted-foreground">
                          Workspace settings management coming soon...
                        </p>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this workspace?')) {
                        deleteWorkspaceMutation.mutate(selectedWorkspace!);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedWorkspaceData ? (
              <div className="text-center py-12 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a workspace to view details</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Workspace Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Workspace ID</Label>
                    <p className="text-sm font-mono bg-gray-50 p-2 rounded">
                      {selectedWorkspaceData.id}
                    </p>
                  </div>
                  <div>
                    <Label>Owner</Label>
                    <p className="text-sm">{selectedWorkspaceData.ownerId}</p>
                  </div>
                </div>

                {/* Branding */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Branding
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Primary Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <div 
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: selectedWorkspaceData.brandingConfig.primaryColor }}
                        ></div>
                        <span className="text-sm font-mono">
                          {selectedWorkspaceData.brandingConfig.primaryColor}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label>Font Family</Label>
                      <p className="text-sm mt-1">{selectedWorkspaceData.brandingConfig.fontFamily}</p>
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <p className="text-sm mt-1">{selectedWorkspaceData.settings.timezone}</p>
                    </div>
                  </div>
                </div>

                {/* Usage Overview */}
                {usageReport && (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Usage & Billing
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm">
                            <span>Uploads</span>
                            <span>{usageReport.currentPeriod.metrics.uploadsCount} / {usageReport.limits.uploads}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ 
                                width: `${getUsagePercentage(usageReport.currentPeriod.metrics.uploadsCount, usageReport.limits.uploads)}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm">
                            <span>Transcription</span>
                            <span>{usageReport.currentPeriod.metrics.transcriptionMinutes} / {usageReport.limits.transcriptionMinutes} min</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ 
                                width: `${getUsagePercentage(usageReport.currentPeriod.metrics.transcriptionMinutes, usageReport.limits.transcriptionMinutes)}%` 
                              }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm">
                            <span>Storage</span>
                            <span>{formatBytes(usageReport.currentPeriod.metrics.storageUsed)} / {usageReport.limits.storage}GB</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-purple-600 h-2 rounded-full" 
                              style={{ 
                                width: `${getUsagePercentage(usageReport.currentPeriod.metrics.storageUsed, usageReport.limits.storage * 1024)}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CreditCard className="h-4 w-4" />
                          <span className="font-medium">Current Month</span>
                        </div>
                        <div className="text-2xl font-bold">
                          ${usageReport.currentPeriod.costs.total.toFixed(2)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {usageReport.currentPeriod.metrics.postsScheduled} posts scheduled
                        </p>
                        
                        {Object.keys(usageReport.overages).length > 0 && (
                          <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded">
                            <p className="text-xs text-orange-700 font-medium">
                              Usage overages detected
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}