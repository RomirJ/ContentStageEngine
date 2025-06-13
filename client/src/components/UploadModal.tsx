import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CloudUpload, FileText, X } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export default function UploadModal({ isOpen, onClose, onUpload, isUploading }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a valid file type (MP4, MOV, MP3, WAV)');
      return;
    }

    if (file.size > 500 * 1024 * 1024) { // 500MB
      alert('File size must be less than 500MB');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFile(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Upload Content
            {!isUploading && (
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-blue-50"
                  : "border-slate-300 hover:border-primary hover:bg-blue-50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CloudUpload className="w-8 h-8 text-primary" />
              </div>
              <p className="text-slate-900 font-medium mb-2">Drop your files here</p>
              <p className="text-slate-500 text-sm mb-4">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.mp3,.wav,video/mp4,video/quicktime,audio/mpeg,audio/wav"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary hover:bg-blue-700"
              >
                Select Files
              </Button>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{selectedFile.name}</p>
                    <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {isUploading && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-600">Uploading...</span>
                    <span className="text-sm text-slate-500">Processing will start automatically</span>
                  </div>
                  <Progress value={50} className="h-2" />
                </div>
              )}
            </div>
          )}

          <div className="text-sm text-slate-500 space-y-1">
            <p>• Supported formats: MP4, MOV, MP3, WAV</p>
            <p>• Maximum file size: 500MB</p>
            <p>• Processing time: 2-5 minutes average</p>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadClick}
              disabled={!selectedFile || isUploading}
              className="bg-primary hover:bg-blue-700"
            >
              {isUploading ? "Uploading..." : "Start Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
