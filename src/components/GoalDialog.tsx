import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DateTimePicker } from "./DateTimePicker";
import { Sparkles, Loader2, Check, X, Plus, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TaskDialog from "./TaskDialog";
import type { Goal } from "@/hooks/useGoals";

interface MilestoneTask {
  title: string;
  description?: string;
  priority: string;
  status?: string;
  estimated_duration: number;
  category?: string;
  due_date?: string;
  repeat_enabled?: boolean;
  repeat_frequency?: number;
  repeat_unit?: string;
  repeat_days_of_week?: number[];
  repeat_times?: string[];
  repeat_end_type?: string;
  repeat_end_date?: string | null;
  repeat_end_count?: number | null;
  requires_proof?: boolean;
  subtasks?: { title: string; estimated_duration: number }[];
}

interface ManualMilestone {
  title: string;
  description: string;
  target_date?: string;
  tasks: MilestoneTask[];
}

interface AIBreakdown {
  message: string;
  milestones: {
    title: string;
    description: string;
    target_date?: string;
    tasks: MilestoneTask[];
  }[];
  suggested_description?: string;
}

interface GoalDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave: (
    goal: Partial<Goal>,
    milestones?: AIBreakdown["milestones"]
  ) => void;
}

const priorityDot: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
};

export default function GoalDialog({ open, onClose, onSave }: GoalDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other",
    success_criteria: "",
    target_date: "",
  });

  // Manual milestones & tasks
  const [milestones, setMilestones] = useState<ManualMilestone[]>([]);
  const [expandedMs, setExpandedMs] = useState<number | null>(null);

  // Inline add forms
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMs, setNewMs] = useState({ title: "", description: "", target_date: "" });

  // TaskDialog for adding tasks to milestones
  const [taskDialogForMs, setTaskDialogForMs] = useState<number | null>(null);

  // AI
  const [aiLoading, setAiLoading] = useState(false);

  const resetForm = () => {
    setFormData({ title: "", description: "", category: "other", success_criteria: "", target_date: "" });
    setMilestones([]);
    setExpandedMs(null);
    setShowAddMilestone(false);
    setNewMs({ title: "", description: "", target_date: "" });
    setTaskDialogForMs(null);
    setAiLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // --- Milestone CRUD ---
  const handleAddMilestone = () => {
    if (!newMs.title.trim()) return;
    setMilestones((prev) => [...prev, { ...newMs, tasks: [] }]);
    setExpandedMs(milestones.length);
    setNewMs({ title: "", description: "", target_date: "" });
    setShowAddMilestone(false);
  };

  const handleRemoveMilestone = (idx: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== idx));
    if (expandedMs === idx) setExpandedMs(null);
    else if (expandedMs !== null && expandedMs > idx) setExpandedMs(expandedMs - 1);
  };

  // --- Task CRUD (via TaskDialog) ---
  const handleTaskDialogSave = (taskData: any, pendingSubtasks?: { title: string; estimated_duration: number }[]) => {
    if (taskDialogForMs === null) return;
    const msIdx = taskDialogForMs;
    setMilestones((prev) => {
      const updated = [...prev];
      updated[msIdx] = {
        ...updated[msIdx],
        tasks: [
          ...updated[msIdx].tasks,
          {
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority || "medium",
            status: taskData.status || "not_started",
            estimated_duration: taskData.estimated_duration || 30,
            category: taskData.category,
            due_date: taskData.due_date,
            repeat_enabled: taskData.repeat_enabled,
            repeat_frequency: taskData.repeat_frequency,
            repeat_unit: taskData.repeat_unit,
            repeat_days_of_week: taskData.repeat_days_of_week,
            repeat_times: taskData.repeat_times,
            repeat_end_type: taskData.repeat_end_type,
            repeat_end_date: taskData.repeat_end_date,
            repeat_end_count: taskData.repeat_end_count,
            requires_proof: taskData.requires_proof,
            subtasks: pendingSubtasks,
          },
        ],
      };
      return updated;
    });
    setTaskDialogForMs(null);
  };

  const handleRemoveTask = (msIdx: number, taskIdx: number) => {
    setMilestones((prev) => {
      const updated = [...prev];
      updated[msIdx] = {
        ...updated[msIdx],
        tasks: updated[msIdx].tasks.filter((_, i) => i !== taskIdx),
      };
      return updated;
    });
  };

  // --- AI ---
  const mergeAIPlan = (data: AIBreakdown) => {
    // Add AI milestones to existing manual milestones
    const aiMilestones: ManualMilestone[] = data.milestones.map((ms) => ({
      title: ms.title,
      description: ms.description || "",
      target_date: ms.target_date,
      tasks: ms.tasks.map((t) => ({
        title: t.title,
        priority: t.priority || "medium",
        estimated_duration: t.estimated_duration || 30,
      })),
    }));
    setMilestones((prev) => [...prev, ...aiMilestones]);
    if (aiMilestones.length > 0) {
      setExpandedMs(milestones.length); // expand first AI milestone
    }
  };

  const fetchAIBreakdown = async () => {
    if (!formData.title.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-goal-breakdown", {
        body: {
          title: formData.title,
          description: formData.description,
          successCriteria: formData.success_criteria,
          targetDate: formData.target_date,
          category: formData.category,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI Error", description: data.error, variant: "destructive" });
        return;
      }

      if (data.suggested_description && !formData.description) {
        setFormData((f) => ({ ...f, description: data.suggested_description }));
      }
      mergeAIPlan(data);
      toast({ title: "AI plan added!", description: `${data.milestones.length} milestones generated` });
    } catch (e: any) {
      toast({ title: "Failed to get AI suggestions", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Convert manual milestones to expected format
    const milestonesToSave = milestones.length > 0
      ? milestones.map((ms) => ({
          title: ms.title,
          description: ms.description,
          target_date: ms.target_date,
          tasks: ms.tasks,
        }))
      : undefined;

    onSave(
      {
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        success_criteria: formData.success_criteria || null,
        target_date: formData.target_date ? new Date(formData.target_date).toISOString() : null,
        status: "active",
        progress: 0,
      } as any,
      milestonesToSave
    );
    resetForm();
  };

  const totalTasks = milestones.reduce((sum, ms) => sum + ms.tasks.length, 0);
  const milestoneSuffix = milestones.length === 1 ? "" : "s";
  const submitLabel = milestones.length > 0
    ? `Create with ${milestones.length} Milestone${milestoneSuffix}`
    : "Create Goal";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Create New Goal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Goal Title *</Label>
            <Input
              id="goal-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Learn Spanish to conversational level"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-desc">Description</Label>
            <Textarea
              id="goal-desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does achieving this goal look like?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Date</Label>
              <DateTimePicker
                value={formData.target_date || undefined}
                onChange={(val) => setFormData({ ...formData, target_date: val || "" })}
                placeholder="Pick target date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-criteria">Success Criteria</Label>
            <Textarea
              id="goal-criteria"
              value={formData.success_criteria}
              onChange={(e) => setFormData({ ...formData, success_criteria: e.target.value })}
              placeholder="How will you know you've achieved this?"
              rows={2}
            />
          </div>

          {/* Milestones & Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Milestones & Tasks
                {milestones.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {milestones.length} milestone{milestones.length === 1 ? "" : "s"} · {totalTasks} task{totalTasks === 1 ? "" : "s"}
                  </span>
                )}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setShowAddMilestone(true); }}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Milestone
              </Button>
            </div>

            {/* Inline add milestone form */}
            {showAddMilestone && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Input
                  placeholder="Milestone title *"
                  value={newMs.title}
                  onChange={(e) => setNewMs({ ...newMs, title: e.target.value })}
                  autoFocus
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={newMs.description}
                  onChange={(e) => setNewMs({ ...newMs, description: e.target.value })}
                  rows={1}
                  className="text-sm min-h-[32px]"
                />
                <DateTimePicker
                  value={newMs.target_date || undefined}
                  onChange={(val) => setNewMs({ ...newMs, target_date: val || "" })}
                  placeholder="Target date (optional)"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowAddMilestone(false); setNewMs({ title: "", description: "", target_date: "" }); }}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={handleAddMilestone} disabled={!newMs.title.trim()}>
                    <Check className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>
            )}

            {/* Milestones list */}
            {milestones.length > 0 && (
              <div className="space-y-0">
                {milestones.map((ms, msIdx) => {
                  const isExpanded = expandedMs === msIdx;
                  return (
                    <div key={`ms-${ms.title}-${msIdx}`} className="relative flex gap-2.5">
                      {/* Timeline */}
                      <div className="flex flex-col items-center pt-1">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                        {msIdx < milestones.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                      </div>

                      <Collapsible open={isExpanded} onOpenChange={() => setExpandedMs(isExpanded ? null : msIdx)} className="flex-1 pb-3">
                        <div className="flex items-start gap-1">
                          <CollapsibleTrigger className="flex items-center gap-1.5 flex-1 text-left group min-w-0">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-semibold truncate">{ms.title}</h4>
                              <p className="text-[10px] text-muted-foreground">
                                {ms.tasks.length} task{ms.tasks.length === 1 ? "" : "s"}
                                {ms.target_date && ` · ${ms.target_date}`}
                              </p>
                            </div>
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                          </CollapsibleTrigger>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveMilestone(msIdx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <CollapsibleContent className="mt-2 space-y-1.5 pl-0.5">
                          {ms.description && (
                            <p className="text-[11px] text-muted-foreground">{ms.description}</p>
                          )}

                          {/* Tasks */}
                          {ms.tasks.map((task, tIdx) => (
                            <div key={`task-${task.title}-${tIdx}`} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 group/task">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
                              <span className="text-xs flex-1 truncate">{task.title}</span>
                              <span className="text-[10px] text-muted-foreground">{task.estimated_duration}m</span>
                              <button
                                type="button"
                                className="opacity-0 group-hover/task:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveTask(msIdx, tIdx)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          {/* Add task button — opens full TaskDialog */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTaskDialogForMs(msIdx)}
                            className="w-full justify-start text-[10px] text-muted-foreground h-7"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add task
                          </Button>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            )}

            {milestones.length === 0 && !showAddMilestone && (
              <div className="text-center py-4 rounded-lg border border-dashed">
                <p className="text-xs text-muted-foreground">No milestones yet</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Add milestones manually or use AI to generate a plan</p>
              </div>
            )}
          </div>

          {/* AI Breakdown */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={fetchAIBreakdown}
              disabled={aiLoading || !formData.title.trim()}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-400" />}
              {aiLoading ? "Generating plan…" : "AI: Generate milestones & tasks"}
            </Button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              <Check className="h-4 w-4 mr-1" />
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Full TaskDialog for adding tasks to milestones */}
      <TaskDialog
        open={taskDialogForMs !== null}
        onClose={() => setTaskDialogForMs(null)}
        onSave={handleTaskDialogSave}
      />
    </Dialog>
  );
}
