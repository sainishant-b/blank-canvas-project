

# Fix: Push Notifications Not Being Received

## Root Cause Analysis

There are **3 critical issues** preventing notifications from working:

### 1. No Cron Job Triggering the Scheduled Notifications
The `scheduled-notifications` backend function exists but **nothing is calling it**. The edge function logs show **zero invocations ever**. This function is responsible for sending server-side push notifications for check-ins, overdue tasks, and daily summaries. Without a trigger, it never runs.

### 2. Client-Side Notifications Only Work When App Is Open
The current reminder hooks (`useCheckInScheduler`, `useTaskReminders`, `useNotificationScheduler`) all run inside React with `setInterval`. They **only fire when the app is actively open in the browser/foreground**. When your phone screen is off or the app is in the background, these intervals stop. This explains why you only get notifications when charging -- your phone screen may stay on longer or the browser stays active.

### 3. Deprecated FCM API
The `send-push-notification` function uses the **legacy FCM endpoint** (`fcm.googleapis.com/fcm/send`) which Google has deprecated. The memory note confirms you should be using the **FCM V1 API** with a Service Account JSON. You already have `FIREBASE_SERVICE_ACCOUNT_KEY` configured as a secret.

## Plan

### Step 1: Update `send-push-notification` to use FCM V1 API
- Replace the legacy `fcm.googleapis.com/fcm/send` call with the FCM V1 HTTP API (`fcm.googleapis.com/v1/projects/{project_id}/messages:send`)
- Use the `FIREBASE_SERVICE_ACCOUNT_KEY` to generate an OAuth2 access token for authentication
- This ensures Android notifications are reliably delivered

### Step 2: Set up a cron/pg_cron job to invoke `scheduled-notifications`
- Create a database cron job using `pg_cron` (available via the `pg_net` + `pg_cron` extensions) that calls the `scheduled-notifications` edge function **every hour**
- This ensures notifications are sent even when the app is completely closed
- The function already has logic for work-hours filtering, overdue alerts, daily summaries, and check-in reminders

### Step 3: Improve the `scheduled-notifications` function
- Add better error handling and logging
- Ensure it respects user timezone (currently uses server time which may differ from user's local time)

---

## Technical Details

### FCM V1 API Migration (send-push-notification)
- Parse `FIREBASE_SERVICE_ACCOUNT_KEY` JSON to get `client_email`, `private_key`, and `project_id`
- Generate a signed JWT to obtain an OAuth2 access token from Google
- POST to `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` with the access token
- Use the `message.notification` and `message.data` payload format

### Cron Job Setup (SQL Migration)
```text
-- Enable pg_cron and pg_net extensions
-- Create a cron job that runs every hour:
-- SELECT cron.schedule('hourly-notifications', '0 * * * *', ...)
-- The job will call the scheduled-notifications edge function via pg_net
```

### Why This Fixes the "Only on Charge" Behavior
When your phone is charging, Android's Doze mode is relaxed, allowing background browser processes to run. The client-side `setInterval` timers can fire. With server-side cron triggering, notifications will be pushed via FCM regardless of phone state -- they arrive like any other push notification (WhatsApp, Gmail, etc.).

