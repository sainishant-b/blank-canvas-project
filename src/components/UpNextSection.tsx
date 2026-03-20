import { Clock, ChevronRight } from "lucide-react";

interface UpNextSectionProps {
  tasks: any[];
  totalRemaining: number;
  onSelectTask: (task: any) => void;
  onViewAll: () => void;
}

export default function UpNextSection({ tasks, totalRemaining, onSelectTask, onViewAll }: UpNextSectionProps) {
  if (tasks.length === 0) return null;

  return (
    <div>
      <h3 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Up Next
      </h3>
      <div className="space-y-2">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onSelectTask(task)}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3 text-left transition-colors hover:bg-accent group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {task.title}
              </p>
            </div>
            {task.estimated_duration && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs ml-3 shrink-0">
                <Clock className="h-3 w-3" />
                <span>{task.estimated_duration}m</span>
              </div>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>

      {totalRemaining > 0 && (
        <button
          onClick={onViewAll}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2 py-1.5 transition-colors"
        >
          +{totalRemaining} more task{totalRemaining > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
