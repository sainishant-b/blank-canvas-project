import { useNavigate, useLocation } from "react-router-dom";
import { Clock, Target, Calendar, BarChart3, Settings, Crosshair, ListTodo } from "lucide-react";

interface MobileBottomNavProps {
  onCheckIn: () => void;
}

export default function MobileBottomNav({ onCheckIn }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Crosshair, label: "Focus", action: () => navigate("/"), isActive: location.pathname === "/" },
    { icon: ListTodo, label: "Dashboard", action: () => navigate("/tasks"), isActive: location.pathname === "/tasks" },
    { icon: Target, label: "Goals", action: () => navigate("/goals"), isActive: location.pathname.startsWith("/goals") },
    { icon: Calendar, label: "Calendar", action: () => navigate("/calendar"), isActive: location.pathname === "/calendar" },
    { icon: Settings, label: "Settings", action: () => navigate("/settings"), isActive: location.pathname === "/settings" },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors active:scale-[0.92] ${
                item.isActive 
                  ? "text-primary" 
                  : "text-muted-foreground"
              }`}
            >
              <Icon 
                className={`h-[18px] w-[18px] ${item.isActive ? "fill-primary" : ""}`} 
                strokeWidth={item.isActive ? 2.5 : 1.8}
              />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
