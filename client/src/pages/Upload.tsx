import UploadSection from "@/components/UploadSection";
import ProcessingQueue from "@/components/ProcessingQueue";
import Sidebar from "@/components/Sidebar";
import { Navigation } from "@/components/Navigation";

export default function UploadPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Navigation title="Upload Content" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UploadSection />
          <ProcessingQueue />
        </div>
      </div>
    </div>
  );
}
