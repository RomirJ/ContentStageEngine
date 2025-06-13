import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkspaceManager from "@/components/WorkspaceManager";
import QuoteGraphicsGenerator from "@/components/QuoteGraphicsGenerator";
import { Settings, Globe, Image, Users, CreditCard } from "lucide-react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("workspaces");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <Settings className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Settings</h1>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 max-w-md">
                <TabsTrigger value="workspaces" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Workspaces
                </TabsTrigger>
                <TabsTrigger value="graphics" className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Graphics
                </TabsTrigger>
                <TabsTrigger value="team" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Team
                </TabsTrigger>
                <TabsTrigger value="billing" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Billing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workspaces" className="mt-6">
                <WorkspaceManager />
              </TabsContent>

              <TabsContent value="graphics" className="mt-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold mb-2">Quote Graphics</h3>
                    <p className="text-muted-foreground mb-6">
                      Generate shareable quote graphics from your content segments
                    </p>
                  </div>
                  {/* Demo segment ID for testing */}
                  <QuoteGraphicsGenerator segmentId="demo-segment-123" />
                </div>
              </TabsContent>

              <TabsContent value="team" className="mt-6">
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Team Management</h3>
                  <p className="text-muted-foreground">
                    Team collaboration features coming soon
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="billing" className="mt-6">
                <div className="text-center py-12">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Billing & Plans</h3>
                  <p className="text-muted-foreground">
                    Billing management interface coming soon
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}