import { useState } from "react";
import { ChevronDown, Check, Clock } from "lucide-react";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import type { Milestone } from "@/hooks/useGoals";

interface MilestoneTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface MilestoneCardProps {
  milestone: Milestone;
  tasks: MilestoneTask[];
  onToggleTask?: (taskId: string, completed: boolean) => void;
  isLast?: boolean;
}

const statusStyles: Record<string, string> = {
  completed: "bg-green-500",
  active: "bg-blue-500 animate-pulse",
  pending: "bg-muted-foreground/30",
};

export default function MilestoneCard({ milestone, tasks, onToggleTask, isLast }: MilestoneCardProps) {
  const [open, setOpen] = useState(milestone.status === "active");
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="relative flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center pt-1">
        <div className={`h-3 w-3 rounded-full shrink-0 ${statusStyles[milestone.status] || statusStyles.pending}`} />
        {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="flex-1 pb-4">
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold truncate">{milestone.title}</h4>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {milestone.target_date && (
                <span>{format(new Date(milestone.target_date), "MMM d, yyyy")}</span>
              )}
              <span>
                {completedCount}/{tasks.length} tasks
              </span>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2 space-y-1.5">
          {milestone.description && (
            <p className="text-xs text-muted-foreground mb-2">{milestone.description}</p>
          )}
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No tasks yet</p>
          )}
          {tasks.map((task) => (
            <label
              key={task.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group/task"
            >
              <Checkbox
                checked={task.status === "completed"}
                onCheckedChange={(checked) => onToggleTask?.(task.id, !!checked)}
              />
              <span className={`text-xs flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </span>
            </label>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
