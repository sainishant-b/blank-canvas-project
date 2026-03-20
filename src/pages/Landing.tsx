import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DottedSurface } from "@/components/ui/dotted-surface";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Crosshair,
  Timer,
  Brain,
  Target,
  ArrowRight,
  CheckCircle2,
  Zap,
  Shield,
  BarChart3,
  ChevronDown,
  Eye,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import featureFocus from "@/assets/feature-focus.jpg";
import featureTimer from "@/assets/feature-timer.jpg";
import featurePriority from "@/assets/feature-priority.jpg";
import featureGoals from "@/assets/feature-goals.jpg";
import featureInsights from "@/assets/feature-insights.jpg";
import featureDistractionFree from "@/assets/feature-distraction-free.jpg";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Section */}
      <HeroSection onGetStarted={() => navigate("/auth")} />

      {/* Features Section */}
      <FeaturesSection />

      {/* How It Works */}
      <HowItWorksSection />

      {/* CTA Section */}
      <CTASection onGetStarted={() => navigate("/auth")} />

      {/* Footer */}
      <Footer />
    </div>
  );
};

/* ─── Hero ─── */
function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <DottedSurface className="opacity-70" />

      {/* Subtle vignette for text readability */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(var(--background))_80%)] pointer-events-none z-[1]" />

      <div className="relative z-[2] flex flex-col items-center text-center px-4 sm:px-6 max-w-3xl mx-auto">
        <div
          className={`transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/80 backdrop-blur-sm text-xs font-medium text-muted-foreground mb-6 sm:mb-8">
            <Zap className="h-3 w-3 text-accent-orange" />
            Built for ADHD minds
          </div>
        </div>

        <h1
          className={`font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight mb-5 sm:mb-6 transition-all duration-700 delay-150 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ lineHeight: "1.05" }}
        >
          One task.
          <br />
          One button.
          <br />
          <span className="text-muted-foreground">Zero friction.</span>
        </h1>

        <p
          className={`text-muted-foreground text-base sm:text-lg md:text-xl max-w-lg mb-8 sm:mb-10 transition-all duration-700 delay-300 ease-out text-pretty ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          A focus-first productivity app that strips away the noise. See your most important task, start a timer, and get to work.
        </p>

        <div
          className={`flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto transition-all duration-700 delay-[450ms] ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Button
            onClick={onGetStarted}
            size="lg"
            className="h-14 px-8 text-base font-bold rounded-2xl shadow-[var(--shadow-lg)] active:scale-[0.97] transition-transform"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
            }
            className="h-14 px-8 text-base rounded-2xl active:scale-[0.97]"
          >
            See how it works
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[2] animate-bounce">
        <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
      </div>
    </section>
  );
}

/* ─── Features ─── */
const features = [
  {
    icon: Crosshair,
    title: "Focus Mode",
    description:
      "See only your single most important task. No lists, no overwhelm — just clarity.",
  },
  {
    icon: Timer,
    title: "Pomodoro Timer",
    description:
      "Built-in 25/5 focus sessions. Start with one tap and ride the momentum.",
  },
  {
    icon: Brain,
    title: "Smart Prioritization",
    description:
      "Automatically surfaces what matters based on deadlines, priority, and your energy.",
  },
  {
    icon: Target,
    title: "Goal Tracking",
    description:
      "Break big goals into milestones. Watch progress stack up over time.",
  },
  {
    icon: BarChart3,
    title: "Insights",
    description:
      "Track your streaks, completion rates, and focus patterns to build better habits.",
  },
  {
    icon: Shield,
    title: "Distraction-Free",
    description:
      "No social feeds, no badges spam. Designed to protect your attention, not steal it.",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <p className="text-accent-orange text-xs font-semibold tracking-widest uppercase mb-3 text-center">
            Features
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4">
            Everything you need, nothing you don't
          </h2>
          <p className="text-muted-foreground text-center max-w-md mx-auto mb-14 sm:mb-16 text-sm sm:text-base">
            Stripped to the essentials so you spend time doing, not organizing.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((f, i) => (
            <ScrollReveal key={f.title} delay={i * 80}>
              <div className="relative rounded-2xl border border-border bg-card p-5 sm:p-6 min-h-[10rem]">
                <GlowingEffect
                  spread={40}
                  glow
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={2}
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <h3 className="font-heading text-base font-semibold mb-1.5">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
const steps = [
  {
    num: "01",
    title: "Open the app",
    description: "Your highest priority task is already waiting front and center.",
  },
  {
    num: "02",
    title: "Press Start",
    description: "One button kicks off a Pomodoro focus session. No setup required.",
  },
  {
    num: "03",
    title: "Get it done",
    description: "Work through your task, take a break, repeat. Progress stacks automatically.",
  },
];

function HowItWorksSection() {
  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 bg-muted/40">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <p className="text-accent-blue text-xs font-semibold tracking-widest uppercase mb-3 text-center">
            How it works
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-14 sm:mb-16">
            Three steps to focus
          </h2>
        </ScrollReveal>

        <div className="space-y-8 sm:space-y-10">
          {steps.map((step, i) => (
            <ScrollReveal key={step.num} delay={i * 120}>
              <div className="flex gap-5 sm:gap-6 items-start">
                <span className="font-heading text-3xl sm:text-4xl font-black text-border shrink-0 leading-none pt-0.5">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-heading text-lg sm:text-xl font-semibold mb-1">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTASection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6">
      <ScrollReveal>
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            Ready to actually get things done?
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-8 max-w-md mx-auto">
            Stop planning. Start doing. Your first task is waiting.
          </p>
          <Button
            onClick={onGetStarted}
            size="lg"
            className="h-14 px-10 text-base font-bold rounded-2xl shadow-[var(--shadow-lg)] active:scale-[0.97] transition-transform"
          >
            Start Now — It's Free
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span className="font-heading font-semibold text-foreground text-sm">
          AI Productivity
        </span>
        <span>© {new Date().getFullYear()} All rights reserved.</span>
      </div>
    </footer>
  );
}

/* ─── Scroll Reveal Utility ─── */
function ScrollReveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="transition-all ease-out"
      style={{
        transitionDuration: "600ms",
        transitionDelay: `${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) blur(0)" : "translateY(16px)",
        filter: visible ? "blur(0px)" : "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}

export default Landing;
