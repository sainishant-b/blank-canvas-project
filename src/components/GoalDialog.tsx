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
import { DateTimePicker } from "./DateTimePicker";
import { Sparkles, Loader2, Check, RotateCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Goal, Milestone } from "@/hooks/useGoals";

interface AIBreakdown {
  message: string;
  milestones: {
    title: string;
    description: string;
    target_date?: string;
    tasks: { title: string; priority: string; estimated_duration: number }[];
  }[];
  suggested_description?: string;
}

interface GoalDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (
    goal: Partial<Goal>,
    milestones?: AIBreakdown["milestones"]
  ) => void;
}

export default function GoalDialog({ open, onClose, onSave }: GoalDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other",
    success_criteria: "",
    target_date: "",
  });
  const [aiBreakdown, setAiBreakdown] = useState<AIBreakdown | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const resetForm = () => {
    setFormData({ title: "", description: "", category: "other", success_criteria: "", target_date: "" });
    setAiBreakdown(null);
    setAiLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
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

      setAiBreakdown(data);
      if (data.suggested_description && !formData.description) {
        setFormData((f) => ({ ...f, description: data.suggested_description }));
      }
    } catch (e: any) {
      toast({ title: "Failed to get AI suggestions", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      aiBreakdown?.milestones
    );
    resetForm();
  };

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
              {aiLoading ? "Generating plan…" : aiBreakdown ? "Regenerate AI Plan" : "AI: Generate milestones & tasks"}
            </Button>

            {aiBreakdown && (
              <div className="rounded-lg border bg-purple-500/5 border-purple-500/20 p-3 space-y-3">
                <p className="text-sm text-muted-foreground">{aiBreakdown.message}</p>
                {aiBreakdown.milestones.map((ms, i) => (
                  <div key={i} className="space-y-1">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent-blue shrink-0" />
                      {ms.title}
                    </h4>
                    {ms.tasks.map((t, j) => (
                      <p key={j} className="text-[11px] text-muted-foreground pl-4">
                        • {t.title} <span className="opacity-60">({t.estimated_duration}m)</span>
                      </p>
                    ))}
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button type="button" size="sm" variant="ghost" onClick={fetchAIBreakdown} disabled={aiLoading}>
                    <RotateCw className="h-3 w-3 mr-1" /> Regenerate
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAiBreakdown(null)}>
                    <X className="h-3 w-3 mr-1" /> Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              <Check className="h-4 w-4 mr-1" />
              {aiBreakdown ? "Create with AI Plan" : "Create Goal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
