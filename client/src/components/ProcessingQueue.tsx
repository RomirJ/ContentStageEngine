import { useQuery } from "@tanstack/react-query";

interface ProcessingItem {
  id: string;
  originalName: string;
  status: string;
}
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Video, Mic, Clock, CheckCircle, AlertCircle } from "lucide-react";

export default function ProcessingQueue() {
  const { data: processingItems = [], isLoading } = useQuery<ProcessingItem[]>({
    queryKey: ["/api/processing-status"],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'transcribing':
        return <Mic className="w-4 h-4 text-blue-500" />;
      case 'segmenting':
        return <Video className="w-4 h-4 text-purple-500" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'Queued...';
      case 'transcribing':
        return 'Transcribing...';
      case 'segmenting':
        return 'Segmenting...';
      case 'processing':
        return 'Generating clips...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Processing...';
    }
  };

  const getProgress = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 10;
      case 'transcribing':
        return 30;
      case 'segmenting':
        return 60;
      case 'processing':
        return 80;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-white shadow-sm border border-slate-200">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Processing Queue</h3>
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="processing-item animate-pulse">
                <div className="w-12 h-12 bg-slate-200 rounded-lg mr-4"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded mb-2"></div>
                  <div className="h-2 bg-slate-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white shadow-sm border border-slate-200">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Processing Queue</h3>
        
        {!processingItems || processingItems.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No files currently processing</p>
            <p className="text-sm text-slate-400 mt-1">Upload a file to see it here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {processingItems.map((item: any) => (
              <div key={item.id} className="processing-item">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mr-4">
                  {getStatusIcon(item.status)}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900 mb-1">{item.originalName}</p>
                  <div className="flex items-center mb-1">
                    <Progress value={getProgress(item.status)} className="flex-1 mr-3 h-2" />
                    <span className="text-sm text-slate-500 min-w-[3rem]">
                      {getProgress(item.status)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{getStatusText(item.status)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <Button 
          variant="ghost" 
          className="w-full mt-4 text-primary hover:bg-blue-50"
          size="sm"
        >
          View All Processing Jobs
        </Button>
      </CardContent>
    </Card>
  );
}
