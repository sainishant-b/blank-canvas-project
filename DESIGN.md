# AI Productivity Companion - Design Document

## Project Information

**Project Name:** AI Productivity Companion  
**Hackathon:** AI for Bharat  
**Version:** 1.0  
**Last Updated:** February 15, 2026  
**Document Status:** Final for Hackathon Submission

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Database Design](#database-design)
4. [API Design](#api-design)
5. [Frontend Architecture](#frontend-architecture)
6. [AI Integration](#ai-integration)
7. [Notification System](#notification-system)
8. [Security Design](#security-design)
9. [Mobile Architecture](#mobile-architecture)
10. [UI/UX Design](#uiux-design)
11. [Deployment Architecture](#deployment-architecture)
12. [Performance Optimization](#performance-optimization)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├──────────────────┬──────────────────┬──────────────────────┤
│   Web Browser    │   iOS App        │   Android App        │
│   (React SPA)    │   (Capacitor)    │   (Capacitor)        │
└────────┬─────────┴────────┬─────────┴────────┬─────────────┘
         │                  │                  │
         └──────────────────┴──────────────────┘
                            │
                    ┌───────▼────────┐
                    │   AWS CDN      │
                    │  (CloudFront)  │
                    └───────┬────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
    ┌────▼─────┐                      ┌───────▼────────┐
    │  AWS S3  │                      │   Supabase     │
    │ (Static) │                      │   Platform     │
    └──────────┘                      └───────┬────────┘
                                              │
                    ┌─────────────────────────┼─────────────────┐
                    │                         │                 │
            ┌───────▼────────┐       ┌───────▼────────┐  ┌────▼─────┐
            │  PostgreSQL    │       │ Edge Functions │  │   Auth   │
            │   Database     │       │  (Deno)        │  │ Service  │
            └────────────────┘       └────────────────┘  └──────────┘
```


### 1.2 Architecture Principles

- **Separation of Concerns:** Frontend (React), Backend (Supabase), AI (Edge Functions)
- **Stateless Frontend:** All state managed via React Query and Supabase
- **Serverless Backend:** Edge functions for compute, managed database for storage
- **Mobile-First:** Responsive design with progressive enhancement
- **Security by Default:** Row-level security, HTTPS everywhere, secure authentication

### 1.3 Data Flow

1. **User Action** → React Component
2. **Component** → React Query Hook
3. **Hook** → Supabase Client
4. **Client** → Supabase API (REST/Realtime)
5. **API** → PostgreSQL (with RLS)
6. **Response** → React Query Cache
7. **Cache** → Component Re-render

---

## 2. Technology Stack

### 2.1 Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 5.4.19 | Build tool |
| Tailwind CSS | 3.4.17 | Styling |
| shadcn/ui | Latest | Component library |
| TanStack Query | 5.83.0 | Server state management |
| React Router | 6.30.1 | Client-side routing |
| React Hook Form | 7.61.1 | Form management |
| Zod | 3.25.76 | Schema validation |
| date-fns | 3.6.0 | Date manipulation |
| Recharts | 2.15.4 | Data visualization |
| Lucide React | 0.462.0 | Icon library |

### 2.2 Backend Technologies

| Technology | Purpose |
|------------|---------|
| Supabase | Backend-as-a-Service platform |
| PostgreSQL 15 | Relational database |
| PostgREST | Auto-generated REST API |
| Supabase Auth | Authentication service |
| Supabase Realtime | WebSocket subscriptions |
| Deno | Edge function runtime |
| pg_cron | Scheduled database jobs |
| pg_net | HTTP requests from database |

### 2.3 Mobile Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Capacitor | 8.0.0 | Native bridge |
| @capacitor/app | 8.0.0 | App lifecycle |
| @capacitor/status-bar | 8.0.0 | Status bar control |
| @capacitor/local-notifications | 8.0.0 | Local notifications |
| @capacitor/push-notifications | 8.0.0 | Push notifications |

### 2.4 Infrastructure

| Service | Purpose |
|---------|---------|
| AWS S3 | Static file hosting |
| AWS CloudFront | CDN for global distribution |
| Supabase Cloud | Managed backend services |
| Firebase Cloud Messaging | Mobile push notifications |

---

## 3. Database Design

### 3.1 Entity Relationship Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  profiles   │         │    tasks     │         │  subtasks   │
├─────────────┤         ├──────────────┤         ├─────────────┤
│ id (PK)     │◄───────┤│ id (PK)      │◄───────┤│ id (PK)     │
│ user_id     │         │ user_id (FK) │         │ task_id(FK) │
│ work_hours  │         │ title        │         │ title       │
│ check_freq  │         │ description  │         │ completed   │
│ streak      │         │ priority     │         │ created_at  │
└─────────────┘         │ category     │         └─────────────┘
                        │ due_date     │
       │                │ progress     │                │
       │                │ completed    │                │
       │                └──────────────┘                │
       │                       │                        │
       │                       │                        │
       ▼                       ▼                        ▼
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  check_ins  │         │work_sessions │         │task_history │
├─────────────┤         ├──────────────┤         ├─────────────┤
│ id (PK)     │         │ id (PK)      │         │ id (PK)     │
│ user_id(FK) │         │ task_id (FK) │         │ task_id(FK) │
│ energy      │         │ start_time   │         │ field       │
│ mood        │         │ end_time     │         │ old_value   │
│ notes       │         │ duration     │         │ new_value   │
│ created_at  │         │ notes        │         │ changed_at  │
└─────────────┘         └──────────────┘         └─────────────┘
```


### 3.2 Database Schema Details

#### 3.2.1 profiles Table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  work_hours_start TIME DEFAULT '09:00:00',
  work_hours_end TIME DEFAULT '17:00:00',
  check_in_frequency INTEGER DEFAULT 4, -- hours
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  email_notifications_enabled BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_profiles_user_id` on `user_id`

**RLS Policies:**
- Users can only read/update their own profile

#### 3.2.2 tasks Table

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('work', 'personal', 'health', 'learning', 'other')),
  due_date TIMESTAMPTZ,
  estimated_duration INTEGER, -- minutes
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  -- Repeat configuration
  repeat_frequency TEXT CHECK (repeat_frequency IN ('daily', 'weekly', 'monthly')),
  repeat_days INTEGER[], -- 0=Sunday, 6=Saturday
  repeat_end_date TIMESTAMPTZ,
  repeat_count INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_tasks_user_id` on `user_id`
- `idx_tasks_due_date` on `due_date`
- `idx_tasks_priority` on `priority`
- `idx_tasks_completed` on `completed`

**RLS Policies:**
- Users can only access their own tasks

#### 3.2.3 subtasks Table

```sql
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_subtasks_task_id` on `task_id`

#### 3.2.4 work_sessions Table

```sql
CREATE TABLE work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration INTEGER, -- seconds
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_work_sessions_task_id` on `task_id`
- `idx_work_sessions_user_id` on `user_id`
- `idx_work_sessions_start_time` on `start_time`

#### 3.2.5 check_ins Table

```sql
CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
  mood TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_check_ins_user_id` on `user_id`
- `idx_check_ins_created_at` on `created_at`

#### 3.2.6 notification_preferences Table

```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency_multiplier DECIMAL DEFAULT 1.0,
  min_lead_time INTEGER DEFAULT 30, -- minutes
  high_priority_enabled BOOLEAN DEFAULT true,
  medium_priority_enabled BOOLEAN DEFAULT true,
  low_priority_enabled BOOLEAN DEFAULT false,
  custom_reminder_times INTEGER[], -- minutes before due
  peak_energy_time TIME,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

#### 3.2.7 push_subscriptions Table

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_type TEXT, -- 'web', 'android', 'ios'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint)
);
```

---

## 4. API Design

### 4.1 REST API Endpoints (Auto-generated by PostgREST)

#### Authentication
- `POST /auth/v1/signup` - Register new user
- `POST /auth/v1/token?grant_type=password` - Sign in
- `POST /auth/v1/logout` - Sign out
- `GET /auth/v1/user` - Get current user

#### Tasks
- `GET /rest/v1/tasks` - List all tasks (filtered by user_id via RLS)
- `POST /rest/v1/tasks` - Create task
- `PATCH /rest/v1/tasks?id=eq.{id}` - Update task
- `DELETE /rest/v1/tasks?id=eq.{id}` - Delete task

#### Subtasks
- `GET /rest/v1/subtasks?task_id=eq.{task_id}` - List subtasks
- `POST /rest/v1/subtasks` - Create subtask
- `PATCH /rest/v1/subtasks?id=eq.{id}` - Update subtask
- `DELETE /rest/v1/subtasks?id=eq.{id}` - Delete subtask

#### Work Sessions
- `GET /rest/v1/work_sessions?task_id=eq.{task_id}` - List sessions
- `POST /rest/v1/work_sessions` - Start session
- `PATCH /rest/v1/work_sessions?id=eq.{id}` - End session

#### Check-ins
- `GET /rest/v1/check_ins` - List check-ins
- `POST /rest/v1/check_ins` - Create check-in

#### Profiles
- `GET /rest/v1/profiles?user_id=eq.{user_id}` - Get profile
- `PATCH /rest/v1/profiles?user_id=eq.{user_id}` - Update profile


### 4.2 Edge Functions (Serverless)

#### 4.2.1 task-recommendations

**Endpoint:** `POST /functions/v1/task-recommendations`

**Request:**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "string",
      "priority": "high|medium|low",
      "due_date": "ISO8601",
      "estimated_duration": 60
    }
  ],
  "check_ins": [
    {
      "energy_level": 4,
      "created_at": "ISO8601"
    }
  ]
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "task_id": "uuid",
      "suggested_time": "ISO8601",
      "reason": "string",
      "priority_score": 0.95
    }
  ],
  "insights": [
    "You're most productive in the morning",
    "Consider breaking down large tasks"
  ]
}
```

#### 4.2.2 send-push-notification

**Endpoint:** `POST /functions/v1/send-push-notification`

**Request:**
```json
{
  "user_id": "uuid",
  "title": "Task Reminder",
  "body": "Complete your high-priority task",
  "data": {
    "task_id": "uuid",
    "type": "task_reminder"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sent_count": 2,
  "failed_count": 0
}
```

#### 4.2.3 scheduled-notifications

**Endpoint:** `POST /functions/v1/scheduled-notifications`

**Trigger:** Hourly cron job

**Logic:**
1. Query all users with tasks due in next 24 hours
2. Check notification preferences
3. Respect quiet hours and work hours
4. Send notifications via `send-push-notification`
5. Log notification history

---

## 5. Frontend Architecture

### 5.1 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui base components
│   ├── TaskCard.tsx
│   ├── TaskDialog.tsx
│   ├── CheckInModal.tsx
│   └── ...
├── hooks/              # Custom React hooks
│   ├── useLocalNotifications.ts
│   ├── useNotificationScheduler.ts
│   ├── useWorkSessionTimer.ts
│   └── ...
├── integrations/       # External service integrations
│   └── supabase/
│       ├── client.ts
│       └── types.ts
├── lib/                # Utility functions
│   └── utils.ts
├── pages/              # Route components
│   ├── Dashboard.tsx
│   ├── Calendar.tsx
│   ├── Insights.tsx
│   ├── Settings.tsx
│   └── Auth.tsx
├── utils/              # Business logic utilities
│   ├── notificationDecisionEngine.ts
│   ├── repeatTaskUtils.ts
│   └── ...
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

### 5.2 State Management Strategy

#### 5.2.1 Server State (React Query)

```typescript
// Example: Tasks query
const { data: tasks, isLoading } = useQuery({
  queryKey: ['tasks', userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, subtasks(*)')
      .order('due_date', { ascending: true });
    
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5, // 5 minutes
});
```

#### 5.2.2 Local State (React useState/useReducer)

- Component-specific UI state (modals, forms)
- Active work session timer
- Notification permission status

#### 5.2.3 Persistent State (localStorage)

- Theme preference (light/dark)
- Active session backup
- Notification preferences cache

### 5.3 Component Architecture

#### 5.3.1 Component Hierarchy

```
App
├── AppLayout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   ├── Sidebar (Desktop)
│   │   └── StatsSidebar
│   ├── MainContent
│   │   └── [Page Component]
│   └── MobileBottomNav (Mobile)
├── TaskDialog (Modal)
├── CheckInModal (Modal)
└── NotificationPrompt (Toast)
```

#### 5.3.2 Component Patterns

**Container/Presenter Pattern:**
```typescript
// Container (logic)
const TaskListContainer = () => {
  const { data: tasks } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  
  return <TaskList tasks={tasks} onUpdate={updateTask} />;
};

// Presenter (UI)
const TaskList = ({ tasks, onUpdate }) => {
  return tasks.map(task => <TaskCard key={task.id} task={task} />);
};
```

**Custom Hooks Pattern:**
```typescript
// Encapsulate complex logic
const useTaskReminders = (task: Task) => {
  const preferences = useNotificationPreferences();
  const scheduleNotification = useLocalNotifications();
  
  useEffect(() => {
    if (task.due_date && preferences) {
      scheduleNotification(task, preferences);
    }
  }, [task, preferences]);
};
```

---

## 6. AI Integration

### 6.1 AI Architecture

```
User Tasks + Check-ins
        ↓
  Decision Engine
        ↓
  AI Prompt Builder
        ↓
  Lovable AI API
        ↓
  Response Parser
        ↓
  Recommendation Cache
        ↓
  UI Display
```

### 6.2 AI Prompt Engineering

**System Prompt:**
```
You are a productivity assistant analyzing user tasks and energy patterns.
Provide actionable recommendations for task scheduling and prioritization.
Consider: priority levels, due dates, estimated duration, and user energy patterns.
```

**User Prompt Template:**
```
Tasks:
- [High Priority] Complete project proposal (Due: Tomorrow, 2h)
- [Medium Priority] Review code (Due: Next week, 1h)

Recent Energy Patterns:
- Morning (9-12): High energy (avg 4.5/5)
- Afternoon (1-5): Medium energy (avg 3/5)

Provide:
1. Optimal task order for today
2. Suggested time blocks
3. Productivity insights
```

### 6.3 Recommendation Caching

```typescript
interface CachedRecommendation {
  userId: string;
  recommendations: Recommendation[];
  generatedAt: Date;
  expiresAt: Date;
  taskSnapshot: string; // hash of task IDs + priorities
}

// Cache for 1 hour or until tasks change
const getCachedRecommendations = (userId: string, tasks: Task[]) => {
  const cache = localStorage.getItem(`ai_rec_${userId}`);
  if (!cache) return null;
  
  const cached: CachedRecommendation = JSON.parse(cache);
  const currentSnapshot = hashTasks(tasks);
  
  if (cached.taskSnapshot === currentSnapshot && 
      new Date() < new Date(cached.expiresAt)) {
    return cached.recommendations;
  }
  
  return null;
};
```


---

## 7. Notification System

### 7.1 Notification Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Notification System                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Decision   │────────▶│  Scheduler   │             │
│  │   Engine     │         │              │             │
│  └──────────────┘         └──────┬───────┘             │
│         │                         │                     │
│         │                         │                     │
│         ▼                         ▼                     │
│  ┌──────────────┐         ┌──────────────┐             │
│  │ Preferences  │         │   Queue      │             │
│  │   Manager    │         │   Manager    │             │
│  └──────────────┘         └──────┬───────┘             │
│                                   │                     │
│         ┌─────────────────────────┼─────────────┐       │
│         │                         │             │       │
│         ▼                         ▼             ▼       │
│  ┌──────────────┐         ┌──────────────┐  ┌────────┐ │
│  │    Local     │         │   Web Push   │  │  FCM   │ │
│  │Notifications │         │   (Browser)  │  │(Mobile)│ │
│  └──────────────┘         └──────────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Notification Decision Engine

**Algorithm:**
```typescript
function shouldSendNotification(
  task: Task,
  preferences: NotificationPreferences,
  currentTime: Date
): boolean {
  // Check if task priority is enabled
  if (!preferences[`${task.priority}_priority_enabled`]) {
    return false;
  }
  
  // Check quiet hours
  if (preferences.quiet_hours_enabled) {
    if (isInQuietHours(currentTime, preferences)) {
      return false;
    }
  }
  
  // Check work hours
  if (!isInWorkHours(currentTime, userProfile)) {
    return false;
  }
  
  // Calculate lead time
  const leadTime = task.due_date - currentTime;
  const minLeadTime = preferences.min_lead_time * 60 * 1000;
  
  if (leadTime < minLeadTime) {
    return false;
  }
  
  // Apply frequency multiplier
  const baseInterval = getBaseInterval(task.priority);
  const adjustedInterval = baseInterval / preferences.frequency_multiplier;
  
  return shouldNotifyBasedOnInterval(task, adjustedInterval);
}
```

### 7.3 Notification Types

| Type | Trigger | Priority | Frequency |
|------|---------|----------|-----------|
| Overdue Alert | Task past due date | High | Once per day |
| Due Today | Task due within 24h | High | Morning + 2h before |
| Due Tomorrow | Task due in 24-48h | Medium | Once per day |
| Check-in Reminder | Based on frequency setting | Medium | Per user config |
| AI Recommendation | New insights available | Low | Max once per day |
| Session Complete | Work session ended | Low | Immediate |

### 7.4 Web Push Implementation

**Service Worker Registration:**
```javascript
// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: data.data,
    actions: [
      { action: 'view', title: 'View Task' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: data.priority === 'high'
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    const taskId = event.notification.data.task_id;
    event.waitUntil(
      clients.openWindow(`/task/${taskId}`)
    );
  }
});
```

**Subscription Management:**
```typescript
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
  
  // Save to database
  await supabase.from('push_subscriptions').insert({
    user_id: currentUser.id,
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
    auth: arrayBufferToBase64(subscription.getKey('auth')),
    device_type: 'web'
  });
}
```

---

## 8. Security Design

### 8.1 Authentication Flow

```
1. User submits email/password
2. Frontend sends to Supabase Auth
3. Supabase validates credentials
4. Returns JWT access token + refresh token
5. Frontend stores tokens in localStorage
6. All API requests include JWT in Authorization header
7. Supabase validates JWT on each request
8. RLS policies enforce user_id matching
```

### 8.2 Row Level Security (RLS) Policies

**Example: Tasks Table**
```sql
-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks"
ON tasks FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert tasks for themselves
CREATE POLICY "Users can insert own tasks"
ON tasks FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own tasks
CREATE POLICY "Users can update own tasks"
ON tasks FOR UPDATE
USING (auth.uid() = user_id);

-- Users can only delete their own tasks
CREATE POLICY "Users can delete own tasks"
ON tasks FOR DELETE
USING (auth.uid() = user_id);
```

### 8.3 API Security

**Rate Limiting:**
- 100 requests per minute per user
- 1000 requests per hour per user
- Enforced at Supabase edge

**Input Validation:**
```typescript
// Using Zod schemas
const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['high', 'medium', 'low']),
  due_date: z.string().datetime().optional(),
  estimated_duration: z.number().int().min(1).max(1440).optional()
});

// Validate before submission
const result = taskSchema.safeParse(formData);
if (!result.success) {
  throw new Error(result.error.message);
}
```

### 8.4 Data Protection

- **Encryption at Rest:** All database data encrypted (Supabase default)
- **Encryption in Transit:** HTTPS/TLS 1.3 for all connections
- **Password Hashing:** bcrypt with salt (Supabase Auth default)
- **Token Expiry:** Access tokens expire after 1 hour, refresh tokens after 7 days
- **CORS:** Restricted to allowed origins only

---

## 9. Mobile Architecture

### 9.1 Capacitor Integration

**Configuration:**
```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'ai.productivity',
  appName: 'AI Productivity',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#000000'
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#6366f1'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};
```

### 9.2 Platform Detection

```typescript
const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};
```

### 9.3 Native Features

**Local Notifications:**
```typescript
import { LocalNotifications } from '@capacitor/local-notifications';

async function scheduleTaskReminder(task: Task) {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: task.id,
        title: 'Task Reminder',
        body: task.title,
        schedule: { at: new Date(task.due_date) },
        sound: 'default',
        actionTypeId: 'TASK_REMINDER',
        extra: { task_id: task.id }
      }
    ]
  });
}
```

**Push Notifications (FCM):**
```typescript
import { PushNotifications } from '@capacitor/push-notifications';

