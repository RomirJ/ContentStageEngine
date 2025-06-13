import MonetizationDashboard from "@/components/MonetizationDashboard";
import { Navigation } from "@/components/Navigation";

export default function Monetization() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Navigation title="Monetization" />
      <MonetizationDashboard />
    </div>
  );
}