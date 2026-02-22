import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface OccurrenceRecord {
  id: string;
  task_id: string;
  completed_date: string;
  completed: boolean;
  completed_at: string | null;
}

export type OccurrenceStats = { total: number; completed: number; streak: number };

export function useGoalProgress() {
  const [loading, setLoading] = useState(false);

  /** Calculate goal progress: completed tasks / total tasks * 100. */
  const calculateProgress = useCallback(async (goalId: string): Promise<number> => {
    const { data: tasks } = await (supabase
      .from("tasks").select("id, status, repeat_enabled") as any)
      .eq("goal_id", goalId);
    if (!tasks || tasks.length === 0) return 0;

    const nonRecurring = tasks.filter((t: any) => !t.repeat_enabled);
    const recurring = tasks.filter((t: any) => t.repeat_enabled);
    const nrDone = nonRecurring.filter((t: any) => t.status === "completed").length;

    let rDone = 0, rTotal = 0;
    if (recurring.length > 0) {
      const ids = recurring.map((t: any) => t.id);
      const { data: completions } = await supabase
        .from("repeat_completions").select("task_id").in("task_id", ids);
      rTotal = recurring.length;
      rDone = completions?.length ? Math.min(completions.length / rTotal, 1) * rTotal : 0;
    }

    const total = nonRecurring.length + rTotal;
    return total === 0 ? 0 : Math.min(Math.round(((nrDone + rDone) / total) * 100), 100);
  }, []);

  /** Recalculate and persist goal progress. */
  const recalculateGoalProgress = useCallback(async (goalId: string) => {
    setLoading(true);
    try {
      const progress = await calculateProgress(goalId);
      await supabase.from("goals").update({ progress } as any).eq("id", goalId);
      return progress;
    } finally { setLoading(false); }
  }, [calculateProgress]);

  /** Toggle today's repeat completion for a recurring task. */
  const toggleTodayOccurrence = useCallback(async (taskId: string, completed: boolean) => {
    const today = format(new Date(), "yyyy-MM-dd");

    if (completed) {
      await supabase.from("repeat_completions").insert({
        task_id: taskId,
        completed_date: today,
        user_id: (await supabase.auth.getUser()).data.user?.id!,
      });
    } else {
      await supabase.from("repeat_completions")
        .delete()
        .eq("task_id", taskId)
        .eq("completed_date", today);
    }
  }, []);

  /** Get today's completion status for each task ID. */
  const getTodayOccurrences = useCallback(async (taskIds: string[]) => {
    if (!taskIds.length) return {};
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await supabase
      .from("repeat_completions").select("*").in("task_id", taskIds).eq("completed_date", today);

    const map: Record<string, any> = {};
    for (const o of (data || []) as any[]) map[o.task_id] = o;
    return map;
  }, []);

  /** Get completion stats for a recurring task. */
  const getOccurrenceStats = useCallback(async (taskId: string): Promise<OccurrenceStats> => {
    const { data } = await supabase
      .from("repeat_completions").select("completed_date")
      .eq("task_id", taskId).order("completed_date", { ascending: true });
    if (!data?.length) return { total: 0, completed: 0, streak: 0 };

    return {
      total: data.length,
      completed: data.length,
      streak: data.length,
    };
  }, []);

  /** No-op: occurrences are tracked via repeat_completions. */
  const generateOccurrences = useCallback(async (
    _taskId: string, _startDate: Date, _endDate: Date,
    _frequency?: number, _unit?: string, _daysOfWeek?: number[] | null,
  ) => {
    return 0;
  }, []);

  return {
    loading, calculateProgress, recalculateGoalProgress,
    toggleTodayOccurrence, generateOccurrences, getTodayOccurrences, getOccurrenceStats,
  };
}