async function registerPushNotifications() {
  let permStatus = await PushNotifications.checkPermissions();
  
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }
  
  if (permStatus.receive === 'granted') {
    await PushNotifications.register();
  }
  
  PushNotifications.addListener('registration', (token) => {
    // Save FCM token to database
    saveFCMToken(token.value);
  });
  
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Handle foreground notification
    showInAppNotification(notification);
  });
}
```


---

## 10. UI/UX Design

### 10.1 Design System

#### 10.1.1 Color Palette

**Light Mode:**
```css
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--primary: 221.2 83.2% 53.3%;
--primary-foreground: 210 40% 98%;
--secondary: 210 40% 96.1%;
--accent: 210 40% 96.1%;
--destructive: 0 84.2% 60.2%;
--success: 142 76% 36%;
```

**Dark Mode:**
```css
--background: 222.2 84% 4.9%;
--foreground: 210 40% 98%;
--primary: 217.2 91.2% 59.8%;
--primary-foreground: 222.2 47.4% 11.2%;
--secondary: 217.2 32.6% 17.5%;
--accent: 217.2 32.6% 17.5%;
--destructive: 0 62.8% 30.6%;
--success: 142 71% 45%;
```

#### 10.1.2 Typography

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Font Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
```

#### 10.1.3 Spacing Scale

