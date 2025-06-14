import Sidebar from "@/components/Sidebar";
import { Navigation } from "@/components/Navigation";
import SocialAccountsManager from "@/components/SocialAccountsManager";

export default function AccountsPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Navigation title="Social Accounts" />
        <SocialAccountsManager />
      </div>
    </div>
  );
}
