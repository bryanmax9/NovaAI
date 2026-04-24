"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Menu, X,
  Mic, Zap, Globe,
  Code2, Users, BookOpen, Layers, BrainCircuit, Building2,
} from "lucide-react";
import Image from "next/image";

/* ═══ CONSTANTS ═══════════════════════════════════════════════════════ */
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdCwg9Wm6AzkM_J7NmwfMPVeVtN3wROU9c3AHX3GqgU9bgl8A/viewform?usp=dialog";
const HLS_SRC = "https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8";
const GOLD = "#d4a017";
const NAV_LINKS = ["FEATURES", "DOCS", "BLOG", "ABOUT"] as const;

/* ═══ DATA ════════════════════════════════════════════════════════════ */
const stats = [
  { value: "94.2%",  label: "Command accuracy",        sub: "Measured across 10,000+ voice interactions in real prototype testing." },
  { value: "340ms",  label: "Response latency",         sub: "Median time from voice input to completed action in internal benchmarks." },
  { value: "$99/yr", label: "Pro plan pricing",         sub: "Built for mainstream adoption — not enterprise budgets." },
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
  { icon: BookOpen,    title: "Students & Researchers",   copy: "Open papers, switch tabs, draft notes, and cross-reference sources without losing your research momentum." },
  { icon: Code2,       title: "Developers & Builders",    copy: "Trigger builds, navigate codebases, and run workflow steps while keeping your hands on the keyboard." },
  { icon: Layers,      title: "Creators & Operators",     copy: "Manage tabs, notes, exports, and communication while your focus stays on the work that actually matters." },
  { icon: Users,       title: "Low-Mobility Users",       copy: "Full computer control through voice alone — reducing physical strain without sacrificing capability or speed." },
  { icon: BrainCircuit,title: "Busy Professionals",       copy: "Compress an hour of digital busywork into minutes with natural commands and intelligent task automation." },
  { icon: Building2,   title: "Teams & Institutions",     copy: "Standardize voice-driven workflows across entire organizations with scalable, cross-platform deployment." },
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

/* ═══ SHARED COMPONENTS ═══════════════════════════════════════════════ */
function GoldButton({ href, children, large, outline }: {
  href: string; children: React.ReactNode; large?: boolean; outline?: boolean;
}) {
  if (outline) return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full font-inter font-semibold tracking-wide transition-all duration-200 hover:opacity-80 hover:-translate-y-0.5"
      style={{ border: "1px solid rgba(212,160,23,0.4)", color: GOLD, fontSize: large ? 14 : 13, padding: large ? "14px 32px" : "11px 24px" }}>
      {children}
    </a>
  );
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full font-inter font-bold uppercase tracking-widest transition-all duration-200 hover:opacity-85 hover:-translate-y-0.5 active:scale-95"
      style={{ background: `linear-gradient(135deg,#e8b52a 0%,${GOLD} 55%,#b8890f 100%)`, color: "#080808", fontSize: large ? 14 : 12, padding: large ? "15px 36px" : "11px 24px", boxShadow: `0 0 28px rgba(212,160,23,0.22), 0 4px 16px rgba(0,0,0,0.5)` }}>
      {children}
    </a>
  );
}

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-10 lg:px-20 ${className}`}>{children}</div>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-plus-jakarta font-bold uppercase tracking-[0.2em] mb-4" style={{ fontSize: 11, color: GOLD }}>
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
  const hlsRef    = useRef<{ destroy: () => void } | null>(null);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [scrollY,  setScrollY]    = useState(0);

  /* HLS video */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    import("hls.js").then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false });
        hlsRef.current = hls;
        hls.loadSource(HLS_SRC);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = HLS_SRC;
        v.play().catch(() => {});
      }
    });
    return () => hlsRef.current?.destroy();
  }, []);

  /* Parallax */
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Section refs */
  const [featRef, featVis]   = useInView(0.08);
  const [statRef, statVis]   = useInView(0.1);
  const [vidRef,  vidVis]    = useInView(0.08);
  const [ucRef,   ucVis]     = useInView(0.06);
  const [ctaRef,  ctaVis]    = useInView(0.12);

  return (
    <div className="min-h-screen" style={{ background: "#080808", color: "#fff" }}>

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative flex flex-col overflow-hidden" style={{ minHeight: "100svh" }}>

        {/* BG video with parallax */}
        <video ref={videoRef} muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.42, transform: `translateY(${scrollY * 0.18}px) scale(1.06)`, willChange: "transform" }}
        />

        {/* Overlays */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, #080808 0%, #080808 20%, rgba(8,8,8,0.82) 45%, rgba(8,8,8,0.3) 70%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to top, #080808 0%, rgba(8,8,8,0.7) 22%, transparent 55%)" }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(8,8,8,0.65) 0%, transparent 20%)" }} />

        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none hidden lg:block">
          {[25, 50, 75].map(p => (
            <div key={p} className="absolute top-0 bottom-0"
              style={{ left: `${p}%`, width: 1, background: "rgba(255,255,255,0.06)" }} />
          ))}
        </div>

        {/* Gold ambient glow top */}
        <div className="absolute inset-x-0 top-0 pointer-events-none overflow-hidden" style={{ height: 400 }}>
          <svg width="100%" height="400" viewBox="0 0 1440 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <filter id="hglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="38" /></filter>
              <radialGradient id="hg" cx="50%" cy="30%" r="55%">
                <stop offset="0%"   stopColor="#e8a020" stopOpacity="0.38" />
                <stop offset="55%"  stopColor="#d4a017" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#d4a017" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="720" cy="100" rx="520" ry="130" fill="url(#hg)" filter="url(#hglow)" />
          </svg>
        </div>

        {/* ── NAV ── */}
        <header className="relative z-50 flex items-center justify-between px-5 sm:px-10 lg:px-20 py-6">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0 logo-glow">
              <Image src="/NovaLogo.png" alt="Nova" fill className="object-cover" />
            </div>
            <span className="text-white font-inter font-bold text-xl tracking-tight select-none">Nova</span>
          </div>

          <nav className="hidden md:flex items-center gap-9">
            {NAV_LINKS.map(item => (
              <a key={item} href="#"
                className="font-inter text-sm font-medium tracking-widest transition-colors duration-200"
                style={{ color: "rgba(255,255,255,0.5)" }}
                onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}>
                {item}
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <GoldButton href={GOOGLE_FORM_URL}>Get Early Access</GoldButton>
          </div>

          <button className="md:hidden p-2" style={{ color: "rgba(255,255,255,0.8)" }}
            onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={24} />
          </button>
        </header>

        {/* Mobile overlay */}
        {menuOpen && (
          <div className="fixed inset-0 z-[200] flex flex-col"
            style={{ background: "rgba(8,8,8,0.97)", backdropFilter: "blur(16px)" }}>
            <div className="flex items-center justify-between px-5 py-6">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full overflow-hidden">
                  <Image src="/NovaLogo.png" alt="Nova" fill className="object-cover" />
                </div>
                <span className="text-white font-bold text-xl">Nova</span>
              </div>
              <button className="p-2" style={{ color: "rgba(255,255,255,0.7)" }}
                onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={24} />
              </button>
            </div>
            <nav className="flex flex-col flex-1 items-center justify-center gap-10 pb-24">
              {NAV_LINKS.map(item => (
                <a key={item} href="#"
                  className="text-white font-bold text-3xl tracking-widest hover:opacity-60 transition-opacity"
                  onClick={() => setMenuOpen(false)}>{item}</a>
              ))}
              <div className="mt-4">
                <GoldButton href={GOOGLE_FORM_URL} large>Get Early Access</GoldButton>
              </div>
            </nav>
          </div>
        )}

        {/* ── HERO CONTENT ── */}
        <div className="relative z-10 flex flex-col flex-1 justify-center px-5 sm:px-10 lg:px-20 pb-28 pt-10">
          <div className="max-w-4xl">

            <Tag>AI-Powered Productivity Platform</Tag>

            {/* Main slogan */}
            <h1 className="font-inter font-extrabold uppercase leading-[0.96] text-white mb-4"
              style={{ fontSize: "clamp(42px, 7.5vw, 88px)", letterSpacing: "-0.03em" }}>
              YOUR VOICE<br />
              SHOULD RUN YOUR<br />
              WORKFLOW
              <span style={{ color: GOLD }}>.</span>
            </h1>
            <p className="font-instrument mb-8"
              style={{ fontStyle: "italic", fontSize: "clamp(20px, 2.5vw, 28px)", color: "rgba(255,255,255,0.42)", letterSpacing: "0.01em" }}>
              Not slow it down.
            </p>

            <p className="font-inter leading-relaxed mb-10"
              style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: "rgba(255,255,255,0.58)", maxWidth: 540 }}>
              Nova is the AI-powered voice layer for everyday computer work. Natural commands,
              intelligent automation, and instant execution — built for everyone who wants to stop
              fighting their machine and start working with it.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <GoldButton href={GOOGLE_FORM_URL} large>
                Get Early Access <ArrowRight size={16} />
              </GoldButton>
              <a href="#video"
                className="inline-flex items-center gap-2 rounded-full font-inter font-semibold tracking-wide transition-all hover:opacity-70 px-7 py-4"
                style={{ border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
                Watch Demo
              </a>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-40">
          <span className="font-inter text-xs tracking-widest text-white uppercase">Scroll</span>
          <div className="w-px h-10" style={{ background: `linear-gradient(to bottom, ${GOLD}, transparent)` }} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          MARQUEE TICKER
      ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="marquee-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="font-plus-jakarta font-bold uppercase tracking-[0.22em] px-8 flex items-center gap-8"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
              {item}
              <span style={{ color: GOLD, opacity: 0.6 }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          FEATURES — WHY NOVA
      ══════════════════════════════════════════════════ */}
      <section className="relative py-28 sm:py-40 lg:py-48">
        <div className="section-glow" />

        {/* ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: "absolute", left: "20%", top: "30%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,160,23,0.04) 0%, transparent 70%)", filter: "blur(40px)" }} />
        </div>

        <Wrap>
          {/* Header */}
          <div ref={featRef} className="max-w-2xl mb-20 sm:mb-28">
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>Why Nova</Tag>
            </div>
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
              <SectionHeading>
                The productivity layer<br />
                your computer was<br />
                <span className="gold-shimmer">always missing.</span>
              </SectionHeading>
            </div>
            <div className={featVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "240ms" }}>
              <p className="font-inter leading-loose mt-6"
                style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: "rgba(255,255,255,0.5)", maxWidth: 480 }}>
                Three core technologies, working together to make your voice the most powerful input device you own.
              </p>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title}
                  className={`glass-card glass-card-hover rounded-3xl p-8 sm:p-10 flex flex-col gap-7 ${featVis ? "anim-up" : "opacity-0"}`}
                  style={{ animationDelay: `${i * 140 + 300}ms` }}>

                  {/* Icon badge */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.2)" }}>
                    <Icon size={26} color={GOLD} strokeWidth={1.5} />
                  </div>

                  {/* Tag */}
                  <span className="font-plus-jakarta font-bold uppercase tracking-widest"
                    style={{ fontSize: 10, color: "rgba(212,160,23,0.7)" }}>{feat.tag}</span>

                  <div>
                    <h3 className="font-inter font-extrabold text-white mb-2"
                      style={{ fontSize: "clamp(1.3rem, 2vw, 1.7rem)", letterSpacing: "-0.02em" }}>
                      {feat.title}
                    </h3>
                    <p className="font-instrument" style={{ fontStyle: "italic", fontSize: 18, color: GOLD, lineHeight: 1.4 }}>
                      {feat.headline}
                    </p>
                  </div>

                  <p className="font-inter leading-relaxed"
                    style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.75 }}>
                    {feat.body}
                  </p>

                  <ul className="flex flex-col gap-3 mt-auto pt-4"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    {feat.bullets.map(b => (
                      <li key={b} className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GOLD }} />
                        <span className="font-inter" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{b}</span>
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
            {/* Header */}
            <div className={statVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>By The Numbers</Tag>
              <SectionHeading className="mb-20 sm:mb-28 max-w-2xl">
                Benchmarks that prove<br />
                <span className="gold-shimmer">the difference.</span>
              </SectionHeading>
            </div>

            {/* Stat rows */}
            <div className="flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {stats.map((s, i) => (
                <div key={s.value}
                  className={`grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 items-center py-12 sm:py-16 ${statVis ? "anim-up" : "opacity-0"}`}
                  style={{ animationDelay: `${i * 150 + 100}ms`, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>

                  {/* Value */}
                  <div>
                    <p className="font-inter font-extrabold leading-none gold-shimmer"
                      style={{ fontSize: "clamp(3.8rem, 8vw, 6.5rem)", letterSpacing: "-0.04em" }}>
                      {s.value}
                    </p>
                  </div>

                  {/* Label */}
                  <div>
                    <p className="font-inter font-bold text-white"
                      style={{ fontSize: "clamp(1.1rem, 2vw, 1.4rem)", letterSpacing: "-0.01em" }}>
                      {s.label}
                    </p>
                  </div>

                  {/* Sub */}
                  <div>
                    <p className="font-inter leading-relaxed"
                      style={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }}>
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

        {/* Ambient */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: "absolute", right: "10%", top: "20%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,160,23,0.035) 0%, transparent 70%)", filter: "blur(50px)" }} />
        </div>

        <Wrap>
          <div ref={vidRef} className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

            {/* Left copy */}
            <div className={vidVis ? "anim-left" : "opacity-0"} style={{ animationDelay: "0ms" }}>
              <Tag>See It In Action</Tag>
              <SectionHeading className="mb-6">
                Real commands.<br />Real digital tasks.<br />
                <span className="gold-shimmer">Zero friction.</span>
              </SectionHeading>
              <p className="font-inter leading-loose mb-10"
                style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: "rgba(255,255,255,0.48)" }}>
                The product direction is clear: natural speech controlling navigation, typing,
                search, and app workflows with professional-grade speed and reliability.
              </p>

              <ul className="flex flex-col gap-5 mb-10">
                {commandExamples.map((line, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ background: GOLD }} />
                    <span className="font-inter leading-relaxed"
                      style={{ fontSize: 15, color: "rgba(255,255,255,0.6)" }}>
                      &quot;{line}&quot;
                    </span>
                  </li>
                ))}
              </ul>

              <a href="https://www.youtube.com/watch?v=TNiw3K0_gpU" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 font-inter font-semibold transition-opacity hover:opacity-70"
                style={{ fontSize: 14, color: GOLD }}>
                Watch the full demo on YouTube <ArrowRight size={15} />
              </a>
            </div>

            {/* Right video */}
            <div className={vidVis ? "anim-right" : "opacity-0"} style={{ animationDelay: "150ms" }}>
              <div className="glass-card rounded-3xl overflow-hidden"
                style={{ aspectRatio: "16/9", boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,160,23,0.12)" }}>
                <iframe
                  src="https://www.youtube.com/embed/TNiw3K0_gpU"
                  title="Nova demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                />
              </div>
              {/* Caption */}
              <p className="font-inter text-center mt-4" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
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
            {/* Header */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end mb-20 sm:mb-28">
              <div className={ucVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "0ms" }}>
                <Tag>Built Broad On Purpose</Tag>
                <SectionHeading>
                  A mainstream product,<br />
                  not a{" "}
                  <span className="gold-shimmer">narrow niche</span>
                  <br />
                  tool.
                </SectionHeading>
              </div>
              <div className={ucVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
                <p className="font-inter leading-loose" style={{ fontSize: "clamp(15px,1.4vw,17px)", color: "rgba(255,255,255,0.45)" }}>
                  Whether you&apos;re a student managing research, a developer running builds, or a
                  professional trying to reclaim two hours a day — Nova was designed from the ground up
                  to work for everyone.
                </p>
              </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {useCases.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={item.title}
                    className={`glass-card glass-card-hover rounded-3xl p-8 sm:p-9 flex flex-col gap-5 ${ucVis ? "anim-up" : "opacity-0"}`}
                    style={{ animationDelay: `${i * 100 + 200}ms` }}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(212,160,23,0.09)", border: "1px solid rgba(212,160,23,0.18)" }}>
                      <Icon size={22} color={GOLD} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-inter font-bold text-white mb-3"
                        style={{ fontSize: "clamp(1rem, 1.5vw, 1.15rem)", letterSpacing: "-0.01em" }}>
                        {item.title}
                      </h3>
                      <p className="font-inter leading-relaxed"
                        style={{ fontSize: 14, color: "rgba(255,255,255,0.44)", lineHeight: 1.75 }}>
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
          BOTTOM CTA
      ══════════════════════════════════════════════════ */}
      <section className="relative py-36 sm:py-52 overflow-hidden">
        <div className="section-glow" />

        {/* Large ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(212,160,23,0.07) 0%, transparent 65%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(212,160,23,0.04) 0%, transparent 70%)" }} />
        </div>

        <Wrap className="relative z-10">
          <div ref={ctaRef} className="max-w-3xl mx-auto text-center">
            {/* Logo large */}
            <div className={`relative mx-auto mb-10 rounded-full overflow-hidden logo-glow ${ctaVis ? "anim-scale" : "opacity-0"}`}
              style={{ width: 96, height: 96, animationDelay: "0ms" }}>
              <Image src="/NovaLogo.png" alt="Nova" fill className="object-cover" />
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "120ms" }}>
              <Tag>Join The Early Cohort</Tag>
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "240ms" }}>
              <h2 className="font-inter font-extrabold text-white leading-[1.0] mb-6"
                style={{ fontSize: "clamp(2.4rem, 6vw, 5rem)", letterSpacing: "-0.03em" }}>
                Your voice should run<br />
                your workflow
                <span style={{ color: GOLD }}>.</span>
                <br />
                <span className="gold-shimmer">Not slow it down.</span>
              </h2>
            </div>

            <div className={ctaVis ? "anim-up" : "opacity-0"} style={{ animationDelay: "360ms" }}>
              <p className="font-inter leading-loose mb-12 mx-auto"
                style={{ fontSize: "clamp(15px,1.4vw,17px)", color: "rgba(255,255,255,0.45)", maxWidth: 480 }}>
                Be first to access beta invitations, feature drops, and onboarding updates
                as Nova expands from early access to broader everyday use.
              </p>
            </div>

            <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 ${ctaVis ? "anim-up" : "opacity-0"}`}
              style={{ animationDelay: "480ms" }}>
              <GoldButton href={GOOGLE_FORM_URL} large>
                Reserve My Spot <ArrowRight size={16} />
              </GoldButton>
              <GoldButton href={GOOGLE_FORM_URL} outline large>
                Learn More
              </GoldButton>
            </div>
          </div>
        </Wrap>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="relative py-10" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <Wrap className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full overflow-hidden">
              <Image src="/NovaLogo.png" alt="Nova" fill className="object-cover" />
            </div>
            <span className="font-inter font-semibold" style={{ fontSize: 15, color: "rgba(255,255,255,0.55)" }}>Nova</span>
          </div>

          <p className="font-inter" style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
            © 2025 Nova. All rights reserved.
          </p>

          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Contact"].map(item => (
              <a key={item} href="#"
                className="font-inter transition-opacity hover:opacity-80"
                style={{ fontSize: 13, color: "rgba(255,255,255,0.32)" }}>
                {item}
              </a>
            ))}
          </div>
        </Wrap>
      </footer>
    </div>
  );
}
