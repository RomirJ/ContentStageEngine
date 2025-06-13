import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Share, 
  MoreVertical, 
  Eye, 
  Video, 
  Mic,
  Clock,
  CheckCircle,
  AlertCircle
} from "lucide-react";

export default function RecentContent() {
  const { data: uploads, isLoading } = useQuery({
    queryKey: ["/api/uploads"],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>;
      case 'processing':
      case 'transcribing':
      case 'segmenting':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Processing
        </Badge>;
      case 'failed':
        return <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>;
      default:
        return <Badge variant="outline">
          <Clock className="w-3 h-3 mr-1" />
          Uploaded
        </Badge>;
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('video/')) {
      return <Video className="w-4 h-4 text-blue-500" />;
    } else if (mimeType?.startsWith('audio/')) {
      return <Mic className="w-4 h-4 text-green-500" />;
    }
    return <Video className="w-4 h-4 text-slate-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card className="bg-white shadow-sm border border-slate-200">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Content</h3>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="content-card animate-pulse">
                <div className="w-20 h-12 bg-slate-200 rounded mr-4"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Recent Content</h3>
          <Button variant="ghost" className="text-primary hover:text-blue-700">
            View All
          </Button>
        </div>

        {!uploads || uploads.length === 0 ? (
          <div className="text-center py-8">
            <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No content uploaded yet</p>
            <p className="text-sm text-slate-400 mt-1">Upload your first file to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {uploads.slice(0, 5).map((upload: any) => (
              <div key={upload.id} className="content-card">
                <div className="relative mr-4 flex-shrink-0">
                  <div className="w-20 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded flex items-center justify-center">
                    {getFileIcon(upload.mimeType)}
                  </div>
                  <div className="absolute -bottom-1 -right-1">
                    {getStatusBadge(upload.status)}
                  </div>
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 mb-1">
                    {upload.originalName}
                  </h4>
                  <p className="text-sm text-slate-500 mb-2">
                    {upload.status === 'completed' 
                      ? `Content generated • ${formatFileSize(upload.fileSize)}`
                      : `${upload.status} • ${formatFileSize(upload.fileSize)}`
                    }
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-slate-400">
                    {upload.duration && (
                      <span>{formatDuration(parseFloat(upload.duration))} duration</span>
                    )}
                    <span>{new Date(upload.createdAt).toLocaleDateString()}</span>
                    {upload.status === 'completed' && (
                      <span className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        Ready for download
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 hover:bg-slate-100"
                    disabled={upload.status !== 'completed'}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 hover:bg-slate-100"
                    disabled={upload.status !== 'completed'}
                  >
                    <Share className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 hover:bg-slate-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
