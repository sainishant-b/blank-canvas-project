import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getNotificationSender } from "@/hooks/useNotifications";

interface Profile {
  work_hours_start: string;
  work_hours_end: string;
  check_in_frequency: number;
  timezone: string;
}

export const useCheckInScheduler = (profile: Profile | null, onCheckInDue: () => void) => {
  const [nextCheckIn, setNextCheckIn] = useState<Date | null>(null);
  const [isWorkHours, setIsWorkHours] = useState(false);
  const lastNotificationTime = useRef<number>(0);

  const calculateCheckInTimes = useCallback((profile: Profile): { times: Date[]; inWorkHours: boolean } => {
    if (!profile) return { times: [], inWorkHours: false };

    const now = new Date();
    const [startHour, startMin] = profile.work_hours_start.split(':').map(Number);
    const [endHour, endMin] = profile.work_hours_end.split(':').map(Number);

    const workStart = new Date(now);
    workStart.setHours(startHour, startMin, 0, 0);

    const workEnd = new Date(now);
    workEnd.setHours(endHour, endMin, 0, 0);

    // Check if currently in work hours
    const inWorkHours = now >= workStart && now <= workEnd;

    if (!inWorkHours) return { times: [], inWorkHours };

    // Calculate interval between check-ins
    const workDurationMs = workEnd.getTime() - workStart.getTime();
    const intervalMs = workDurationMs / profile.check_in_frequency;

    // Generate check-in times
    const times: Date[] = [];
    for (let i = 0; i < profile.check_in_frequency; i++) {
      const checkInTime = new Date(workStart.getTime() + intervalMs * i);
      if (checkInTime > now) {
        times.push(checkInTime);
      }
    }

    return { times, inWorkHours };
  }, []);

  const getLastCheckInToday = useCallback(async (userId: string): Promise<Date | null> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("check_ins")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    return data && data.length > 0 ? new Date(data[0].created_at) : null;
  }, []);

  useEffect(() => {
    if (!profile) return;

    const checkSchedule = async () => {
      const { times, inWorkHours } = calculateCheckInTimes(profile);
      setIsWorkHours(inWorkHours);
      
      if (times.length === 0) {
        setNextCheckIn(null);
        return;
      }

      const nextTime = times[0];
      setNextCheckIn(nextTime);

      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if we need to trigger a check-in
      const lastCheckIn = await getLastCheckInToday(user.id);
      const now = new Date();
      
      // Calculate time since last check-in
      const minInterval = (1000 * 60 * 60) / profile.check_in_frequency; // Minimum time between check-ins
      
      if (!lastCheckIn || (now.getTime() - lastCheckIn.getTime() > minInterval)) {
        // Check if next check-in time has passed
        if (now >= nextTime) {
          // Send push notification (throttled to prevent spam)
          const timeSinceLastNotification = now.getTime() - lastNotificationTime.current;
          if (timeSinceLastNotification > 60000) { // At least 1 minute between notifications
            lastNotificationTime.current = now.getTime();
            
            const notificationSender = getNotificationSender();
            if (notificationSender) {
              notificationSender.sendNotification({
                title: "Time for a check-in! ✨",
                body: "How's your progress going? Take a moment to reflect.",
                tag: "check-in-reminder",
                data: { type: "check-in" },
                actions: [
                  { action: "checkin", title: "Check-in Now" },
                  { action: "dismiss", title: "Later" }
                ],
                requireInteraction: true,
              });
            }
          }
          
          onCheckInDue();
        }
      }
    };

    checkSchedule();

    // Check every minute
    const interval = setInterval(checkSchedule, 60000);

    return () => clearInterval(interval);
  }, [profile, calculateCheckInTimes, getLastCheckInToday, onCheckInDue]);

  const formatNextCheckIn = (): string => {
    if (!nextCheckIn) return "No check-ins scheduled";
    
    const now = new Date();
    const diff = nextCheckIn.getTime() - now.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);

    if (minutes < 0) return "Check-in due now!";
    if (hours > 0) return `Next check-in in ${hours}h ${minutes % 60}m`;
    return `Next check-in in ${minutes}m`;
  };

  return {
    nextCheckIn,
    isWorkHours,
    formatNextCheckIn,
  };
};
