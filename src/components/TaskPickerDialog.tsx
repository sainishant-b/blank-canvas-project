import { Clock, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface TaskPickerDialogProps {
  open: boolean;
  onClose: () => void;
  tasks: any[];
  currentFocusId: string | null;
  onSelect: (task: any) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-accent-green/10 text-accent-green border-accent-green/20",
};

export default function TaskPickerDialog({
  open,
  onClose,
  tasks,
  currentFocusId,
  onSelect,
}: TaskPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Choose Focus Task</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1.5 pr-2">
            {tasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No active tasks available
              </p>
            )}
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => {
                  onSelect(task);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-accent ${
                  task.id === currentFocusId
                    ? "bg-accent ring-1 ring-ring"
                    : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        priorityColors[task.priority] || ""
                      }`}
                    >
                      {task.priority}
                    </Badge>
                    {task.estimated_duration && (
                      <span className="flex items-center gap-1 text-muted-foreground text-[10px]">
                        <Clock className="h-2.5 w-2.5" />
                        {task.estimated_duration}m
                      </span>
                    )}
                  </div>
                </div>
                {task.id === currentFocusId && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
