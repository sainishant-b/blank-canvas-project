import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Sparkles,
  Clock,
  Check,
  CheckCheck,
  Loader2,
  FileText,
  CalendarClock,
  X,
} from "lucide-react";

interface AISuggestedSubtask {
  title: string;
  estimated_duration: number;
  order: number;
  approved: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  subtasks?: AISuggestedSubtask[];
  suggested_description?: string;
  timeline_summary?: string;
  estimated_total_minutes?: number;
  needs_clarification?: boolean;
}

interface AITaskAssistantProps {
  taskTitle: string;
  taskDescription: string;
  taskCategory: string;
  taskPriority: string;
  onApplySubtasks: (subtasks: { title: string; estimated_duration: number }[]) => void;
  onApplyDescription: (description: string) => void;
  onApplyTimeline: (estimatedMinutes: number) => void;
  onClose: () => void;
}

const AITaskAssistant = ({
  taskTitle,
  taskDescription,
  taskCategory,
  taskPriority,
  onApplySubtasks,
  onApplyDescription,
  onApplyTimeline,
  onClose,
}: AITaskAssistantProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<AISuggestedSubtask[]>([]);
  const [suggestedDescription, setSuggestedDescription] = useState<string | null>(null);
  const [timelineSummary, setTimelineSummary] = useState<string | null>(null);
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null);
  const [subtasksApplied, setSubtasksApplied] = useState(false);
  const [descriptionApplied, setDescriptionApplied] = useState(false);
  const [timelineApplied, setTimelineApplied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      // Scroll the viewport inside ScrollArea
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // Auto-trigger AI when opened with a task title
  useEffect(() => {
    if (taskTitle.trim() && !hasInitialized) {
      setHasInitialized(true);
      fetchAISuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskTitle, hasInitialized]);

  const fetchAISuggestions = async (userMessage?: string) => {
    setIsLoading(true);

    try {
      const conversationHistory = userMessage
        ? [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: userMessage },
          ]
        : undefined;

      if (userMessage) {
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      }

      const { data, error } = await supabase.functions.invoke("ai-task-assistant", {
        body: {
          taskTitle,
          taskDescription,
          taskCategory,
          taskPriority,
          conversationHistory,
        },
      });

      if (error) {
        console.error("Supabase function error:", error, "context:", (error as Record<string, unknown>)?.context);
        // Try to get a meaningful message from the error
        const errMsg = error.message || String(error);
        throw new Error(errMsg);
      }

      if (!data) {
        throw new Error("No response from AI assistant");
      }

      // Parse data if it's a string
      const parsed = typeof data === "string" ? JSON.parse(data) : data;

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      // Build assistant message
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: parsed.message || "Here are my suggestions for your task.",
        subtasks: parsed.subtasks?.map((s: Record<string, unknown>) => ({ ...s, approved: true })),
        suggested_description: parsed.suggested_description,
        timeline_summary: parsed.timeline_summary,
        estimated_total_minutes: parsed.estimated_total_minutes,
        needs_clarification: parsed.needs_clarification,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update state with latest suggestions
      if (parsed.subtasks?.length > 0) {
        setSuggestedSubtasks(parsed.subtasks.map((s: Record<string, unknown>) => ({ ...s, approved: true } as AISuggestedSubtask)));
        setSubtasksApplied(false);
      }
      if (parsed.suggested_description && !taskDescription) {
        setSuggestedDescription(parsed.suggested_description);
        setDescriptionApplied(false);
      }
      if (parsed.timeline_summary) {
        setTimelineSummary(parsed.timeline_summary);
        setTimelineApplied(false);
      }
      if (parsed.estimated_total_minutes) {
        setEstimatedTotal(parsed.estimated_total_minutes);
      }
    } catch (err: unknown) {
      console.error("AI assistant error:", err);
      let errorMsg = "Sorry, I ran into an issue. Please try again.";
      if (err instanceof Error) {
        const msg = err.message || "";
        if (msg.includes("Rate limit")) {
          errorMsg = "I'm a bit busy right now. Please try again in a moment.";
        } else if (msg.includes("LOVABLE_API_KEY")) {
          errorMsg = "AI service is not configured. Please set up the LOVABLE_API_KEY in Supabase secrets.";
        } else if (msg.includes("404") || msg.includes("not found") || msg.includes("FunctionsHttpError")) {
          errorMsg = "AI assistant function not deployed yet. Please deploy the 'ai-task-assistant' edge function to Supabase.";
        } else if (msg.includes("AI API error")) {
          errorMsg = "AI service is temporarily unavailable. Please try again later.";
        } else {
          errorMsg = `Error: ${msg}`;
        }
      }
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;
    setInputValue("");
    fetchAISuggestions(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleSubtask = (index: number) => {
    setSuggestedSubtasks((prev) =>
      prev.map((s, i) => (i === index ? { ...s, approved: !s.approved } : s))
    );
    setSubtasksApplied(false);
  };

  const handleApplySubtasks = () => {
    const approved = suggestedSubtasks.filter((s) => s.approved);
    if (approved.length === 0) {
      toast.error("Select at least one subtask to add");
      return;
    }
    onApplySubtasks(
      approved.map((s) => ({
        title: s.title,
        estimated_duration: s.estimated_duration,
      }))
    );
    setSubtasksApplied(true);
    toast.success(`${approved.length} subtask${approved.length > 1 ? "s" : ""} will be added`);
  };

  const handleApplyDescription = () => {
    if (suggestedDescription) {
      onApplyDescription(suggestedDescription);
      setDescriptionApplied(true);
      toast.success("Description applied");
    }
  };

  const handleApplyTimeline = () => {
    if (estimatedTotal) {
      onApplyTimeline(estimatedTotal);
      setTimelineApplied(true);
      toast.success("Timeline applied");
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="flex flex-col border rounded-lg bg-background/95 backdrop-blur overflow-hidden h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-purple-500/10 to-blue-500/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-500/20">
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">AI Task Assistant</h4>
            <p className="text-[10px] text-muted-foreground">Helps plan subtasks & timeline</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3" ref={scrollRef}>
        <div className="py-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-6">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {taskTitle
                  ? "Getting AI suggestions..."
                  : "Enter a task title to get AI-powered subtask suggestions"}
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={`${msg.role}-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-[10px] font-medium text-purple-400">AI Assistant</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggestions Panel */}
      {(suggestedSubtasks.length > 0 || suggestedDescription || timelineSummary) && (
        <div className="border-t px-3 py-2 space-y-2 max-h-[200px] overflow-y-auto bg-muted/30">
          {/* Subtasks */}
          {suggestedSubtasks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1">
                  <Check className="h-3 w-3" /> Suggested Subtasks
                </span>
                <Button
                  size="sm"
                  variant={subtasksApplied ? "secondary" : "default"}
                  className="h-6 text-[10px] px-2"
                  onClick={handleApplySubtasks}
                  disabled={subtasksApplied}
                >
                  {subtasksApplied ? (
                    <>
                      <CheckCheck className="h-3 w-3 mr-1" /> Added
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Add Selected
                    </>
                  )}
                </Button>
              </div>
              {suggestedSubtasks.map((subtask, idx) => (
                <div
                  key={`subtask-${subtask.order}-${subtask.title}`}
                  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={subtask.approved}
                    onCheckedChange={() => toggleSubtask(idx)}
                    className="h-4 w-4"
                  />
                  <span className={`flex-1 text-xs ${subtask.approved ? "" : "text-muted-foreground line-through"}`}>
                    {subtask.order}. {subtask.title}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    {formatDuration(subtask.estimated_duration)}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Suggested Description */}
          {suggestedDescription && !descriptionApplied && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Suggested Description
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2"
                  onClick={handleApplyDescription}
                >
                  <Check className="h-3 w-3 mr-1" /> Use This
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 leading-relaxed">
                {suggestedDescription}
              </p>
            </div>
          )}

          {/* Timeline */}
          {timelineSummary && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Timeline
                  {!!estimatedTotal && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">
                      ~{formatDuration(estimatedTotal)}
                    </Badge>
                  )}
                </span>
                {!!estimatedTotal && !timelineApplied && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={handleApplyTimeline}
                  >
                    <Check className="h-3 w-3 mr-1" /> Apply Duration
                  </Button>
                )}
                {timelineApplied && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <CheckCheck className="h-3 w-3 mr-1" /> Applied
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 leading-relaxed">
                {timelineSummary}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              messages.length === 0
                ? "Ask AI to help plan your task..."
                : "Ask for changes or more details..."
            }
            className="h-8 text-sm"
            disabled={isLoading || !taskTitle.trim()}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim() || !taskTitle.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AITaskAssistant;
