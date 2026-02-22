# Migration Guide: Lovable Cloud → Appwrite

## Database Schema Reference

### Table: tasks
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| title | text | No | — |
| description | text | Yes | — |
| priority | text | No | — |
| status | text | No | 'not_started' |
| category | text | No | 'other' |
| due_date | timestamptz | Yes | — |
| completed_at | timestamptz | Yes | — |
| progress | integer | No | 0 |
| estimated_duration | integer | Yes | — |
| notes | text | Yes | — |
| goal_id | uuid | Yes | — (FK → goals.id) |
| milestone_id | uuid | Yes | — (FK → milestones.id) |
| requires_proof | boolean | No | false |
| repeat_enabled | boolean | No | false |
| repeat_unit | text | Yes | 'week' |
| repeat_frequency | integer | Yes | 1 |
| repeat_days_of_week | integer[] | Yes | — |
| repeat_times | text[] | Yes | — |
| repeat_end_type | text | Yes | 'never' |
| repeat_end_count | integer | Yes | — |
| repeat_end_date | timestamptz | Yes | — |
| repeat_streak_current | integer | Yes | 0 |
| repeat_streak_longest | integer | Yes | 0 |
| created_at | timestamptz | No | now() |

### Table: goals
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| title | text | No | — |
| description | text | Yes | — |
| category | text | No | 'other' |
| success_criteria | text | Yes | — |
| target_date | timestamptz | Yes | — |
| status | text | No | 'active' |
| progress | integer | No | 0 |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |

### Table: milestones
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| goal_id | uuid | No | — (FK → goals.id) |
| user_id | uuid | No | — |
| title | text | No | — |
| description | text | Yes | — |
| target_date | timestamptz | Yes | — |
| status | text | No | 'pending' |
| order_index | integer | No | 0 |
| created_at | timestamptz | No | now() |

### Table: profiles
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | — (matches auth user id) |
| name | text | Yes | — |
| timezone | text | No | 'America/New_York' |
| check_in_frequency | integer | No | 3 |
| current_streak | integer | No | 0 |
| longest_streak | integer | No | 0 |
| last_check_in_date | date | Yes | — |
| work_hours_start | time | No | '09:00' |
| work_hours_end | time | No | '18:00' |
| email_notifications_enabled | boolean | No | false |
| email_frequency | text | No | 'daily' |
| email_recommendations | boolean | No | true |
| email_overdue_alerts | boolean | No | true |
| email_weekly_reports | boolean | No | true |
| total_ai_rating | integer | No | 0 |
| total_proofs_submitted | integer | No | 0 |
| created_at | timestamptz | No | now() |

### Table: subtasks
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| task_id | uuid | No | — (FK → tasks.id) |
| user_id | uuid | No | — |
| title | text | No | — |
| completed | boolean | No | false |
| completed_at | timestamptz | Yes | — |
| created_at | timestamptz | No | now() |

### Table: check_ins
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| task_id | uuid | Yes | — (FK → tasks.id) |
| question | text | No | — |
| response | text | No | — |
| mood | text | Yes | — |
| energy_level | integer | Yes | — |
| created_at | timestamptz | No | now() |

### Table: work_sessions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| task_id | uuid | Yes | — (FK → tasks.id) |
| time_spent | integer | Yes | — |
| notes | text | Yes | — |
| created_at | timestamptz | No | now() |

### Table: task_proofs
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| task_id | uuid | No | — (FK → tasks.id) |
| user_id | uuid | No | — |
| image_url | text | No | — |
| ai_rating | integer | Yes | — |
| ai_feedback | text | Yes | — |
| created_at | timestamptz | No | now() |

### Table: task_history
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| task_id | uuid | No | — (FK → tasks.id) |
| user_id | uuid | No | — |
| field_changed | text | No | — |
| old_value | text | Yes | — |
| new_value | text | Yes | — |
| notes | text | Yes | — |
| created_at | timestamptz | No | now() |

### Table: repeat_completions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| task_id | uuid | No | — (FK → tasks.id) |
| user_id | uuid | No | — |
| completed_date | date | No | — |
| completed_at | timestamptz | No | now() |
| created_at | timestamptz | No | now() |

### Table: notification_preferences
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| quiet_hours_enabled | boolean | No | true |
| quiet_hours_start | time | No | '22:00' |
| quiet_hours_end | time | No | '07:00' |
| peak_energy_time | text | No | 'morning' |
| frequency_multiplier | numeric | No | 1.0 |
| minimum_lead_time | integer | No | 5 |
| daily_summary_enabled | boolean | No | true |
| upcoming_reminders_enabled | boolean | No | true |
| due_today_reminders_enabled | boolean | No | true |
| overdue_reminders_enabled | boolean | No | true |
| low_priority_enabled | boolean | No | false |
| medium_priority_enabled | boolean | No | true |
| high_priority_enabled | boolean | No | true |
| custom_reminder_times | integer[] | Yes | {15,60,1440} |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |

### Table: push_subscriptions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| user_id | uuid | No | — |
| endpoint | text | No | — |
| p256dh_key | text | No | — |
| auth_key | text | No | — |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |

### Storage Bucket: proof-images
- Public: Yes
- Contains task proof images uploaded by users

---

## Appwrite Equivalents

### Database
| Lovable Cloud | Appwrite |
|---------------|----------|
| Each table above | Create a **Collection** with matching attributes |
| uuid columns | Use Appwrite's `$id` for primary keys, `string` attributes for foreign keys |
| timestamptz | `datetime` attribute |
| integer[] / text[] | Use JSON attribute or related collection |
| Foreign keys | Use Appwrite **Relationships** between collections |

### Authentication
| Feature | Appwrite Equivalent |
|---------|-------------------|
| Email/password signup | `account.create()` + `account.createEmailPasswordSession()` |
| Email verification | `account.createVerification()` |
| Profile on signup (trigger) | Use Appwrite Function triggered on `users.*.create` event |

### Row-Level Security → Appwrite Permissions
Each table has RLS ensuring `auth.uid() = user_id`. In Appwrite:
- Set **document-level permissions** on create: `Permission.read(Role.user(userId))`, `Permission.write(Role.user(userId))`
- Or use collection-level permissions with `Role.users()` for read/write and filter by `user_id` in queries

### Edge Functions → Appwrite Functions
| Function | Purpose | Appwrite Equivalent |
|----------|---------|-------------------|
| ai-task-assistant | AI chat for tasks | Appwrite Function (Node.js/Python) |
| ai-goal-breakdown | Break goals into tasks | Appwrite Function |
| ai-calendar-schedule | AI scheduling | Appwrite Function |
| task-recommendations | AI task suggestions | Appwrite Function |
| validate-task-proof | Validate proof images | Appwrite Function |
| verify-task-proof | Verify proof with AI | Appwrite Function |
| send-email | Send emails via Resend | Appwrite Function |
| send-push-notification | Web push notifications | Appwrite Function |
| scheduled-notifications | Cron-style notifications | Appwrite Function with schedule trigger |

### Storage
| Lovable Cloud | Appwrite |
|---------------|----------|
| `proof-images` bucket (public) | Create Appwrite Storage bucket, set file-level permissions |

---

## Migration Steps

1. **Export data** using the `/export` page in the app
2. **Create Appwrite project** at cloud.appwrite.io
3. **Create collections** matching the schema above
4. **Set permissions** on each collection (document-level with user ID)
5. **Import JSON data** using Appwrite SDK or REST API
6. **Create storage bucket** and upload proof images
7. **Recreate functions** for AI features, email, push notifications
8. **Update frontend** to use Appwrite SDK instead of Supabase SDK
