import { useState, useRef, useEffect } from "react";
import { format, parse, setHours, setMinutes } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateTimePickerProps {
  value?: string; // ISO datetime-local string e.g. "2026-02-17T14:30"
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;

function ScrollColumn({
  items,
  selected,
  onSelect,
  formatItem,
}: {
  items: (number | string)[];
  selected: number | string;
  onSelect: (val: number | string) => void;
  formatItem?: (val: number | string) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number | string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const el = itemRefs.current.get(selected);
    if (el && containerRef.current) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selected]);

  return (
    <div
      ref={containerRef}
      className="h-[200px] overflow-y-auto scrollbar-thin flex flex-col items-center gap-0.5 snap-y snap-mandatory"
    >
      {items.map((item) => (
        <button
          key={item}
          ref={(el) => {
            if (el) itemRefs.current.set(item, el);
          }}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            "w-full min-w-[48px] py-2 text-center text-sm rounded-md snap-center transition-colors",
            item === selected
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {formatItem ? formatItem(item) : String(item).padStart(2, "0")}
        </button>
      ))}
    </div>
  );
}

export function DateTimePicker({ value, onChange, placeholder = "Pick date & time" }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  // Parse existing value
  const dateValue = value ? new Date(value) : undefined;

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(dateValue);
  const [hour, setHour] = useState(() => {
    if (!dateValue) return 12;
    const h = dateValue.getHours() % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState(() => dateValue ? dateValue.getMinutes() : 0);
  const [period, setPeriod] = useState<"AM" | "PM">(() => {
    if (!dateValue) return "PM";
    return dateValue.getHours() >= 12 ? "PM" : "AM";
  });

  // Sync when value prop changes
  useEffect(() => {
    const d = value ? new Date(value) : undefined;
    setSelectedDate(d);
    if (d) {
      const h = d.getHours() % 12;
      setHour(h === 0 ? 12 : h);
      setMinute(d.getMinutes());
      setPeriod(d.getHours() >= 12 ? "PM" : "AM");
    }
  }, [value]);

  const buildDateTimeString = (date: Date | undefined, h: number, m: number, p: "AM" | "PM") => {
    if (!date) return undefined;
    let hours24 = h % 12;
    if (p === "PM") hours24 += 12;
    const d = setMinutes(setHours(new Date(date), hours24), m);
    // Format as datetime-local string
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    onChange(buildDateTimeString(date, hour, minute, period));
  };

  const handleTimeChange = (h: number, m: number, p: "AM" | "PM") => {
    setHour(h);
    setMinute(m);
    setPeriod(p);
    if (selectedDate) {
      onChange(buildDateTimeString(selectedDate, h, m, p));
    }
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateValue
              ? format(dateValue, "MMM d, yyyy · h:mm a")
              : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
          <div className="flex flex-col sm:flex-row">
            {/* Calendar */}
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />

            {/* Time Picker */}
            <div className="border-t sm:border-t-0 sm:border-l p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground text-center">Time</p>
              <div className="flex gap-1">
                <ScrollColumn
                  items={HOURS}
                  selected={hour}
                  onSelect={(v) => handleTimeChange(v as number, minute, period)}
                />
                <ScrollColumn
                  items={MINUTES}
                  selected={minute}
                  onSelect={(v) => handleTimeChange(hour, v as number, period)}
                />
                <ScrollColumn
                  items={[...PERIODS]}
                  selected={period}
                  onSelect={(v) => handleTimeChange(hour, minute, v as "AM" | "PM")}
                  formatItem={(v) => String(v)}
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            setSelectedDate(undefined);
            onChange(undefined);
          }}
          title="Clear date"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
