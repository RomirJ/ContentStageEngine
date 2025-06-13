import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { CloudUpload, Plus } from "lucide-react";
import UploadModal from "./UploadModal";

export default function UploadSection() {
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status}: ${error}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload Successful",
        description: "Your file has been uploaded and processing has started.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/processing-status"] });
      setShowModal(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <Card className="bg-white shadow-sm border border-slate-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Quick Upload</h3>
            <Button 
              onClick={() => setShowModal(true)}
              className="bg-primary hover:bg-blue-700"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Upload
            </Button>
          </div>
          
          <div 
            className="upload-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => setShowModal(true)}
          >
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CloudUpload className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-900 font-medium mb-2">Drop your files here</p>
            <p className="text-slate-500 text-sm mb-4">or click to browse</p>
            <p className="text-xs text-slate-400">Supports MP4, MOV, MP3, WAV</p>
          </div>
          
          <div className="mt-4 flex justify-between text-sm text-slate-500">
            <span>Max file size: 500MB</span>
            <span>Processing time: ~2-5 min</span>
          </div>
        </CardContent>
      </Card>

      <UploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpload={handleFileUpload}
        isUploading={uploadMutation.isPending}
      />
    </>
  );
}
