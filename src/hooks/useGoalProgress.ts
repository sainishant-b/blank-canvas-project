import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, addWeeks, addMonths, isBefore, startOfDay, isSameDay } from "date-fns";

export interface OccurrenceRecord {
  id: string;
  task_id: string;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
}

export type OccurrenceStats = { total: number; completed: number; streak: number };

export function useGoalProgress() {
  const [loading, setLoading] = useState(false);

  /** Calculate goal progress: non-recurring = binary, recurring = occurrences ratio. */
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
      const { data: occ } = await supabase
        .from("task_occurrences").select("completed").in("task_id", ids);
      rTotal = occ?.length || recurring.length;
      rDone = occ?.filter((o: any) => o.completed).length || 0;
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

  /** Toggle today's occurrence for a recurring task (upsert). */
  const toggleTodayOccurrence = useCallback(async (taskId: string, completed: boolean) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const completedAt = completed ? new Date().toISOString() : null;

    const { data: existing } = await supabase
      .from("task_occurrences").select("id")
      .eq("task_id", taskId).eq("due_date", today).maybeSingle();

    if (existing) {
      await supabase.from("task_occurrences")
        .update({ completed, completed_at: completedAt }).eq("id", (existing as any).id);
    } else {
      await supabase.from("task_occurrences")
        .insert({ task_id: taskId, due_date: today, completed, completed_at: completedAt } as any);
    }
  }, []);

  /** Generate occurrence rows from startDate to endDate based on repeat config. */
  const generateOccurrences = useCallback(async (
    taskId: string, startDate: Date, endDate: Date,
    frequency: number, unit: string, daysOfWeek?: number[] | null,
  ) => {
    const rows: { task_id: string; due_date: string; completed: boolean }[] = [];
    let cur = startOfDay(startDate);
    const end = startOfDay(endDate);
    const step = (d: Date) =>
      unit === "month" ? addMonths(d, frequency) :
      unit === "week"  ? addWeeks(d, frequency) :
                         addDays(d, frequency);

    while ((isBefore(cur, end) || isSameDay(cur, end)) && rows.length < 365) {
      const matchesDay = !daysOfWeek?.length || daysOfWeek.includes(cur.getDay());
      if (matchesDay) rows.push({ task_id: taskId, due_date: format(cur, "yyyy-MM-dd"), completed: false });
      cur = step(cur);
    }

    for (let i = 0; i < rows.length; i += 100) {
      await supabase.from("task_occurrences").insert(rows.slice(i, i + 100) as any);
    }
    return rows.length;
  }, []);

  /** Get today's occurrence for each task ID. */
  const getTodayOccurrences = useCallback(async (taskIds: string[]) => {
    if (!taskIds.length) return {};
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await supabase
      .from("task_occurrences").select("*").in("task_id", taskIds).eq("due_date", today);

    const map: Record<string, OccurrenceRecord> = {};
    for (const o of (data || []) as any[]) map[o.task_id] = o;
    return map;
  }, []);

  /** Get completion stats + streak for a recurring task. */
  const getOccurrenceStats = useCallback(async (taskId: string): Promise<OccurrenceStats> => {
    const { data } = await supabase
      .from("task_occurrences").select("completed")
      .eq("task_id", taskId).order("due_date", { ascending: true });
    if (!data?.length) return { total: 0, completed: 0, streak: 0 };

    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if ((data[i] as any).completed) streak++; else break;
    }
    return {
      total: data.length,
      completed: data.filter((o: any) => o.completed).length,
      streak,
    };
  }, []);

  return {
    loading, calculateProgress, recalculateGoalProgress,
    toggleTodayOccurrence, generateOccurrences, getTodayOccurrences, getOccurrenceStats,
  };
}
