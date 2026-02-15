import { useState, useEffect, useMemo } from "react";
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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Minus, Plus, X, ChevronDown, Bell, Repeat, Camera, Sparkles, Loader2, Check } from "lucide-react";
import { NotificationSchedulePreview } from "./NotificationSchedulePreview";
import { useBackButton } from "@/hooks/useBackButton";
import { RepeatConfigSheet, RepeatConfig } from "./RepeatConfigSheet";
import { formatRepeatDescription } from "@/utils/repeatTaskUtils";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import AITaskAssistant from "./AITaskAssistant";

interface Task {
  id?: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: "not_started" | "in_progress" | "completed";
  due_date?: string;
  estimated_duration?: number;
  category: string;
  progress: number;
  repeat_enabled?: boolean;
  repeat_frequency?: number;
  repeat_unit?: "day" | "week" | "month" | "year";
  repeat_days_of_week?: number[];
  repeat_times?: string[];
  repeat_end_type?: "never" | "on_date" | "after_count";
  repeat_end_date?: string | null;
  repeat_end_count?: number | null;
  requires_proof?: boolean;
}

interface PendingSubtask {
  title: string;
  estimated_duration: number;
}

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>, pendingSubtasks?: PendingSubtask[]) => void;
  task?: Task;
}

const TaskDialog = ({ open, onClose, onSave, task }: TaskDialogProps) => {
  // Handle Android back button
  useBackButton(open, onClose);

  const { toast } = useToast();

  const [formData, setFormData] = useState<Partial<Task>>({
    title: "",
    description: "",
    priority: "medium",
    status: "not_started",
    category: "other",
    progress: 0,
    repeat_enabled: false,
    requires_proof: false,
  });
  const [showNotificationPreview, setShowNotificationPreview] = useState(false);
  const [showRepeatConfig, setShowRepeatConfig] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<{ title: string; selected: boolean }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState<PendingSubtask[]>([]);

  // Build a task object for the notification preview
  const previewTask = useMemo(() => ({
    id: task?.id || 'preview',
    title: formData.title || 'New Task',
    due_date: formData.due_date || null,
    status: formData.status || 'not_started',
    priority: formData.priority || 'medium',
    estimated_duration: formData.estimated_duration,
    category: formData.category,
  }), [task?.id, formData.title, formData.due_date, formData.status, formData.priority, formData.estimated_duration, formData.category]);

  useEffect(() => {
    if (task) {
      setFormData({
        ...task,
        due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        status: "not_started",
        category: "other",
        progress: 0,
        repeat_enabled: false,
        requires_proof: false,
      });
    }
    // Reset AI assistant state when dialog opens/closes
    setShowAIAssistant(false);
    setPendingSubtasks([]);
  }, [task, open]);

  const handleRepeatSave = (config: RepeatConfig) => {
    setFormData({
      ...formData,
      ...config,
    });
  };

  const handleDisableRepeat = () => {
    setFormData({
      ...formData,
      repeat_enabled: false,
      repeat_frequency: undefined,
      repeat_unit: undefined,
      repeat_days_of_week: undefined,
      repeat_times: undefined,
      repeat_end_type: undefined,
      repeat_end_date: undefined,
      repeat_end_count: undefined,
    });
  };

  const repeatDescription = formData.repeat_enabled
    ? formatRepeatDescription({
        repeat_enabled: true,
        repeat_frequency: formData.repeat_frequency || 1,
        repeat_unit: formData.repeat_unit || "week",
        repeat_days_of_week: formData.repeat_days_of_week || [],
        repeat_times: formData.repeat_times || [],
        repeat_end_type: formData.repeat_end_type || "never",
        repeat_end_date: formData.repeat_end_date || null,
        repeat_end_count: formData.repeat_end_count || null,
      })
    : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, pendingSubtasks.length > 0 ? pendingSubtasks : undefined);
    setPendingSubtasks([]);
    setShowAIAssistant(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{task ? "Edit Task" : "Create New Task"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="What do you need to do?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add more details about this task..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
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
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Select
                value={formData.estimated_duration?.toString() || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, estimated_duration: parseInt(value) })
                }
              >
                <SelectTrigger id="duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date & Time (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="due_date"
                type="datetime-local"
                value={formData.due_date || ""}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="flex-1"
              />
              {formData.due_date && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setFormData({ ...formData, due_date: undefined })}
                  title="Clear date"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Leave empty for tasks without a deadline</p>
          </div>

          {/* Repeat Section */}
          <div className="space-y-2">
            <Label>Repeat</Label>
            {formData.repeat_enabled ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                <Repeat className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm flex-1">{repeatDescription}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRepeatConfig(true)}
                  className="text-xs"
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDisableRepeat}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowRepeatConfig(true)}
              >
                <Repeat className="h-4 w-4 mr-2" />
                Add repeat schedule
              </Button>
            )}
          </div>

          {/* AI Task Assistant Toggle */}
          {(
            <div className="space-y-2">
              <Button
                type="button"
                variant={showAIAssistant ? "secondary" : "outline"}
                className="w-full justify-start gap-2"
                onClick={() => setShowAIAssistant(!showAIAssistant)}
                disabled={!formData.title?.trim()}
              >
                <Sparkles className="h-4 w-4 text-purple-400" />
                {showAIAssistant ? "Hide AI Assistant" : "AI: Suggest subtasks & timeline"}
                {pendingSubtasks.length > 0 && (
                  <span className="ml-auto text-xs bg-purple-500/20 text-purple-400 rounded-full px-2 py-0.5">
                    {pendingSubtasks.length} subtask{pendingSubtasks.length > 1 ? "s" : ""} ready
                  </span>
                )}
              </Button>

              {showAIAssistant && formData.title?.trim() && (
                <AITaskAssistant
                  taskTitle={formData.title}
                  taskDescription={formData.description || ""}
                  taskCategory={formData.category || "other"}
                  taskPriority={formData.priority || "medium"}
                  onApplySubtasks={(subtasks) => setPendingSubtasks(subtasks)}
                  onApplyDescription={(desc) => setFormData({ ...formData, description: desc })}
                  onApplyTimeline={(minutes) => {
                    // Find nearest duration option
                    const options = [15, 30, 60, 120, 240];
                    const nearest = options.reduce((prev, curr) =>
                      Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev
                    , options[0]);
                    setFormData({ ...formData, estimated_duration: nearest });
                  }}
                  onClose={() => setShowAIAssistant(false)}
                />
              )}
            </div>
          )}

          {/* Pending AI Subtasks Preview */}
          {pendingSubtasks.length > 0 && !showAIAssistant && (
            <div className="p-3 rounded-lg border bg-purple-500/5 border-purple-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  {pendingSubtasks.length} AI subtask{pendingSubtasks.length > 1 ? "s" : ""} will be added
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setPendingSubtasks([])}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                {pendingSubtasks.map((st, idx) => (
                  <p key={`pending-${st.title}`} className="text-xs text-muted-foreground">
                    {idx + 1}. {st.title}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Requires Photo Proof */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-purple-400" />
              <div>
                <Label htmlFor="requires-proof" className="text-sm font-medium cursor-pointer">
                  Requires photo proof
                </Label>
                <p className="text-xs text-muted-foreground">AI will verify your work when completed</p>
              </div>
            </div>
            <Switch
              id="requires-proof"
              checked={formData.requires_proof || false}
              onCheckedChange={(checked) => setFormData({ ...formData, requires_proof: checked })}
            />
          </div>

          {/* Notification Schedule Preview */}
          <Collapsible open={showNotificationPreview} onOpenChange={setShowNotificationPreview}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Bell className="h-4 w-4" />
                  Notification Schedule
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showNotificationPreview ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border p-3 bg-muted/30">
                <NotificationSchedulePreview task={previewTask} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {task && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="progress">Progress</Label>
                <span className="text-sm font-medium">{formData.progress}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setFormData({ 
                    ...formData, 
                    progress: Math.max(0, (formData.progress || 0) - 10) 
                  })}
                  disabled={(formData.progress || 0) <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Slider
                  id="progress"
                  value={[formData.progress || 0]}
                  onValueChange={(value) => setFormData({ ...formData, progress: value[0] })}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setFormData({ 
                    ...formData, 
                    progress: Math.min(100, (formData.progress || 0) + 10) 
                  })}
                  disabled={(formData.progress || 0) >= 100}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {task ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <RepeatConfigSheet
        open={showRepeatConfig}
        onClose={() => setShowRepeatConfig(false)}
        onSave={handleRepeatSave}
        initialConfig={{
          repeat_enabled: formData.repeat_enabled || false,
          repeat_frequency: formData.repeat_frequency || 1,
          repeat_unit: formData.repeat_unit || "week",
          repeat_days_of_week: formData.repeat_days_of_week || [],
          repeat_times: formData.repeat_times || ["09:00"],
          repeat_end_type: formData.repeat_end_type || "never",
          repeat_end_date: formData.repeat_end_date || null,
          repeat_end_count: formData.repeat_end_count || null,
        }}
      />
    </Dialog>
  );
};

export default TaskDialog;
