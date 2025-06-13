import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Wand2, Calendar, Heart } from "lucide-react";

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/analytics/stats"],
  });

  const statsData = [
    {
      title: "Total Uploads",
      value: stats?.totalUploads || 0,
      change: "+12%",
      icon: Upload,
      iconBg: "bg-blue-100",
      iconColor: "text-primary",
    },
    {
      title: "Content Generated", 
      value: stats?.contentGenerated || 0,
      change: "+18%",
      icon: Wand2,
      iconBg: "bg-green-100",
      iconColor: "text-accent",
    },
    {
      title: "Posts Scheduled",
      value: stats?.postsScheduled || 0,
      change: "+7%",
      icon: Calendar,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
    {
      title: "Total Engagement",
      value: stats?.totalEngagement || 0,
      change: "+24%",
      icon: Heart,
      iconBg: "bg-purple-100", 
      iconColor: "text-purple-600",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="stats-card">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-8 bg-slate-200 rounded w-16"></div>
                  </div>
                  <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
                </div>
                <div className="flex items-center mt-4">
                  <div className="h-4 bg-slate-200 rounded w-12"></div>
                  <div className="h-4 bg-slate-200 rounded w-20 ml-2"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="stats-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {typeof stat.value === 'number' && stat.value > 1000 
                      ? `${(stat.value / 1000).toFixed(1)}k`
                      : stat.value
                    }
                  </p>
                </div>
                <div className={`w-12 h-12 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                </div>
              </div>
              <div className="flex items-center mt-4">
                <span className="text-accent text-sm font-medium">{stat.change}</span>
                <span className="text-slate-500 text-sm ml-2">vs last month</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
