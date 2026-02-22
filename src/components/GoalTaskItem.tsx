import { RotateCcw, Flame, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { type OccurrenceRecord } from "@/hooks/useGoalProgress";

interface GoalTaskItemProps {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    repeat_enabled?: boolean;
    repeat_unit?: string | null;
    repeat_frequency?: number | null;
  };
  todayOccurrence?: OccurrenceRecord | null;
  occurrenceStats?: { total: number; completed: number; streak: number };
  onToggle: (taskId: string, completed: boolean) => void;
}

const priorityDot: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
};

function getRepeatLabel(unit?: string | null, frequency?: number | null): string {
  if (!unit) return "Recurring";
  const freq = frequency || 1;
  if (freq === 1) {
    const labels: Record<string, string> = { day: "Daily", week: "Weekly", month: "Monthly" };
    return labels[unit] || "Recurring";
  }
  return `Every ${freq} ${unit}s`;
}

export default function GoalTaskItem({ task, todayOccurrence, occurrenceStats, onToggle }: GoalTaskItemProps) {
  const isRecurring = task.repeat_enabled;

  if (isRecurring) {
    const todayDone = todayOccurrence?.completed ?? false;
    const stats = occurrenceStats || { total: 0, completed: 0, streak: 0 };
    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
      <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group/task">
        <Checkbox
          checked={todayDone}
          onCheckedChange={(checked) => onToggle(task.id, !!checked)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${todayDone ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </span>
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5 font-normal text-blue-500 border-blue-500/20">
              <RotateCcw className="h-2 w-2" />
              {getRepeatLabel(task.repeat_unit, task.repeat_frequency)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Mini progress bar */}
            <div className="h-1 flex-1 max-w-[80px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {stats.completed}/{stats.total}
            </span>
            {stats.streak > 1 && (
              <span className="text-[9px] text-orange-500 flex items-center gap-0.5">
                <Flame className="h-2.5 w-2.5" /> {stats.streak}
              </span>
            )}
            {todayDone && (
              <span className="text-[9px] text-green-500 flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" /> Today
              </span>
            )}
          </div>
        </div>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
      </div>
    );
  }

  // Non-recurring task — standard checkbox
  return (
    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group/task">
      <Checkbox
        checked={task.status === "completed"}
        onCheckedChange={(checked) => onToggle(task.id, !!checked)}
      />
      <span className={`text-xs flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
        {task.title}
      </span>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
    </label>
  );
}