```css
--spacing-1: 0.25rem;  /* 4px */
--spacing-2: 0.5rem;   /* 8px */
--spacing-3: 0.75rem;  /* 12px */
--spacing-4: 1rem;     /* 16px */
--spacing-6: 1.5rem;   /* 24px */
--spacing-8: 2rem;     /* 32px */
--spacing-12: 3rem;    /* 48px */
```

### 10.2 Component Design Patterns

#### 10.2.1 Task Card

**Desktop Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Priority Badge] Task Title              [Progress] │
│ Description preview...                   [75%]      │
│ [Category] [Due: Tomorrow] [2h]          [Actions]  │
└─────────────────────────────────────────────────────┘
```

**Mobile Layout:**
```
┌──────────────────────────────┐
│ [P] Task Title        [75%]  │
│ Description...               │
│ [Category] Due: Tomorrow     │
│ ← Swipe for actions          │
└──────────────────────────────┘
```

#### 10.2.2 Priority Visual Indicators

- **High Priority:** Red accent, filled badge, bold text
- **Medium Priority:** Yellow accent, outlined badge, normal text
- **Low Priority:** Gray accent, subtle badge, lighter text

#### 10.2.3 Progress Visualization

```typescript
// Progress bar with color coding
const getProgressColor = (progress: number) => {
  if (progress >= 75) return 'bg-green-500';
  if (progress >= 50) return 'bg-blue-500';
  if (progress >= 25) return 'bg-yellow-500';
  return 'bg-gray-500';
};
```

### 10.3 Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

**Layout Adaptations:**
- **Mobile (<768px):** Single column, bottom nav, swipe gestures
- **Tablet (768-1024px):** Two columns, side nav, touch-friendly
- **Desktop (>1024px):** Three columns, sidebar, keyboard shortcuts

### 10.4 Accessibility Features

- **Keyboard Navigation:** Full keyboard support with visible focus indicators
- **Screen Reader Support:** ARIA labels on all interactive elements
- **Color Contrast:** WCAG AA compliant (4.5:1 for text)
- **Focus Management:** Proper focus trapping in modals
- **Reduced Motion:** Respects `prefers-reduced-motion` media query

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 10.5 Loading States

**Skeleton Screens:**
```tsx
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
</div>
```

**Optimistic Updates:**
```typescript
const { mutate } = useMutation({
  mutationFn: updateTask,
  onMutate: async (newTask) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['tasks']);
    
    // Snapshot previous value
    const previous = queryClient.getQueryData(['tasks']);
    
    // Optimistically update
    queryClient.setQueryData(['tasks'], (old) => 
      old.map(t => t.id === newTask.id ? newTask : t)
    );
    
    return { previous };
  },
  onError: (err, newTask, context) => {
    // Rollback on error
    queryClient.setQueryData(['tasks'], context.previous);
  }
});
```

---

## 11. Deployment Architecture

### 11.1 AWS Infrastructure

```
┌─────────────────────────────────────────────────────┐
│                   Route 53 (DNS)                     │
│              ai-productivity.com                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              CloudFront (CDN)                        │
│  - Global edge locations                            │
│  - HTTPS/TLS termination                            │
│  - Caching (1 hour for static assets)               │
│  - Gzip/Brotli compression                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│                S3 Bucket                             │
│  - Static website hosting                           │
│  - Versioning enabled                               │
│  - Public read access                               │
│  - index.html as default                            │
└─────────────────────────────────────────────────────┘
```

### 11.2 Build Pipeline

```bash
# 1. Install dependencies
npm ci

