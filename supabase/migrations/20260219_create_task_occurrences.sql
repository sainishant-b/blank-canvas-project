-- Task Occurrences table for tracking individual completions of recurring tasks within goals
CREATE TABLE IF NOT EXISTS public.task_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each task can only have one occurrence per date
  UNIQUE(task_id, due_date)
);

-- Enable RLS
ALTER TABLE public.task_occurrences ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can manage occurrences for their own tasks
CREATE POLICY "Users can view own task occurrences"
  ON public.task_occurrences FOR SELECT
  USING (
    task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own task occurrences"
  ON public.task_occurrences FOR INSERT
  WITH CHECK (
    task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own task occurrences"
  ON public.task_occurrences FOR UPDATE
  USING (
    task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own task occurrences"
  ON public.task_occurrences FOR DELETE
  USING (
    task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid())
  );

-- Index for fast lookups
CREATE INDEX idx_task_occurrences_task_id ON public.task_occurrences(task_id);
CREATE INDEX idx_task_occurrences_due_date ON public.task_occurrences(due_date);
CREATE INDEX idx_task_occurrences_task_date ON public.task_occurrences(task_id, due_date);
