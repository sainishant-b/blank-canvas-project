import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_PREFIX = "work_session_";
const POMODORO_SETTINGS_KEY = "pomodoro_settings";

export interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
}

export const getDefaultPomodoroSettings = (): PomodoroSettings => ({
  workMinutes: 25,
  breakMinutes: 5,
});

export const loadPomodoroSettings = (): PomodoroSettings => {
  try {
    const saved = localStorage.getItem(POMODORO_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return getDefaultPomodoroSettings();
};

export const savePomodoroSettings = (settings: PomodoroSettings) => {
  localStorage.setItem(POMODORO_SETTINGS_KEY, JSON.stringify(settings));
};

type SessionPhase = "work" | "break";

interface WorkSessionState {
  isWorking: boolean;
  startTime: string | null;
  phase: SessionPhase;
  phaseStartTime: string | null;
}

export const useWorkSessionTimer = (taskId: string | undefined) => {
  const [isWorking, setIsWorking] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("work");
  const [phaseStart, setPhaseStart] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(loadPomodoroSettings);

  const storageKey = taskId ? `${STORAGE_KEY_PREFIX}${taskId}` : null;

  const getPhaseDuration = useCallback((p: SessionPhase) => {
    return p === "work" ? pomodoroSettings.workMinutes * 60 : pomodoroSettings.breakMinutes * 60;
  }, [pomodoroSettings]);

  // Reload settings when they change externally
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === POMODORO_SETTINGS_KEY) {
        setPomodoroSettings(loadPomodoroSettings());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Load session state from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;

    const savedState = localStorage.getItem(storageKey);
    if (savedState) {
      try {
        const state: WorkSessionState = JSON.parse(savedState);
        if (state.isWorking && state.startTime) {
          setSessionStart(new Date(state.startTime));
          setPhase(state.phase || "work");
          setPhaseStart(state.phaseStartTime ? new Date(state.phaseStartTime) : new Date(state.startTime));
          setIsWorking(true);
        }
      } catch (e) {
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  // Update elapsed time and remaining countdown every second
  useEffect(() => {
    if (!isWorking || !sessionStart || !phaseStart) {
      setElapsedSeconds(0);
      setRemainingSeconds(0);
      return;
    }

    const updateTimers = () => {
      const now = new Date();
      const totalElapsed = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
      setElapsedSeconds(totalElapsed);

      const phaseElapsed = Math.floor((now.getTime() - phaseStart.getTime()) / 1000);
      const phaseDuration = getPhaseDuration(phase);
      const remaining = Math.max(0, phaseDuration - phaseElapsed);
      setRemainingSeconds(remaining);

      // Auto-switch phases when timer reaches 0
      if (remaining <= 0) {
        const newPhase: SessionPhase = phase === "work" ? "break" : "work";
        setPhase(newPhase);
        setPhaseStart(now);
      }
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [isWorking, sessionStart, phaseStart, phase, getPhaseDuration]);

  // Save state to localStorage
  useEffect(() => {
    if (!storageKey) return;

    if (isWorking && sessionStart) {
      const state: WorkSessionState = {
        isWorking: true,
        startTime: sessionStart.toISOString(),
        phase,
        phaseStartTime: phaseStart?.toISOString() || null,
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [isWorking, sessionStart, phase, phaseStart, storageKey]);

  const startSession = useCallback(() => {
    const now = new Date();
    const settings = loadPomodoroSettings();
    setPomodoroSettings(settings);
    setSessionStart(now);
    setPhaseStart(now);
    setPhase("work");
    setIsWorking(true);
  }, []);

  const endSession = useCallback(() => {
    setIsWorking(false);
    setSessionStart(null);
    setPhaseStart(null);
    setElapsedSeconds(0);
    setRemainingSeconds(0);
    setPhase("work");
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const skipPhase = useCallback(() => {
    const now = new Date();
    const newPhase: SessionPhase = phase === "work" ? "break" : "work";
    setPhase(newPhase);
    setPhaseStart(now);
  }, [phase]);

  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }, []);

  const formatTimeReadable = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes} min ${secs} sec`;
    }
    return `${secs} sec`;
  }, []);

  return {
    isWorking,
    sessionStart,
    elapsedSeconds,
    remainingSeconds,
    phase,
    pomodoroSettings,
    startSession,
    endSession,
    skipPhase,
    formatTime,
    formatTimeReadable,
  };
};
