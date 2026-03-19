-- ============================================
-- FULL DATABASE SETUP FOR AI PRODUCTIVITY APP
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. PROFILES TABLE (linked to auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  current_streak integer DEFAULT 0 NOT NULL,
  longest_streak integer DEFAULT 0 NOT NULL,
  last_check_in_date timestamptz,
  check_in_frequency integer DEFAULT 60 NOT NULL,
  timezone text DEFAULT 'UTC' NOT NULL,
  email_notifications_enabled boolean DEFAULT false NOT NULL,
  email_frequency text DEFAULT 'daily' NOT NULL,
  email_overdue_alerts boolean DEFAULT true NOT NULL,
  email_recommendations boolean DEFAULT true NOT NULL,
  email_weekly_reports boolean DEFAULT true NOT NULL,
  total_proofs_submitted integer DEFAULT 0 NOT NULL,
  total_ai_rating numeric DEFAULT 0 NOT NULL,
  work_hours_start text DEFAULT '09:00' NOT NULL,
  work_hours_end text DEFAULT '17:00' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. GOALS TABLE
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text DEFAULT 'personal' NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  progress numeric DEFAULT 0 NOT NULL,
  target_date timestamptz,
  success_criteria text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE USING (auth.uid() = user_id);

-- 3. MILESTONES TABLE
CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending' NOT NULL,
  target_date timestamptz,
  order_index integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own milestones" ON public.milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own milestones" ON public.milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own milestones" ON public.milestones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own milestones" ON public.milestones FOR DELETE USING (auth.uid() = user_id);

-- 4. TASKS TABLE
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text DEFAULT 'general' NOT NULL,
  priority text NOT NULL,
  status text DEFAULT 'todo' NOT NULL,
  progress numeric DEFAULT 0 NOT NULL,
  due_date timestamptz,
  completed_at timestamptz,
  estimated_duration integer,
  notes text,
  requires_proof boolean DEFAULT false NOT NULL,
  goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES public.milestones(id) ON DELETE SET NULL,
  repeat_enabled boolean DEFAULT false NOT NULL,
  repeat_unit text,
  repeat_frequency integer,
  repeat_days_of_week integer[],
  repeat_times text[],
  repeat_end_type text,
  repeat_end_date timestamptz,
  repeat_end_count integer,
  repeat_streak_current integer,
  repeat_streak_longest integer,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- 5. SUBTASKS TABLE
CREATE TABLE public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean DEFAULT false NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subtasks" ON public.subtasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subtasks" ON public.subtasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subtasks" ON public.subtasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subtasks" ON public.subtasks FOR DELETE USING (auth.uid() = user_id);

-- 6. CHECK_INS TABLE
CREATE TABLE public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  response text NOT NULL,
  mood text,
  energy_level integer,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own check_ins" ON public.check_ins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own check_ins" ON public.check_ins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. WORK_SESSIONS TABLE
CREATE TABLE public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  time_spent integer,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own work_sessions" ON public.work_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own work_sessions" ON public.work_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own work_sessions" ON public.work_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own work_sessions" ON public.work_sessions FOR DELETE USING (auth.uid() = user_id);

-- 8. TASK_HISTORY TABLE
CREATE TABLE public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own task_history" ON public.task_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_history" ON public.task_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. TASK_PROOFS TABLE
CREATE TABLE public.task_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  ai_rating numeric,
  ai_feedback text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.task_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own task_proofs" ON public.task_proofs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_proofs" ON public.task_proofs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 10. PUSH_SUBSCRIPTIONS TABLE
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own push_subscriptions" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own push_subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own push_subscriptions" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own push_subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 11. NOTIFICATION_PREFERENCES TABLE
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_hours_enabled boolean DEFAULT false NOT NULL,
  quiet_hours_start text DEFAULT '22:00' NOT NULL,
  quiet_hours_end text DEFAULT '08:00' NOT NULL,
  high_priority_enabled boolean DEFAULT true NOT NULL,
  medium_priority_enabled boolean DEFAULT true NOT NULL,
  low_priority_enabled boolean DEFAULT false NOT NULL,
  due_today_reminders_enabled boolean DEFAULT true NOT NULL,
  overdue_reminders_enabled boolean DEFAULT true NOT NULL,
  upcoming_reminders_enabled boolean DEFAULT true NOT NULL,
  daily_summary_enabled boolean DEFAULT true NOT NULL,
  frequency_multiplier numeric DEFAULT 1 NOT NULL,
  minimum_lead_time integer DEFAULT 30 NOT NULL,
  peak_energy_time text DEFAULT 'morning' NOT NULL,
  custom_reminder_times integer[],
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notification_preferences" ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notification_preferences" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notification_preferences" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);

-- 12. REPEAT_COMPLETIONS TABLE
CREATE TABLE public.repeat_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_date date NOT NULL,
  completed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.repeat_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own repeat_completions" ON public.repeat_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own repeat_completions" ON public.repeat_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own repeat_completions" ON public.repeat_completions FOR DELETE USING (auth.uid() = user_id);

-- 13. STORAGE BUCKET FOR TASK PROOFS
INSERT INTO storage.buckets (id, name, public) VALUES ('task-proofs', 'task-proofs', true);

CREATE POLICY "Users can upload own proofs" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'task-proofs' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Anyone can view proofs" ON storage.objects FOR SELECT USING (bucket_id = 'task-proofs');
CREATE POLICY "Users can delete own proofs" ON storage.objects FOR DELETE USING (
  bucket_id = 'task-proofs' AND auth.uid()::text = (storage.foldername(name))[1]
);

-- DONE! All tables, RLS policies, triggers, and storage are set up.

-- 14. TASK_VERIFICATIONS TABLE (used by verify-task-proof edge function)
CREATE TABLE public.task_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  task_description text,
  image_path text NOT NULL,
  ai_rating numeric,
  ai_feedback text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.task_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own task_verifications" ON public.task_verifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_verifications" ON public.task_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);
