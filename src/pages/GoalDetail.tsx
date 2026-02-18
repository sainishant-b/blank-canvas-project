import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Target, Calendar, Clock, Trash2, MoreVertical, CheckCircle2, Pause, Play } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MilestoneCard from "@/components/MilestoneCard";
import { supabase } from "@/integrations/supabase/client";
import { useGoals, useMilestones, type Goal } from "@/hooks/useGoals";
import { useToast } from "@/hooks/use-toast";

export default function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goals, updateGoal, deleteGoal, recalculateProgress } = useGoals();
  const { milestones, loading: msLoading } = useMilestones(goalId);
  const [milestoneTasks, setMilestoneTasks] = useState<Record<string, any[]>>({});
  const [timeInvested, setTimeInvested] = useState(0);

  const goal = goals.find((g) => g.id === goalId);

  const fetchTasksForMilestones = useCallback(async () => {
    if (!goalId) return;
    const { data } = await (supabase
      .from("tasks")
      .select("*") as any)
      .eq("goal_id", goalId);

    if (data) {
      const grouped: Record<string, any[]> = {};
      for (const t of data as any[]) {
        const msId = t.milestone_id || "__unlinked";
        if (!grouped[msId]) grouped[msId] = [];
        grouped[msId].push(t);
      }
      setMilestoneTasks(grouped);
    }
  }, [goalId]);

  const fetchTimeInvested = useCallback(async () => {
    if (!goalId) return;
    // Get task ids for this goal
    const { data: tasks } = await (supabase
      .from("tasks")
      .select("id") as any)
      .eq("goal_id", goalId);

    if (!tasks || tasks.length === 0) return;
    const taskIds = tasks.map((t: any) => t.id);

    const { data: sessions } = await supabase
      .from("work_sessions")
      .select("time_spent")
      .in("task_id", taskIds);

    if (sessions) {
      setTimeInvested(sessions.reduce((sum: number, s: any) => sum + (s.time_spent || 0), 0));
    }
  }, [goalId]);

  useEffect(() => {
    fetchTasksForMilestones();
    fetchTimeInvested();
  }, [fetchTasksForMilestones, fetchTimeInvested, milestones]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await supabase
      .from("tasks")
      .update({
        status: completed ? "completed" : "not_started",
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", taskId);

    await fetchTasksForMilestones();
    if (goalId) await recalculateProgress(goalId);
  };

  const handleDelete = async () => {
    if (!goalId) return;
    await deleteGoal(goalId);
    navigate("/goals");
    toast({ title: "Goal deleted" });
  };

  const handleStatusChange = async (status: string) => {
    if (!goalId) return;
    await updateGoal(goalId, { status } as any);
    toast({ title: `Goal ${status === "completed" ? "completed! 🎉" : status}` });
  };

  if (!goal) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/goals")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Goals
        </Button>
        <p className="text-muted-foreground text-center py-16">Goal not found</p>
      </div>
    );
  }

  const daysLeft = goal.target_date
    ? differenceInDays(new Date(goal.target_date), new Date())
    : null;

  const hours = Math.floor(timeInvested / 60);
  const mins = timeInvested % 60;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/goals")} className="shrink-0 mt-0.5">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-xl leading-tight">{goal.title}</h1>
          {goal.description && (
            <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {goal.status === "active" && (
              <>
                <DropdownMenuItem onClick={() => handleStatusChange("completed")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("paused")}>
                  <Pause className="h-4 w-4 mr-2" /> Pause
                </DropdownMenuItem>
              </>
            )}
            {goal.status === "paused" && (
              <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                <Play className="h-4 w-4 mr-2" /> Resume
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Goal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">{goal.progress}%</p>
          <p className="text-[10px] text-muted-foreground">Progress</p>
          <Progress value={goal.progress} className="h-1.5 mt-2" />
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">
            {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}` : daysLeft) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {daysLeft !== null && daysLeft < 0 ? "Days Overdue" : "Days Left"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">{hours > 0 ? `${hours}h` : `${mins}m`}</p>
          <p className="text-[10px] text-muted-foreground">Invested</p>
        </div>
      </div>

      {/* Milestones Timeline */}
      <div>
        <h2 className="font-heading text-sm mb-3">Milestones</h2>
        {msLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No milestones yet</p>
        ) : (
          <div className="space-y-0">
            {milestones.map((ms, i) => (
              <MilestoneCard
                key={ms.id}
                milestone={ms}
                tasks={milestoneTasks[ms.id] || []}
                onToggleTask={handleToggleTask}
                isLast={i === milestones.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