# 2. Run linting
npm run lint

# 3. Build for production
npm run build
# Output: dist/ folder

# 4. Sync to S3
aws s3 sync dist/ s3://ai-productivity-app --delete

# 5. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

### 11.3 Environment Configuration

**Production (.env.production):**
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
VITE_VAPID_PUBLIC_KEY=BAeeHVt...
VITE_ENV=production
```

**Build-time Variable Injection:**
```typescript
// vite.config.ts
export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'import.meta.env.VITE_VERSION': JSON.stringify(process.env.npm_package_version)
  }
});
```

### 11.4 Monitoring & Logging

**CloudWatch Metrics:**
- Request count
- Error rate (4xx, 5xx)
- Latency (p50, p95, p99)
- Data transfer

**Supabase Logs:**
- Database query performance
- Edge function execution time
- Authentication events
- API errors

---

## 12. Performance Optimization

### 12.1 Frontend Optimizations

#### Code Splitting
```typescript
// Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Insights = lazy(() => import('./pages/Insights'));

// Route configuration
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/calendar" element={<Calendar />} />
    <Route path="/insights" element={<Insights />} />
  </Routes>
</Suspense>
```

#### Image Optimization
```typescript
// Use WebP with fallback
<picture>
  <source srcSet="/splash.webp" type="image/webp" />
  <img src="/splash.png" alt="Splash" loading="lazy" />
