

# Goals Feature for Long-Term Productivity Planning

## Overview
Add a full Goals system with AI-powered breakdown, milestone tracking, and deep integration with existing tasks, work sessions, check-ins, and insights.

---

## Database Schema

### New Tables

**goals**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `title` (text, NOT NULL)
- `description` (text)
- `category` (text, default 'other') -- work, personal, learning, health, other
- `success_criteria` (text)
- `target_date` (timestamptz)
- `status` (text, default 'active') -- active, completed, paused, abandoned
- `progress` (integer, default 0) -- 0-100, auto-calculated
- `created_at`, `updated_at` (timestamptz)

**milestones**
- `id` (uuid, PK)
- `goal_id` (uuid, NOT NULL, FK -> goals)
- `user_id` (uuid, NOT NULL)
- `title` (text, NOT NULL)
- `description` (text)
- `target_date` (timestamptz)
- `status` (text, default 'pending') -- pending, active, completed
- `order_index` (integer, default 0)
- `created_at` (timestamptz)

**Add columns to existing `tasks` table:**
- `goal_id` (uuid, nullable, FK -> goals)
- `milestone_id` (uuid, nullable, FK -> milestones)

All tables get RLS policies restricting CRUD to `auth.uid() = user_id`.

---

## New Edge Function: `ai-goal-breakdown`

Uses Lovable AI (google/gemini-3-flash-preview) with tool calling to return structured output:
- Input: goal title, description, success criteria, target date, category
- Output: array of milestones, each with title, target date, and 2-4 tasks
- Prompt: "Break down '[goal]' into realistic milestones and tasks for [timeline]. Return monthly/quarterly checkpoints with specific actionable tasks."

---

## New Pages & Components

### 1. Goals Page (`src/pages/Goals.tsx`)
- List of active goals as cards with progress rings
- "New Goal" button opens GoalDialog
- Click goal navigates to GoalDetail page
- Filter tabs: Active / Completed / All

### 2. Goal Detail Page (`src/pages/GoalDetail.tsx`)
- Header: title, description, progress bar, days remaining, time invested
- Timeline view showing milestones vertically
- Each milestone expands to show linked tasks
- "Add Task" button per milestone
- AI actions: "Suggest next steps", "Adjust timeline"

### 3. GoalDialog Component (`src/components/GoalDialog.tsx`)
- Form: title, description, target date (using DateTimePicker), category, success criteria
- After creation, auto-triggers AI breakdown
- Shows AI suggestions in a review panel (approve/edit/regenerate)

### 4. GoalCard Component (`src/components/GoalCard.tsx`)
- Progress ring (circular), title, category badge
- Milestone indicator dots (completed/active/pending)
- Days remaining counter
- Click to navigate to detail

### 5. MilestoneCard Component (`src/components/MilestoneCard.tsx`)
- Expandable card showing milestone title, target date, status
- Nested task list with completion toggles
- Visual indicator: past (green), current (blue pulse), upcoming (gray)

---

## Navigation Updates

### Desktop Sidebar (AppLayout.tsx)
- Add "Goals" icon button (Target icon from lucide) between Dashboard and Check-in

### Mobile Bottom Nav (MobileBottomNav.tsx)
- Add "Goals" tab with Target icon (rearrange: Check-in, Goals, Calendar, Insights, Settings)

### App Router (App.tsx)
- Add routes: `/goals` and `/goals/:goalId`

---

## Task-Goal Linking

### TaskDialog Updates
- Add optional "Link to Goal" select dropdown showing active goals
- When a goal is selected, show milestone selector
- Sets `goal_id` and `milestone_id` on the task

### Auto Progress Calculation
- When a task linked to a goal is completed, recalculate goal progress:
  - `goal.progress = (completed linked tasks / total linked tasks) * 100`
- Update via a simple client-side recalc after task toggle

---

## Integration with Existing Features

### AI Recommendations
- Goal-linked tasks get priority boost in recommendation prompts

### Work Sessions
- Work session time on goal-linked tasks aggregates into "time invested" on goal detail

### Check-ins
- Add goal progress question to check-in rotation: "How's your progress on [goal]?"

### Insights
- Add a "Goal Progress" section showing active goals with progress bars

---

## Implementation Sequence

1. **Database migration** -- Create `goals` and `milestones` tables, add `goal_id`/`milestone_id` to `tasks`
2. **Edge function** -- Create `ai-goal-breakdown` function
3. **GoalCard & GoalDialog components** -- Reusable UI pieces
4. **Goals page** -- List view with create flow
5. **MilestoneCard & GoalDetail page** -- Detail view with timeline
6. **Navigation updates** -- Add Goals to sidebar and bottom nav
7. **TaskDialog linking** -- Add goal/milestone selectors to task creation
8. **Progress auto-calculation** -- Update goal progress on task completion
9. **Integration touchpoints** -- Check-ins, insights, recommendations

---

## Technical Notes

- Progress rings will use a simple SVG circle with `stroke-dashoffset` animation
- Goal breakdown AI uses tool calling (structured output) same pattern as `ai-task-assistant`
- Milestone timeline uses a vertical line with dot indicators, built with Tailwind
- All new pages follow existing patterns: auth check, loading state, mobile-responsive layout
- Categories reuse existing task categories for consistency

