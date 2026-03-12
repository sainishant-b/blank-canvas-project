import { useCallback, useEffect, useRef } from "react";
import { useLocalNotifications, ScheduledNotification } from "./useLocalNotifications";
import { supabase } from "@/integrations/supabase/client";
import { 
  calculateNotificationSchedule, 
  calculateAllNotificationSchedules,
  getNotificationSummary,
  hasScheduleChanged,
  NotificationSchedule,
  ScheduledNotificationTime,
  UserNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/utils/notificationDecisionEngine";

interface Task {
  id: string;
  title: string;
  due_date?: string | null;
  status: string;
  priority: string;
  estimated_duration?: number | null;
  category?: string;
}

interface Profile {
  work_hours_start: string;
  work_hours_end: string;
  check_in_frequency: number;
}

interface RecommendedTask {
  taskId: string;
  title: string;
  suggestedTime: string;
  suggestedDate: string;
  reasoning: string;
  priority: string;
}

interface UseNotificationSchedulerOptions {
  profile: Profile | null;
  tasks: Task[];
  enabled?: boolean;
}

// Storage key for notification IDs per task
const TASK_NOTIFICATION_IDS_KEY = 'taskNotificationIds';

// Get stored notification IDs for tasks
const getStoredNotificationIds = (): Record<string, number[]> => {
  try {
    const stored = localStorage.getItem(TASK_NOTIFICATION_IDS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

// Store notification IDs for a task
const storeNotificationIds = (taskId: string, ids: number[]) => {
  const current = getStoredNotificationIds();
  current[taskId] = ids;
  localStorage.setItem(TASK_NOTIFICATION_IDS_KEY, JSON.stringify(current));
};

// Remove stored notification IDs for a task
const removeStoredNotificationIds = (taskId: string) => {
  const current = getStoredNotificationIds();
  delete current[taskId];
  localStorage.setItem(TASK_NOTIFICATION_IDS_KEY, JSON.stringify(current));
};

// Get user notification preferences from localStorage
const getUserPreferences = (): UserNotificationPreferences => {
  try {
    const stored = localStorage.getItem('userNotificationPreferences');
    if (stored) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_NOTIFICATION_PREFERENCES;
};

export const useNotificationScheduler = ({
  profile,
  tasks,
  enabled = true,
}: UseNotificationSchedulerOptions) => {
  const {
    isNative,
    hasPermission,
    settings,
    scheduleNotification,
    scheduleMultipleNotifications,
    cancelNotification,
    cancelNotificationsByType,
    refreshPendingNotifications,
  } = useLocalNotifications();

  const scheduledTaskIdsRef = useRef<Set<string>>(new Set());
  const lastCheckInScheduleRef = useRef<string | null>(null);
  const dailyNotificationScheduledRef = useRef<string | null>(null);
  const previousTasksRef = useRef<Record<string, Task>>({});
  const backgroundCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track overdue reminder counts per task (max 3 per day for high priority)
  const overdueReminderCountsRef = useRef<Record<string, number>>({});
  const lastSmartScheduleRef = useRef<string | null>(null);

  // Cancel all notifications for a specific task
  const cancelTaskNotifications = useCallback(async (taskId: string) => {
    const storedIds = getStoredNotificationIds();
    const notificationIds = storedIds[taskId] || [];
    
    for (const id of notificationIds) {
      await cancelNotification(id);
    }
    
    removeStoredNotificationIds(taskId);
    scheduledTaskIdsRef.current.delete(taskId);
    
    console.log(`Cancelled ${notificationIds.length} notifications for task ${taskId}`);
  }, [cancelNotification]);

  // Schedule notifications for a single task (used for dynamic rescheduling)
  const scheduleTaskNotifications = useCallback(async (task: Task): Promise<number[]> => {
    if (!profile || !hasPermission || !enabled) return [];
    
    const preferences = getUserPreferences();
    
    const schedule = calculateNotificationSchedule(
      task,
      {
        work_hours_start: profile.work_hours_start,
        work_hours_end: profile.work_hours_end,
      },
      overdueReminderCountsRef.current[task.id] || 0,
      preferences
    );

    if (schedule.notifications.length === 0) return [];

    const scheduledIds: number[] = [];

    for (const notif of schedule.notifications) {
      const id = await scheduleNotification({
        title: notif.content.title,
        body: notif.content.body,
        scheduleAt: notif.time,
        type: notif.type as any,
        data: {
          type: 'task-reminder',
          taskId: task.id,
          notificationType: notif.type,
          urgencyLevel: notif.content.urgencyLevel,
        },
      });

      if (id !== null) {
        scheduledIds.push(id);
      }
    }

    // Store notification IDs for this task
    storeNotificationIds(task.id, scheduledIds);
    scheduledTaskIdsRef.current.add(task.id);

    console.log(`Scheduled ${scheduledIds.length} notifications for task "${task.title}"`);
    return scheduledIds;
  }, [profile, hasPermission, enabled, scheduleNotification]);

  // Reschedule notifications when task properties change
  const rescheduleTaskNotifications = useCallback(async (task: Task) => {
    // Cancel existing notifications for this task
    await cancelTaskNotifications(task.id);
    
    // If task is completed, don't reschedule
    if (task.status === 'completed') {
      console.log(`Task "${task.title}" completed, notifications cancelled`);
      return;
    }
    
    // Schedule new notifications
    await scheduleTaskNotifications(task);
  }, [cancelTaskNotifications, scheduleTaskNotifications]);

  // Schedule check-in reminders based on profile settings
  const scheduleCheckInReminders = useCallback(async () => {
    if (!profile || !enabled || !hasPermission) return;

    const scheduleKey = `${profile.work_hours_start}-${profile.work_hours_end}-${profile.check_in_frequency}`;
    if (lastCheckInScheduleRef.current === scheduleKey) return;

    // Cancel existing check-in notifications
    await cancelNotificationsByType('check-in');

    const now = new Date();
    const [startHour, startMin] = profile.work_hours_start.split(':').map(Number);
    const [endHour, endMin] = profile.work_hours_end.split(':').map(Number);

    const workStart = new Date(now);
    workStart.setHours(startHour, startMin, 0, 0);

    const workEnd = new Date(now);
    workEnd.setHours(endHour, endMin, 0, 0);

    // Calculate interval between check-ins
    const workDurationMs = workEnd.getTime() - workStart.getTime();
    const intervalMs = workDurationMs / profile.check_in_frequency;

    const notifications: Omit<ScheduledNotification, 'id'>[] = [];

    // Schedule for next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayStart = new Date(workStart);
      dayStart.setDate(dayStart.getDate() + dayOffset);

      for (let i = 0; i < profile.check_in_frequency; i++) {
        const checkInTime = new Date(dayStart.getTime() + intervalMs * i);
        
        // Skip past times
        if (checkInTime <= now) continue;

        notifications.push({
          title: "Time for a check-in! ✨",
          body: "How's your energy and mood right now?",
          scheduleAt: checkInTime,
          type: 'check-in',
          data: { type: 'check-in' },
        });
      }
    }

    await scheduleMultipleNotifications(notifications);
    lastCheckInScheduleRef.current = scheduleKey;
    
    console.log(`Scheduled ${notifications.length} check-in reminders`);
  }, [profile, enabled, hasPermission, cancelNotificationsByType, scheduleMultipleNotifications]);

  // Schedule task reminders using the smart notification decision engine
  const scheduleSmartTaskNotifications = useCallback(async () => {
    if (!enabled || !hasPermission || !profile) return;

    // Create a schedule key to prevent duplicate scheduling
    const scheduleKey = tasks
      .filter(t => t.status !== 'completed')
      .map(t => `${t.id}-${t.due_date}-${t.priority}-${t.status}`)
      .join('|');
    
    if (lastSmartScheduleRef.current === scheduleKey) return;

    // Cancel existing task notifications by type
    await cancelNotificationsByType('task-reminder');
    await cancelNotificationsByType('advance-notice');
    await cancelNotificationsByType('overdue');
    await cancelNotificationsByType('final-reminder');

    const preferences = getUserPreferences();

    // Calculate notification schedules for all tasks
    const schedules = calculateAllNotificationSchedules(
      tasks,
      {
        work_hours_start: profile.work_hours_start,
        work_hours_end: profile.work_hours_end,
      },
      overdueReminderCountsRef.current,
      preferences
    );

    const summary = getNotificationSummary(schedules);
    console.log(`Smart notifications summary:`, summary);

    const allNotifications: Omit<ScheduledNotification, 'id'>[] = [];

    for (const schedule of schedules) {
      const notificationIds: number[] = [];
      
      for (const notif of schedule.notifications) {
        // Skip if already scheduled this exact notification
        const notifKey = `${schedule.taskId}-${notif.type}-${notif.time.getTime()}`;
        if (scheduledTaskIdsRef.current.has(notifKey)) {
          continue;
        }

        // Track overdue reminder count
        if (notif.type === 'overdue') {
          overdueReminderCountsRef.current[schedule.taskId] = 
            (overdueReminderCountsRef.current[schedule.taskId] || 0) + 1;
        }

        allNotifications.push({
          title: notif.content.title,
          body: notif.content.body,
          scheduleAt: notif.time,
          type: notif.type as any,
          data: { 
            type: 'task-reminder', 
            taskId: schedule.taskId,
            notificationType: notif.type,
            urgencyLevel: notif.content.urgencyLevel,
          },
        });

        scheduledTaskIdsRef.current.add(notifKey);
      }
    }

    // Schedule all notifications at once
    if (allNotifications.length > 0) {
      await scheduleMultipleNotifications(allNotifications);
      console.log(`Scheduled ${allNotifications.length} smart task notifications`);
    }

    lastSmartScheduleRef.current = scheduleKey;
  }, [tasks, profile, enabled, hasPermission, cancelNotificationsByType, scheduleMultipleNotifications]);

  // Legacy function for backward compatibility
  const scheduleTaskReminders = useCallback(async () => {
    await scheduleSmartTaskNotifications();
  }, [scheduleSmartTaskNotifications]);

  // Cancel notification for a specific task (when completed or rescheduled)
  const cancelTaskReminder = useCallback(async (taskId: string) => {
    await cancelTaskNotifications(taskId);
  }, [cancelTaskNotifications]);

  // Schedule daily AI recommendation notification
  const scheduleDailyAINotification = useCallback(async () => {
    if (!enabled || !hasPermission) return;

    const today = new Date().toDateString();
    if (dailyNotificationScheduledRef.current === today) return;

    // Cancel existing AI notifications
    await cancelNotificationsByType('ai-recommendation');

    const now = new Date();
    const notificationTime = new Date(now);
    
    // Schedule for 8 AM if not past, otherwise schedule for tomorrow
    notificationTime.setHours(8, 0, 0, 0);
    if (notificationTime <= now) {
      notificationTime.setDate(notificationTime.getDate() + 1);
    }

    // Check if there are uncompleted tasks
    const uncompletedTasks = tasks.filter(t => t.status !== 'completed');
    if (uncompletedTasks.length === 0) {
      console.log("No uncompleted tasks, skipping AI notification");
      return;
    }

    await scheduleNotification({
      title: "Your Daily Task Recommendations 🎯",
      body: `We've prepared ${Math.min(uncompletedTasks.length, 5)} tasks matched to your energy levels`,
      scheduleAt: notificationTime,
      type: 'ai-recommendation',
      data: { type: 'ai-recommendation' },
    });

    dailyNotificationScheduledRef.current = today;
    console.log("Scheduled daily AI recommendation notification");
  }, [enabled, hasPermission, tasks, cancelNotificationsByType, scheduleNotification]);

  // Schedule overdue task alerts
  const scheduleOverdueAlerts = useCallback(async () => {
    if (!enabled || !hasPermission) return;

    // Cancel existing overdue notifications
    await cancelNotificationsByType('overdue-alert');

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Check for overdue tasks
    const overdueTasks = tasks.filter(task => {
      if (task.status === 'completed' || !task.due_date) return false;
      const dueDate = new Date(task.due_date);
      const dueDateStart = new Date(dueDate);
      dueDateStart.setHours(0, 0, 0, 0);
      return dueDateStart < todayStart;
    });

    if (overdueTasks.length === 0) return;

    // Count high priority overdue
    const highPriorityCount = overdueTasks.filter(t => t.priority === 'high').length;

    // Schedule for 9 AM
    const notificationTime = new Date(now);
    notificationTime.setHours(9, 0, 0, 0);
    if (notificationTime <= now) {
      notificationTime.setDate(notificationTime.getDate() + 1);
    }

    const body = highPriorityCount > 0
      ? `You have ${highPriorityCount} overdue high-priority task${highPriorityCount > 1 ? 's' : ''}`
      : `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`;

    await scheduleNotification({
      title: `⚠️ ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} need attention`,
      body,
      scheduleAt: notificationTime,
      type: 'overdue-alert',
      data: { type: 'overdue-alert' },
    });

    console.log("Scheduled overdue alert notification");
  }, [enabled, hasPermission, tasks, cancelNotificationsByType, scheduleNotification]);

  // Schedule smart task reminders from AI recommendations
  const scheduleSmartTaskReminders = useCallback(async (recommendations: RecommendedTask[]) => {
    if (!enabled || !hasPermission || !settings.smartTaskReminders) return;

    const now = new Date();
    const today = now.toDateString();
    const leadTimeMinutes = settings.reminderLeadTime;

    // Get already dismissed smart reminders for today
    const dismissedKey = `dismissedSmartReminders-${today}`;
    const dismissed = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]'));

    const scheduledIds: number[] = [];

    for (const rec of recommendations.slice(0, 5)) {
      // Skip if already dismissed today
      if (dismissed.has(rec.taskId)) continue;

      // Parse suggested time (e.g., "10:00 AM - 12:00 PM" or "10:00 AM")
      const timeMatch = rec.suggestedTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (!timeMatch) continue;

      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toUpperCase();

      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      const suggestedDate = new Date(rec.suggestedDate || today);
      suggestedDate.setHours(hour, minute, 0, 0);

      // Only schedule for today
      if (suggestedDate.toDateString() !== today) continue;

      // Calculate reminder time (before suggested time)
      const reminderTime = new Date(suggestedDate.getTime() - leadTimeMinutes * 60 * 1000);

      // Skip past times
      if (reminderTime <= now) continue;

      // Truncate reasoning for notification body
      const reasoning = rec.reasoning.length > 60 
        ? rec.reasoning.substring(0, 57) + '...' 
        : rec.reasoning;

      const id = await scheduleNotification({
        title: `🎯 Recommended Now: ${rec.title}`,
        body: `${rec.suggestedTime} • ${reasoning}`,
        scheduleAt: reminderTime,
        type: 'smart-task',
        data: { 
          type: 'smart-task', 
          taskId: rec.taskId,
          suggestedTime: rec.suggestedTime,
        },
      });

      if (id) scheduledIds.push(id);
    }

    console.log(`Scheduled ${scheduledIds.length} smart task reminders`);
    return scheduledIds;
  }, [enabled, hasPermission, settings.smartTaskReminders, settings.reminderLeadTime, scheduleNotification]);

  // Dismiss a smart reminder (won't re-notify today)
  const dismissSmartReminder = useCallback((taskId: string) => {
    const today = new Date().toDateString();
    const dismissedKey = `dismissedSmartReminders-${today}`;
    const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
    dismissed.push(taskId);
    localStorage.setItem(dismissedKey, JSON.stringify(dismissed));
  }, []);

  // Background check service: Runs hourly to review and reschedule notifications
  const runBackgroundCheck = useCallback(async () => {
    if (!enabled || !hasPermission || !profile) return;

    console.log("Running background notification check...");
    
    // Reset overdue counts at midnight
    const now = new Date();
    const lastResetKey = 'overdueCountsLastReset';
    const lastReset = localStorage.getItem(lastResetKey);
    const today = now.toDateString();
    
    if (lastReset !== today) {
      overdueReminderCountsRef.current = {};
      localStorage.setItem(lastResetKey, today);
      console.log("Reset overdue reminder counts for new day");
    }

    // Force reschedule all task notifications
    lastSmartScheduleRef.current = null;
    await scheduleSmartTaskNotifications();
    await scheduleOverdueAlerts();
    
    console.log("Background check completed");
  }, [enabled, hasPermission, profile, scheduleSmartTaskNotifications, scheduleOverdueAlerts]);

  // Watch for task changes and reschedule notifications dynamically
  useEffect(() => {
    if (!enabled || !hasPermission || !profile) return;

    // Check each task for changes
    for (const task of tasks) {
      const previousTask = previousTasksRef.current[task.id];
      
      if (hasScheduleChanged(previousTask, task)) {
        // Task properties changed, reschedule
        rescheduleTaskNotifications(task);
      }
    }

    // Check for deleted tasks (tasks that were in previous but not in current)
    const currentTaskIds = new Set(tasks.map(t => t.id));
    for (const taskId of Object.keys(previousTasksRef.current)) {
      if (!currentTaskIds.has(taskId)) {
        // Task was deleted, cancel its notifications
        cancelTaskNotifications(taskId);
      }
    }

    // Update previous tasks reference
    previousTasksRef.current = tasks.reduce((acc, task) => {
      acc[task.id] = task;
      return acc;
    }, {} as Record<string, Task>);
  }, [tasks, enabled, hasPermission, profile, rescheduleTaskNotifications, cancelTaskNotifications]);

  // Set up background check interval (every hour)
  useEffect(() => {
    if (!enabled || !hasPermission) return;

    // Run initial check
    runBackgroundCheck();

    // Set up hourly interval
    backgroundCheckIntervalRef.current = setInterval(() => {
      runBackgroundCheck();
    }, 60 * 60 * 1000); // 1 hour

    return () => {
      if (backgroundCheckIntervalRef.current) {
        clearInterval(backgroundCheckIntervalRef.current);
      }
    };
  }, [enabled, hasPermission, runBackgroundCheck]);

  // Initialize and reschedule on app startup
  useEffect(() => {
    if (!enabled || !hasPermission) return;

    const initializeNotifications = async () => {
      console.log("Initializing notification scheduler...");
      await refreshPendingNotifications();
      await scheduleCheckInReminders();
      await scheduleTaskReminders();
      await scheduleDailyAINotification();
      await scheduleOverdueAlerts();
    };

    initializeNotifications();
  }, [
    enabled, 
    hasPermission, 
    refreshPendingNotifications,
    scheduleCheckInReminders, 
    scheduleTaskReminders, 
    scheduleDailyAINotification,
    scheduleOverdueAlerts,
  ]);

  // Reschedule check-ins when profile changes
  useEffect(() => {
    if (profile && enabled && hasPermission) {
      scheduleCheckInReminders();
    }
  }, [profile, enabled, hasPermission, scheduleCheckInReminders]);

  return {
    scheduleCheckInReminders,
    scheduleTaskReminders,
    scheduleSmartTaskNotifications,
    scheduleDailyAINotification,
    scheduleOverdueAlerts,
    scheduleSmartTaskReminders,
    cancelTaskReminder,
    rescheduleTaskNotifications,
    dismissSmartReminder,
    refreshPendingNotifications,
    runBackgroundCheck,
    // Export the decision engine functions for external use
    calculateScheduleForTask: (task: Task) => 
      profile ? calculateNotificationSchedule(task, {
        work_hours_start: profile.work_hours_start,
        work_hours_end: profile.work_hours_end,
      }, 0, getUserPreferences()) : null,
    getNotificationSummary: () => 
      profile ? getNotificationSummary(calculateAllNotificationSchedules(tasks, {
        work_hours_start: profile.work_hours_start,
        work_hours_end: profile.work_hours_end,
      }, {}, getUserPreferences())) : null,
  };
};