</picture>
```

#### Bundle Size Optimization
```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          'query-vendor': ['@tanstack/react-query']
        }
      }
    }
  }
});
```

### 12.2 Database Optimizations

#### Indexing Strategy
```sql
-- Composite index for common query
CREATE INDEX idx_tasks_user_priority_due 
ON tasks(user_id, priority, due_date) 
WHERE completed = false;

-- Partial index for active sessions
CREATE INDEX idx_active_sessions 
ON work_sessions(user_id, task_id) 
WHERE end_time IS NULL;
```

#### Query Optimization
```typescript
// Use select() to fetch only needed columns
const { data } = await supabase
  .from('tasks')
  .select('id, title, priority, due_date')
  .eq('completed', false)
  .order('due_date', { ascending: true })
  .limit(50);
```

### 12.3 Caching Strategy

**Browser Cache (CloudFront):**
```
Cache-Control: public, max-age=31536000, immutable  # JS/CSS
Cache-Control: public, max-age=3600                 # HTML
Cache-Control: no-cache                             # index.html
```

**React Query Cache:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 minutes
      cacheTime: 1000 * 60 * 30,     // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});
```

### 12.4 Performance Metrics

**Target Metrics:**
- First Contentful Paint (FCP): < 1.5s
- Largest Contentful Paint (LCP): < 2.5s
- Time to Interactive (TTI): < 3.5s
- Cumulative Layout Shift (CLS): < 0.1
- First Input Delay (FID): < 100ms

