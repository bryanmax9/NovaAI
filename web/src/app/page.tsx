"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Menu, X,
  Mic, Zap, Globe,
  Code2, Users, BookOpen, Layers, BrainCircuit, Building2,
} from "lucide-react";
import Image from "next/image";

/* ═══ CONSTANTS ═══════════════════════════════════════════════════════ */
const GOOGLE_FORM_URL = "https://forms.gle/LmAJE2G1B7EkpD2N9";
/* Monochrome palette — derived from the Nova logo: deep black + white energy */
const W   = "#ffffff";        /* pure white — primary accent */
const W90 = "rgba(255,255,255,0.9)";
const W55 = "rgba(255,255,255,0.55)";
const W45 = "rgba(255,255,255,0.45)";
const W30 = "rgba(255,255,255,0.3)";
const W15 = "rgba(255,255,255,0.15)";
const W08 = "rgba(255,255,255,0.08)";
const W05 = "rgba(255,255,255,0.05)";

const PILL_NAV_LINKS = ["Home", "Features", "Download", "Docs", "About"] as const;
const ROLES = ["Voice-first", "Intelligent", "Cross-platform"] as const;
const LOADING_WORDS = ["Build", "Automate", "Speak"] as const;

/* ═══ DATA ════════════════════════════════════════════════════════════ */
const stats = [
  { value: "94.2%",  label: "Command accuracy",  sub: "Measured across 10,000+ voice interactions in real prototype testing." },
  { value: "340ms",  label: "Response latency",   sub: "Median time from voice input to completed action in internal benchmarks." },
  { value: "$99/yr", label: "Pro plan pricing",   sub: "Built for mainstream adoption — not enterprise budgets." },
];

const features = [
  {
    icon: Mic,
    tag: "Core Technology",
    title: "Voice Intelligence",
    headline: "Speak naturally. Work instantly.",
    body: "Nova understands complex, multi-step commands and executes them in milliseconds — no training, no keyword triggers, no friction. Just talk the way you normally would.",
    bullets: ["Natural language command parsing", "Multi-step action chaining", "Context-aware follow-up"],
  },
  {
    icon: Zap,
    tag: "Automation",
    title: "Smart Workflows",
    headline: "One command. A hundred actions.",
    body: "Chain apps, files, and workflows into single voice triggers. Nova's automation engine handles the complexity of cross-application tasks so you never have to context-switch.",
    bullets: ["Cross-app workflow automation", "Custom macro creation", "Scheduled & triggered routines"],
  },
  {
    icon: Globe,
    tag: "Integration",
    title: "Universal Reach",
    headline: "Works with everything, everywhere.",
    body: "From your IDE to your inbox, from Windows to macOS, Nova integrates with every app on every platform without plugins, API keys, or configuration headaches.",
    bullets: ["Cross-platform compatibility", "Zero-setup app integration", "Works with legacy software"],
  },
];

const useCases = [
  { icon: BookOpen,     title: "Students & Researchers",  copy: "Open papers, switch tabs, draft notes, and cross-reference sources without losing your research momentum." },
  { icon: Code2,        title: "Developers & Builders",   copy: "Trigger builds, navigate codebases, and run workflow steps while keeping your hands on the keyboard." },
  { icon: Layers,       title: "Creators & Operators",    copy: "Manage tabs, notes, exports, and communication while your focus stays on the work that actually matters." },
  { icon: Users,        title: "Low-Mobility Users",      copy: "Full computer control through voice alone — reducing physical strain without sacrificing capability or speed." },
  { icon: BrainCircuit, title: "Busy Professionals",      copy: "Compress an hour of digital busywork into minutes with natural commands and intelligent task automation." },
  { icon: Building2,    title: "Teams & Institutions",    copy: "Standardize voice-driven workflows across entire organizations with scalable, cross-platform deployment." },
];

const commandExamples = [
  "Open Chrome, search Scholar for transformer attention mechanisms, and open the first 3 results.",
  "Switch to Slack, summarize unread messages, and draft a quick reply to the latest thread.",
  "Run morning setup: Spotify, calendar overview, project docs, and my dev workspace — one command.",
  "Go to Google Docs, start a new meeting notes template, and share it with my team.",
];

