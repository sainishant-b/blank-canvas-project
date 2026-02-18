import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  success_criteria: string | null;
  target_date: string | null;
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
  order_index: number;
  created_at: string;
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGoals = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching goals:", error);
    } else {
      setGoals((data as any[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = async (goal: Partial<Goal>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("goals")
      .insert({ ...goal, user_id: user.id } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating goal", description: error.message, variant: "destructive" });
      return null;
    }

    await fetchGoals();
    return data as unknown as Goal;
  };

  const updateGoal = async (id: string, updates: Partial<Goal>) => {
    const { error } = await supabase
      .from("goals")
      .update(updates as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Error updating goal", description: error.message, variant: "destructive" });
      return;
    }
    await fetchGoals();
  };

  const deleteGoal = async (id: string) => {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting goal", description: error.message, variant: "destructive" });
      return;
    }
    await fetchGoals();
  };

  const recalculateProgress = async (goalId: string) => {
    const { data: tasks } = await (supabase
      .from("tasks")
      .select("status") as any)
      .eq("goal_id", goalId);

    if (!tasks || tasks.length === 0) return;

    const completed = tasks.filter((t: any) => t.status === "completed").length;
    const progress = Math.round((completed / tasks.length) * 100);

    await supabase.from("goals").update({ progress } as any).eq("id", goalId);
    await fetchGoals();
  };

  return { goals, loading, createGoal, updateGoal, deleteGoal, fetchGoals, recalculateProgress };
}

export function useMilestones(goalId?: string) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMilestones = useCallback(async () => {
    if (!goalId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("milestones")
      .select("*")
      .eq("goal_id", goalId)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("Error fetching milestones:", error);
    } else {
      setMilestones((data as any[]) || []);
    }
    setLoading(false);
  }, [goalId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const createMilestone = async (milestone: Partial<Milestone>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("milestones")
      .insert({ ...milestone, user_id: user.id, goal_id: goalId } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating milestone", description: error.message, variant: "destructive" });
      return null;
    }
    await fetchMilestones();
    return data as unknown as Milestone;
  };

  const updateMilestone = async (id: string, updates: Partial<Milestone>) => {
    const { error } = await supabase
      .from("milestones")
      .update(updates as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Error updating milestone", description: error.message, variant: "destructive" });
    }
    await fetchMilestones();
  };

  return { milestones, loading, createMilestone, updateMilestone, fetchMilestones };
}