**Monitoring:**
```typescript
// Web Vitals tracking
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

---

## 13. Testing Strategy

### 13.1 Unit Testing
- Component logic testing with Vitest
- Utility function testing
- Custom hook testing with React Testing Library

### 13.2 Integration Testing
- API integration tests
- Database query tests
- Edge function tests

### 13.3 E2E Testing
- Critical user flows (sign up, create task, start session)
- Cross-browser testing (Chrome, Safari, Firefox)
- Mobile device testing (iOS, Android)

---

## 14. Future Enhancements

### 14.1 Technical Improvements
- Implement service worker for offline support
- Add real-time collaboration with WebSockets
- Implement GraphQL for more efficient queries
- Add Redis caching layer
- Implement CDC (Change Data Capture) for audit logs

### 14.2 Feature Additions
- Voice input with speech-to-text
- Calendar integrations (Google, Outlook)
- Team workspaces
- Advanced analytics dashboard
- Mobile widgets

---

## Appendix

### A. Technology Justification

**Why React?**
- Large ecosystem, excellent TypeScript support
- Rich component library (shadcn/ui)
- Strong mobile support via Capacitor

**Why Supabase?**
- Rapid development with auto-generated APIs
- Built-in authentication and RLS
- Real-time subscriptions
- Generous free tier

**Why AWS?**
- Industry standard, hackathon requirement
- Excellent CDN (CloudFront)
- Reliable and scalable
- Cost-effective for static hosting

### B. References

- React Documentation: https://react.dev
- Supabase Documentation: https://supabase.com/docs
- Capacitor Documentation: https://capacitorjs.com
- AWS S3 Static Hosting: https://docs.aws.amazon.com/s3/
- Web Push Protocol: https://web.dev/push-notifications/

---

**Document Version:** 1.0  
**Last Updated:** February 15, 2026  
**Prepared for:** AI for Bharat Hackathon  
**Team:** AI Productivity Team
