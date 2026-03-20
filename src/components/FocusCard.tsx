import { Clock, Flame, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FocusCardProps {
  task: any | null;
  isRecommended?: boolean;
  onPickTask: () => void;
}

const priorityConfig = {
  high: { label: "High Priority", className: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { label: "Medium", className: "bg-warning/10 text-warning border-warning/20" },
  low: { label: "Low", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
};

export default function FocusCard({ task, isRecommended, onPickTask }: FocusCardProps) {
  if (!task) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card p-6 sm:p-8 md:p-12 flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[40vh] md:min-h-[35vh]">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted flex items-center justify-center mb-3 sm:mb-4">
          <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground" />
        </div>
        <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1.5 sm:mb-2">
          No focus task set
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm mb-5 sm:mb-6 text-center max-w-xs">
          Pick a task to focus on and start making progress
        </p>
        <Button onClick={onPickTask} size="lg" className="rounded-xl px-8 active:scale-[0.97]">
          Choose a Task
        </Button>
      </div>
    );
  }

  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;

  return (
    <div className="rounded-2xl border bg-card text-card-foreground shadow-[var(--shadow-lg)] p-5 sm:p-6 md:p-8 min-h-[50vh] sm:min-h-[40vh] md:min-h-[35vh] flex flex-col justify-between relative overflow-hidden">
      {/* Subtle accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-accent-orange rounded-t-2xl" />

      <div className="flex-1 flex flex-col justify-center items-center text-center pt-3 sm:pt-4">
        {isRecommended && (
          <div className="flex items-center gap-1.5 text-accent-orange text-xs font-medium mb-3 sm:mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Recommended for now
          </div>
        )}

        <Badge variant="outline" className={`mb-3 sm:mb-4 text-xs ${priority.className}`}>
          {priority.label}
        </Badge>

        <h1 className="font-heading text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-3 sm:mb-4 max-w-lg overflow-wrap-break-word px-1">
          {task.title}
        </h1>

        {task.estimated_duration && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{task.estimated_duration} min</span>
          </div>
        )}

        {task.due_date && (
          <p className="text-muted-foreground text-[11px] sm:text-xs mt-2">
            Due {new Date(task.due_date).toLocaleDateString()}
          </p>
        )}
      </div>

      {task.repeat_enabled && task.isCompletedToday && (
        <div className="flex items-center justify-center gap-1.5 text-accent-green text-xs font-medium mt-2">
          <Flame className="h-3.5 w-3.5" />
          Completed today
        </div>
      )}
    </div>
  );
}