const TICKER_ITEMS = [
  "VOICE FIRST", "AI POWERED", "CROSS PLATFORM", "ZERO FRICTION",
  "BUILT FOR EVERYONE", "NOVA 2025", "SHIP FASTER", "SPEAK NATURALLY",
];

/* ═══ HOOKS ═══════════════════════════════════════════════════════════ */
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

/* ═══ LOADING SCREEN ═════════════════════════════════════════════════ */
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const called = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const duration = 2700;
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setCount(Math.round(progress * 100));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!called.current) {
        called.current = true;
        setTimeout(onComplete, 400);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  useEffect(() => {
    const id = setInterval(() => setWordIndex(i => (i + 1) % LOADING_WORDS.length), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ background: "#080808" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Top-left label */}
      <motion.p
        className="absolute top-6 left-6 text-xs uppercase tracking-[0.3em] font-inter"
        style={{ color: W30 }}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        Nova
      </motion.p>

      {/* Center rotating word */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={wordIndex}
            className="font-instrument"
            style={{ fontStyle: "italic", fontSize: "clamp(2.5rem, 8vw, 5rem)", color: W90 }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {LOADING_WORDS[wordIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Bottom-right counter */}
      <p className="absolute bottom-8 right-8 font-instrument tabular-nums select-none"
        style={{ fontSize: "clamp(4rem, 10vw, 8rem)", color: W90, lineHeight: 1 }}>
        {String(count).padStart(3, "0")}
      </p>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: W08 }}>
        <div
          className="h-full origin-left"
          style={{
            background: `linear-gradient(90deg, ${W30} 0%, ${W} 100%)`,
            transform: `scaleX(${count / 100})`,
            boxShadow: `0 0 8px ${W30}`,
            transition: "transform 50ms linear",
          }}
        />
      </div>
    </motion.div>
  );
}

/* ═══ SHARED COMPONENTS ═══════════════════════════════════════════════ */
function PrimaryButton({ href, children, large }: {
  href: string; children: React.ReactNode; large?: boolean;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full font-inter font-bold uppercase tracking-widest transition-all duration-200 hover:bg-opacity-85 hover:-translate-y-0.5 active:scale-95"
      style={{
        background: W,
        color: "#080808",
        fontSize: large ? 14 : 12,
        padding: large ? "15px 36px" : "11px 24px",
        boxShadow: `0 0 32px ${W15}, 0 4px 16px rgba(0,0,0,0.5)`,
      }}>
      {children}
    </a>
  );
}

function OutlineButton({ href, children, large }: {
  href: string; children: React.ReactNode; large?: boolean;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full font-inter font-semibold tracking-wide transition-all duration-200 hover:opacity-70 hover:-translate-y-0.5"
      style={{
        border: `1px solid ${W30}`,
        color: W,
        fontSize: large ? 14 : 13,
        padding: large ? "14px 32px" : "11px 24px",
      }}>
      {children}
    </a>
  );
}

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-10 lg:px-20 ${className}`}>{children}</div>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-plus-jakarta font-bold uppercase tracking-[0.2em] mb-4"
      style={{ fontSize: 11, color: W45 }}>
      {children}
    </p>
  );
}

function SectionHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-inter font-extrabold text-white leading-[1.05] ${className}`}
      style={{ fontSize: "clamp(2rem, 4.5vw, 3.8rem)", letterSpacing: "-0.025em" }}>
      {children}
    </h2>
  );
}

