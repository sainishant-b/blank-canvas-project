import { useNavigate, useLocation } from "react-router-dom";
import { Clock, Target, Calendar, BarChart3, Settings, Crosshair } from "lucide-react";

interface MobileBottomNavProps {
  onCheckIn: () => void;
}

export default function MobileBottomNav({ onCheckIn }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Crosshair, label: "Focus", action: () => navigate("/"), isActive: location.pathname === "/" },
    { icon: Target, label: "Goals", action: () => navigate("/goals"), isActive: location.pathname.startsWith("/goals") },
    { icon: Calendar, label: "Calendar", action: () => navigate("/calendar"), isActive: location.pathname === "/calendar" },
    { icon: BarChart3, label: "Insights", action: () => navigate("/insights"), isActive: location.pathname === "/insights" },
    { icon: Settings, label: "Settings", action: () => navigate("/settings"), isActive: location.pathname === "/settings" },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/80 backdrop-blur-lg border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-[60px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                item.isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon 
                className={`h-5 w-5 ${item.isActive ? "fill-primary" : ""}`} 
                strokeWidth={item.isActive ? 2.5 : 2}
              />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
