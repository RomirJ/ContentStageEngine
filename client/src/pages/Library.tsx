import RecentContent from "@/components/RecentContent";
import Sidebar from "@/components/Sidebar";
import { Navigation } from "@/components/Navigation";

export default function LibraryPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6">
        <Navigation title="Content Library" />
        <div className="mt-6">
          <RecentContent />
        </div>
      </div>
    </div>
  );
}