/* ═══ PAGE ════════════════════════════════════════════════════════════ */
export default function Home() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [mounted,   setMounted]   = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [scrollY,   setScrollY]   = useState(0);
  const [roleIndex, setRoleIndex] = useState(0);
  const gsapRan = useRef(false);

  // Early Access Download state
  const [dlRemaining, setDlRemaining] = useState<number | null>(null);
  const [dlClaiming,  setDlClaiming]  = useState<string | null>(null); // platform being claimed
  const [dlError,     setDlError]     = useState<string | null>(null);
  const dlRef = useRef<HTMLElement>(null);
  const [dlVis, setDlVis] = useState(false);

  /* Client-only — prevents SSR / browser-extension hydration mismatch on <video> */
  useEffect(() => setMounted(true), []);


  /* Scroll */
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Role cycling */
  useEffect(() => {
    if (isLoading) return;
    const id = setInterval(() => setRoleIndex(i => (i + 1) % ROLES.length), 2000);
    return () => clearInterval(id);
  }, [isLoading]);

  /* GSAP hero entrance */
  useEffect(() => {
    if (isLoading || gsapRan.current) return;
    gsapRan.current = true;
    import("gsap").then(({ gsap }) => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".name-reveal",
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 1.2, delay: 0.1 }
      ).fromTo(".blur-in",
        { opacity: 0, filter: "blur(10px)", y: 20 },
        { opacity: 1, filter: "blur(0px)", y: 0, duration: 1, stagger: 0.1 },
        "-=0.8"
      );
    });
  }, [isLoading]);

  /* Section refs */
  const [featRef, featVis] = useInView(0.08);
  const [statRef, statVis] = useInView(0.1);
  const [vidRef,  vidVis]  = useInView(0.08);
  const [ucRef,   ucVis]   = useInView(0.06);
  const [ctaRef,  ctaVis]  = useInView(0.12);

  // Fetch download slot count on mount
  useEffect(() => {
    fetch('/api/downloads')
      .then(r => r.json())
      .then(d => setDlRemaining(d.remaining ?? 5))
      .catch(() => setDlRemaining(5));
  }, []);

  // Intersection observer for download section
  useEffect(() => {
    if (!dlRef.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setDlVis(true); }, { threshold: 0.1 });
    io.observe(dlRef.current);
    return () => io.disconnect();
  }, [mounted]);

  async function claimDownload(platform: 'windows' | 'mac' | 'linux') {
    if (dlRemaining !== null && dlRemaining <= 0) return;
    setDlClaiming(platform);
    setDlError(null);
    try {
      const res  = await fetch('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
      const data = await res.json();
      if (!res.ok) { setDlError(data.error || 'Download unavailable.'); return; }
      setDlRemaining(data.remaining);
      window.open(data.url, '_blank');
    } catch {
      setDlError('Connection error. Please try again.');
    } finally {
      setDlClaiming(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#080808", color: "#fff" }}>

      {/* Loading screen */}
      <AnimatePresence>
        {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}
      </AnimatePresence>

      {/* ══ FLOATING PILL NAV ══════════════════════════════════════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 md:pt-6 px-4 pointer-events-none">
        <div
          className="pointer-events-auto inline-flex items-center rounded-full backdrop-blur-md border px-2 py-2 transition-all duration-300"
          style={{
            background: "rgba(10,10,10,0.9)",
            borderColor: W08,
            boxShadow: scrollY > 80 ? `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${W08}` : "none",
          }}
        >
          {/* Logo */}
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 transition-transform duration-200 hover:scale-110"
            style={{ border: `1.5px solid ${W30}`, boxShadow: `0 0 10px ${W08}` }}
          >
            <Image src="/NovaLogo.png" alt="Nova" width={36} height={36} className="w-full h-full object-cover" />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-5 mx-2" style={{ background: W08 }} />

          {/* Nav links */}
          <nav className="hidden sm:flex items-center">
            {PILL_NAV_LINKS.map((item, i) => (
              <a
                key={item}
                href="#"
                className="text-xs sm:text-sm rounded-full px-3 sm:px-4 py-1.5 sm:py-2 transition-all duration-150 font-inter"
                style={{
                  color: i === 0 ? W90 : W45,
                  background: i === 0 ? W08 : "transparent",
                }}
                onMouseEnter={e => {
                  if (i !== 0) { e.currentTarget.style.color = W90; e.currentTarget.style.background = W08; }
                }}
                onMouseLeave={e => {
                  if (i !== 0) { e.currentTarget.style.color = W45; e.currentTarget.style.background = "transparent"; }
                }}
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Divider */}
          <div className="hidden sm:block w-px h-5 mx-2" style={{ background: W08 }} />

          {/* CTA */}
          <a
            href={GOOGLE_FORM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 font-inter font-bold tracking-wide transition-all hover:opacity-80 hover:scale-105"
            style={{ background: W, color: "#080808" }}
          >
            Get Access <span className="ml-0.5 text-[10px]">↗</span>
          </a>

          {/* Mobile burger */}
          <button
            className="sm:hidden p-1.5 ml-1 rounded-full"
            style={{ color: W55 }}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>

      {/* Mobile overlay menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "rgba(8,8,8,0.97)", backdropFilter: "blur(16px)" }}>
          <div className="flex items-center justify-between px-5 py-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden" style={{ border: `1.5px solid ${W30}` }}>
                <Image src="/NovaLogo.png" alt="Nova" width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <span className="text-white font-bold text-xl font-inter">Nova</span>
            </div>
            <button className="p-2" style={{ color: W55 }}
              onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={24} />
            </button>
          </div>
          <nav className="flex flex-col flex-1 items-center justify-center gap-10 pb-24">
            {PILL_NAV_LINKS.map(item => (
              <a key={item} href="#"
                className="text-white font-bold text-3xl tracking-widest hover:opacity-50 transition-opacity font-inter"
                onClick={() => setMenuOpen(false)}>{item}
              </a>
            ))}
            <div className="mt-4">
              <PrimaryButton href={GOOGLE_FORM_URL} large>Get Early Access</PrimaryButton>
            </div>
          </nav>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section
        className="relative flex flex-col items-center justify-center overflow-hidden text-center"
        style={{ minHeight: "100svh" }}
      >
        {/* BG video — client-only, plays at 0.5× speed */}
        {mounted && (
          <video
            ref={videoRef}
            src="/hero.mp4"
            muted
            loop
            playsInline
            autoPlay
            onCanPlay={e => { e.currentTarget.playbackRate = 0.5; }}
            className="absolute left-1/2 top-1/2 min-w-full min-h-full object-cover pointer-events-none"
            style={{ opacity: 0.32, transform: "translate(-50%, -50%)" }}
          />
        )}

        {/* Overlays */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.3)" }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, #080808 0%, #080808 15%, rgba(8,8,8,0.8) 40%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to top, #080808, transparent)" }} />

        {/* Soft white ambient glow — mirrors the logo's center white burst */}
        <div className="absolute inset-x-0 top-0 pointer-events-none overflow-hidden" style={{ height: 400 }}>
          <svg width="100%" height="400" viewBox="0 0 1440 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <filter id="hglow3" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="42" />
              </filter>
              <radialGradient id="hg3" cx="50%" cy="30%" r="55%">
                <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.1" />
                <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="720" cy="100" rx="520" ry="130" fill="url(#hg3)" filter="url(#hglow3)" />
          </svg>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center px-5 sm:px-10 pb-24 pt-24 max-w-4xl mx-auto">

          <p className="blur-in text-xs uppercase tracking-[0.3em] mb-8 font-inter" style={{ color: W30 }}>
            Introducing Nova &rsquo;25
          </p>

          <h1
            className="name-reveal font-instrument leading-[0.9] tracking-tight text-white mb-6"
            style={{ fontStyle: "italic", fontSize: "clamp(72px, 14vw, 160px)" }}
          >
            Nova
          </h1>

          <p className="blur-in mb-5 font-inter" style={{ fontSize: "clamp(16px, 2vw, 22px)", color: W45 }}>
            The{" "}
            <span
              key={roleIndex}
              className="font-instrument animate-role-fade-in inline-block text-white"
              style={{ fontStyle: "italic" }}
            >
              {ROLES[roleIndex]}
            </span>
            {" "}AI assistant.
          </p>

          <p className="blur-in mb-12 max-w-md font-inter leading-relaxed" style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: W45 }}>
            Natural commands, intelligent automation, and instant execution —
            built for everyone who wants to stop fighting their machine and start
            working with it.
          </p>

          <div className="blur-in flex flex-wrap justify-center gap-4">
            <PrimaryButton href={GOOGLE_FORM_URL} large>
              Get Early Access <ArrowRight size={16} />
            </PrimaryButton>
            <a
              href="#video"
              className="inline-flex items-center gap-2 rounded-full font-inter font-semibold transition-all duration-200 hover:opacity-70 hover:scale-105"
              style={{ border: `2px solid ${W15}`, color: W55, fontSize: 14, padding: "14px 28px" }}
            >
              Watch Demo
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <span className="font-inter text-xs tracking-[0.2em] uppercase select-none" style={{ color: W30 }}>
            SCROLL
          </span>
          <div className="relative w-px h-10 overflow-hidden" style={{ background: W08 }}>
            <div
              className="absolute inset-x-0 h-4 animate-scroll-down"
              style={{ background: `linear-gradient(to bottom, ${W55}, transparent)` }}
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          MARQUEE TICKER
      ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden py-5"
        style={{ borderTop: `1px solid ${W08}`, borderBottom: `1px solid ${W08}` }}>
        <div className="marquee-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="font-plus-jakarta font-bold uppercase tracking-[0.22em] px-8 flex items-center gap-8"
              style={{ fontSize: 11, color: W30, whiteSpace: "nowrap" }}>
              {item}
              <span style={{ color: W30 }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════ */}
      <section className="relative py-28 sm:py-40 lg:py-48">
        <div className="section-glow" />

        {/* subtle ambient white */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: "absolute", left: "20%", top: "30%", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${W05} 0%, transparent 70%)`, filter: "blur(40px)" }} />
        </div>

        <Wrap>
          <div ref={featRef} className="max-w-2xl mb-20 sm:mb-28">
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>Why Nova</Tag>
            </div>
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
              <SectionHeading>
                The productivity layer<br />
                your computer was<br />
                <span className="white-shimmer">always missing.</span>
              </SectionHeading>
            </div>
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "240ms" }}>
              <p className="font-inter leading-loose mt-6"
                style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: W45, maxWidth: 480 }}>
                Three core technologies, working together to make your voice the most powerful input device you own.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title}
                  className={`glass-card glass-card-hover rounded-3xl p-8 sm:p-10 flex flex-col gap-7 ${featVis ? "anim-up" : "opacity-0"}`}
                  style={{ animationDelay: `${i * 140 + 300}ms` }}>

                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: W05, border: `1px solid ${W15}` }}>
                    <Icon size={26} color={W} strokeWidth={1.5} />
                  </div>

                  <span className="font-plus-jakarta font-bold uppercase tracking-widest"
                    style={{ fontSize: 10, color: W30 }}>{feat.tag}</span>

                  <div>
                    <h3 className="font-inter font-extrabold text-white mb-2"
                      style={{ fontSize: "clamp(1.3rem, 2vw, 1.7rem)", letterSpacing: "-0.02em" }}>
                      {feat.title}
                    </h3>
                    <p className="font-instrument" style={{ fontStyle: "italic", fontSize: 18, color: W55, lineHeight: 1.4 }}>
                      {feat.headline}
                    </p>
                  </div>

                  <p className="font-inter leading-relaxed" style={{ fontSize: 15, color: W45, lineHeight: 1.75 }}>
                    {feat.body}
                  </p>

                  <ul className="flex flex-col gap-3 mt-auto pt-4"
                    style={{ borderTop: `1px solid ${W08}` }}>
                    {feat.bullets.map(b => (
                      <li key={b} className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: W55 }} />
                        <span className="font-inter" style={{ fontSize: 13, color: W45 }}>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          STATS
      ══════════════════════════════════════════════════ */}
      <section className="relative py-28 sm:py-40">
        <div className="section-glow" />
        <Wrap>
          <div ref={statRef}>
            <div className={statVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>By The Numbers</Tag>
              <SectionHeading className="mb-20 sm:mb-28 max-w-2xl">
                Benchmarks that prove<br />
                <span className="white-shimmer">the difference.</span>
              </SectionHeading>
            </div>
            <div className="flex flex-col" style={{ borderTop: `1px solid ${W08}` }}>
              {stats.map((s, i) => (
                <div key={s.value}
                  className={`grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 items-center py-12 sm:py-16 ${statVis ? "anim-up" : "opacity-0"}`}
                  style={{ animationDelay: `${i * 150 + 100}ms`, borderBottom: `1px solid ${W08}` }}>
                  <div>
                    <p className="font-inter font-extrabold leading-none white-shimmer"
                      style={{ fontSize: "clamp(3.8rem, 8vw, 6.5rem)", letterSpacing: "-0.04em" }}>
                      {s.value}
                    </p>
                  </div>
                  <div>
                    <p className="font-inter font-bold text-white"
                      style={{ fontSize: "clamp(1.1rem, 2vw, 1.4rem)", letterSpacing: "-0.01em" }}>
                      {s.label}
                    </p>
                  </div>
                  <div>
                    <p className="font-inter leading-relaxed" style={{ fontSize: 15, color: W45 }}>
                      {s.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          VIDEO DEMO
      ══════════════════════════════════════════════════ */}
      <section id="video" className="relative py-28 sm:py-40">
        <div className="section-glow" />
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: "absolute", right: "10%", top: "20%", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, ${W05} 0%, transparent 70%)`, filter: "blur(50px)" }} />
        </div>
        <Wrap>
          <div ref={vidRef} className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

            <div className={vidVis ? "anim-left" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>See It In Action</Tag>
              <SectionHeading className="mb-6">
                Real commands.<br />Real digital tasks.<br />
                <span className="white-shimmer">Zero friction.</span>
              </SectionHeading>
              <p className="font-inter leading-loose mb-10"
                style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: W45 }}>
                The product direction is clear: natural speech controlling navigation, typing,
                search, and app workflows with professional-grade speed and reliability.
              </p>
              <ul className="flex flex-col gap-5 mb-10">
                {commandExamples.map((line, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ background: W55 }} />
                    <span className="font-inter leading-relaxed" style={{ fontSize: 15, color: W55 }}>
                      &quot;{line}&quot;
                    </span>
                  </li>
                ))}
              </ul>
              <a href="https://www.youtube.com/watch?v=wt_w_KeJC2E" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 font-inter font-semibold transition-opacity hover:opacity-60"
                style={{ fontSize: 14, color: W }}>
                Watch the full demo on YouTube <ArrowRight size={15} />
              </a>
            </div>

            <div className={vidVis ? "anim-right" : "opacity-0"} style={{ animationDelay: "150ms" }}>
              <div className="glass-card rounded-3xl overflow-hidden"
                style={{ aspectRatio: "16/9", boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px ${W08}` }}>
                <iframe
                  src="https://www.youtube.com/embed/wt_w_KeJC2E"
                  title="Nova demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                />
              </div>
              <p className="font-inter text-center mt-4" style={{ fontSize: 13, color: W30 }}>
                Live prototype demo — recorded in one take, no scripting.
              </p>
            </div>
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          USE CASES
      ══════════════════════════════════════════════════ */}
      <section id="use-cases" className="relative py-28 sm:py-40">
        <div className="section-glow" />
        <Wrap>
          <div ref={ucRef}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end mb-20 sm:mb-28">
              <div className={ucVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
                <Tag>Built Broad On Purpose</Tag>
                <SectionHeading>
                  A mainstream product,<br />
                  not a{" "}
                  <span className="white-shimmer">narrow niche</span>
                  <br />
                  tool.
                </SectionHeading>
              </div>
              <div className={ucVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
                <p className="font-inter leading-loose" style={{ fontSize: "clamp(15px,1.4vw,17px)", color: W45 }}>
                  Whether you&apos;re a student managing research, a developer running builds, or a
                  professional trying to reclaim two hours a day — Nova was designed from the ground up
                  to work for everyone.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {useCases.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={item.title}
                    className={`glass-card glass-card-hover rounded-3xl p-8 sm:p-9 flex flex-col gap-5 ${ucVis ? "anim-up" : "opacity-0"}`}
                    style={{ animationDelay: `${i * 100 + 200}ms` }}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: W05, border: `1px solid ${W15}` }}>
                      <Icon size={22} color={W} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-inter font-bold text-white mb-3"
                        style={{ fontSize: "clamp(1rem, 1.5vw, 1.15rem)", letterSpacing: "-0.01em" }}>
                        {item.title}
                      </h3>
                      <p className="font-inter leading-relaxed" style={{ fontSize: 14, color: W45, lineHeight: 1.75 }}>
                        {item.copy}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          EARLY ACCESS DOWNLOAD
      ══════════════════════════════════════════════════ */}
      <section ref={dlRef as React.RefObject<HTMLDivElement>} id="download" className="relative py-28 sm:py-40">
        <div className="section-glow" />
        <Wrap className="relative z-10">
          <div className="max-w-4xl mx-auto">

            {/* Header */}
            <div className={`text-center mb-16 ${dlVis ? "anim-up" : "opacity-0"}`}>
              <Tag>Early Access</Tag>
              <h2 className="font-inter font-extrabold text-white mt-6 mb-4 leading-tight"
                style={{ fontSize: "clamp(2rem,5vw,3.5rem)", letterSpacing: "-0.03em" }}>
                Nova is live on your desktop.
              </h2>
              <p className="font-inter" style={{ fontSize: 17, color: W45, maxWidth: 520, margin: "0 auto" }}>
                Download the app — it connects automatically to the Nova cloud backend.
                Microphone required. No setup needed.
              </p>
            </div>

            {/* Countdown badge */}
            <div className={`flex justify-center mb-12 ${dlVis ? "anim-up" : "opacity-0"}`} style={{ animationDelay: "100ms" }}>
              <div className="flex items-center gap-3 px-6 py-3 rounded-full font-inter font-semibold"
                style={{ background: W08, border: `1px solid ${W15}`, fontSize: 15 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dlRemaining === 0 ? "#666" : "#22c55e", display: "inline-block", boxShadow: dlRemaining === 0 ? "none" : "0 0 8px #22c55e" }} />
                {dlRemaining === null
                  ? <span style={{ color: W55 }}>Checking availability…</span>
                  : dlRemaining === 0
                    ? <span style={{ color: W45 }}>Early access full — join the waitlist</span>
                    : <span style={{ color: W90 }}><strong style={{ color: W }}>{dlRemaining}</strong> of 5 early access slots remaining</span>
                }
              </div>
            </div>

            {/* Error message */}
            {dlError && (
              <p className="text-center font-inter mb-8" style={{ color: "#f87171", fontSize: 14 }}>{dlError}</p>
            )}

            {/* Platform cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-5 ${dlVis ? "anim-up" : "opacity-0"}`} style={{ animationDelay: "200ms" }}>
              {([
                { platform: "windows", label: "Windows", sub: "Windows 10 / 11", note: ".exe installer", icon: "⊞" },
                { platform: "mac",     label: "macOS",   sub: "macOS 12+",        note: ".dmg  ·  Intel & Apple Silicon", icon: "" },
                { platform: "linux",   label: "Linux",   sub: "Ubuntu / Arch / Fedora", note: ".AppImage  ·  no install needed", icon: "🐧" },
              ] as const).map(({ platform, label, sub, note, icon }) => {
                const isClaiming = dlClaiming === platform;
                const isFull     = dlRemaining === 0;
                return (
                  <button key={platform} onClick={() => claimDownload(platform)} disabled={isFull || !!dlClaiming}
                    className="group text-left rounded-2xl p-6 transition-all duration-200 hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: W05, border: `1px solid ${W15}`, cursor: isFull ? "not-allowed" : "pointer" }}>
                    <div className="text-3xl mb-4">{icon}</div>
                    <h3 className="font-inter font-bold text-white mb-1" style={{ fontSize: 18 }}>{label}</h3>
                    <p className="font-inter mb-4" style={{ fontSize: 13, color: W45 }}>{sub}</p>
                    <p className="font-inter mb-5" style={{ fontSize: 12, color: W30 }}>{note}</p>
                    <div className="flex items-center gap-2 font-inter font-semibold"
                      style={{ fontSize: 14, color: isFull ? W30 : W, transition: "color 0.2s" }}>
                      {isClaiming ? (
                        <><span className="animate-spin inline-block">⟳</span> Preparing…</>
                      ) : isFull ? (
                        <>✕ Unavailable</>
                      ) : (
                        <>↓ Download for {label}</>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Linux instructions */}
            <div className={`mt-10 rounded-xl p-5 ${dlVis ? "anim-up" : "opacity-0"}`}
              style={{ animationDelay: "300ms", background: W05, border: `1px solid ${W08}` }}>
              <p className="font-inter font-semibold text-white mb-3" style={{ fontSize: 13 }}>🐧 Linux quick start</p>
              <pre className="font-mono text-xs overflow-x-auto" style={{ color: W55, lineHeight: 1.8 }}>
{`chmod +x Nova*.AppImage
./Nova*.AppImage`}
              </pre>
              <p className="font-inter mt-3" style={{ fontSize: 12, color: W30 }}>
                Requires: microphone + internet. Say <em style={{ color: W45 }}>"Hey Nova"</em> to wake the assistant.
              </p>
            </div>

          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          BOTTOM CTA
      ══════════════════════════════════════════════════ */}
      <section className="relative py-36 sm:py-52 overflow-hidden">
        <div className="section-glow" />
        {/* radial white glow from below, like the logo's energy burst */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 60% at 50% 100%, ${W05} 0%, transparent 65%)` }} />
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 70%)` }} />
        </div>
        <Wrap className="relative z-10">
          <div ref={ctaRef} className="max-w-3xl mx-auto text-center">

            <div className={`mx-auto mb-10 rounded-full overflow-hidden logo-glow ${ctaVis ? "anim-scale" : "opacity-0"}`}
              style={{ width: 96, height: 96, animationDelay: "0ms" }}>
              <Image src="/NovaLogo.png" alt="Nova" width={96} height={96} className="w-full h-full object-cover" />
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
              <Tag>Join The Early Cohort</Tag>
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "240ms" }}>
              <h2 className="font-inter font-extrabold text-white leading-[1.0] mb-6"
                style={{ fontSize: "clamp(2.4rem, 6vw, 5rem)", letterSpacing: "-0.03em" }}>
                Your voice should run<br />
                your workflow.<br />
                <span className="white-shimmer">Not slow it down.</span>
              </h2>
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "360ms" }}>
              <p className="font-inter leading-loose mb-12 mx-auto"
                style={{ fontSize: "clamp(15px,1.4vw,17px)", color: W45, maxWidth: 480 }}>
                Be first to access beta invitations, feature drops, and onboarding updates
                as Nova expands from early access to broader everyday use.
              </p>
            </div>

            <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 ${ctaVis ? "anim-up" : "opacity-0"}`}
              style={{ animationDelay: "480ms" }}>
              <PrimaryButton href={GOOGLE_FORM_URL} large>
                Reserve My Spot <ArrowRight size={16} />
              </PrimaryButton>
              <OutlineButton href={GOOGLE_FORM_URL} large>
                Learn More
              </OutlineButton>
            </div>
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="relative py-10" style={{ borderTop: `1px solid ${W08}` }}>
        <Wrap className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden">
              <Image src="/NovaLogo.png" alt="Nova" width={32} height={32} className="w-full h-full object-cover" />
            </div>
            <span className="font-inter font-semibold" style={{ fontSize: 15, color: W55 }}>Nova</span>
          </div>
          <p className="font-inter" style={{ fontSize: 13, color: W30 }}>
            © 2025 Nova. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Contact"].map(item => (
              <a key={item} href="#"
                className="font-inter transition-opacity hover:opacity-80"
                style={{ fontSize: 13, color: W30 }}>
                {item}
              </a>
            ))}
          </div>
        </Wrap>
      </footer>
    </div>
  );
}
