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
      <h3 className="font-heading text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2">
        Up Next
      </h3>
      <div className="space-y-1.5 sm:space-y-2">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onSelectTask(task)}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 sm:px-4 py-2.5 sm:py-3 text-left transition-colors hover:bg-accent active:scale-[0.98] group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                {task.title}
              </p>
            </div>
            {task.estimated_duration && (
              <div className="flex items-center gap-1 text-muted-foreground text-[10px] sm:text-xs ml-2 sm:ml-3 shrink-0">
                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                <span>{task.estimated_duration}m</span>
              </div>
            )}
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground ml-1.5 sm:ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>

      {totalRemaining > 0 && (
        <button
          onClick={onViewAll}
          className="w-full text-center text-[10px] sm:text-xs text-muted-foreground hover:text-foreground mt-1.5 sm:mt-2 py-1.5 transition-colors active:scale-[0.97]"
        >
          +{totalRemaining} more task{totalRemaining > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
