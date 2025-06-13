import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface NavigationProps {
  title?: string;
  showBackButton?: boolean;
  backTo?: string;
}

export function Navigation({ title, showBackButton = true, backTo }: NavigationProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (backTo) {
      setLocation(backTo);
    } else {
      // Default back behavior - go to dashboard
      setLocation('/');
    }
  };

  return (
    <div className="flex items-center gap-4 mb-6">
      {showBackButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      {title && (
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      )}
    </div>
  );
}