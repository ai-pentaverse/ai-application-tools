import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* ─────────────────────────────────────────────
   Design tokens
───────────────────────────────────────────── */
const T = {
  // Surface
  bg:        "#080d14",
  surface:   "#0e1623",
  surfaceHi: "#14202f",
  border:    "#1e2d42",
  borderHi:  "#2a3f5a",

  // Brand
  indigo:    "#6366f1",
  indigoDim: "#3730a3",
  indigoGlow:"rgba(99,102,241,0.18)",
  blue:      "#3b82f6",

  // Status
  green:     "#22c55e",
  greenDim:  "#14532d",
  amber:     "#f59e0b",
  amberDim:  "#78350f",
  red:       "#ef4444",
  redDim:    "#7f1d1d",

  // Text
  textPrimary:   "#e8edf5",
  textSecondary: "#7a90ab",
  textMuted:     "#3d5268",

  // Misc
  radius:    "10px",
  radiusSm:  "6px",
  radiusLg:  "16px",
  fontMono:  "'JetBrains Mono', 'Fira Code', monospace",
  fontSans:  "'Inter', system-ui, -apple-system, sans-serif",
  shadow:    "0 4px 24px rgba(0,0,0,0.45)",
};

/* ─────────────────────────────────────────────
   Injected global CSS
───────────────────────────────────────────── */
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: ${T.bg};
    color: ${T.textPrimary};
    font-family: ${T.fontSans};
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: ${T.borderHi}; }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.75); }
  }
  @keyframes slide-in-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .msg-anim { animation: slide-in-up 0.22s ease; }

  .send-btn:hover:not(:disabled) {
    background: ${T.blue} !important;
    transform: translateY(-1px);
    box-shadow: 0 0 20px rgba(59,130,246,0.4);
  }
  .send-btn:active:not(:disabled) { transform: translateY(0); }

  .speak-btn:hover:not(:disabled) {
    background: #4f46e5 !important;
    transform: translateY(-1px);
    box-shadow: 0 0 20px rgba(99,102,241,0.4);
  }

  .pill-btn {
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  }

  .metric-card {
    transition: border-color 0.2s;
  }
  .metric-card:hover {
    border-color: ${T.borderHi};
  }
`;

function useGlobalStyles() {
  useEffect(() => {
    const tag = document.createElement("style");
    tag.textContent = GLOBAL_CSS;
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);
}

/* ─────────────────────────────────────────────
   Tiny primitives
───────────────────────────────────────────── */
function Dot({ color, size = 8 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function Badge({ children, color = T.blue, bg }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: bg || `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {children}
    </span>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: T.border,
        margin: "2px 0",
      }}
    />
  );
}

/* Score ring */
function ScoreRing({ score }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score));
  const dash = circ * pct;
  const color =
    pct >= 0.7 ? T.green : pct >= 0.4 ? T.amber : T.red;

  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <circle
        cx={30} cy={30} r={r}
        fill="none"
        stroke={T.border}
        strokeWidth={5}
      />
      <circle
        cx={30} cy={30} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text
        x={30} y={35}
        textAnchor="middle"
        fill={color}
        fontSize={13}
        fontWeight={700}
        fontFamily={T.fontSans}
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Token usage tooltip
───────────────────────────────────────────── */
function TokenBadge({ usage }) {
  const [open, setOpen] = useState(false);
  const u = usage || {};
  const hasCaching = (u.cached_tokens ?? 0) > 0;

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center", marginTop: 4 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: `1px solid ${T.border}`,
          borderRadius: 99,
          padding: "2px 9px",
          fontSize: 11,
          color: T.textSecondary,
          cursor: "default",
          fontFamily: T.fontMono,
        }}
      >
        <span style={{ fontSize: 10 }}>Σ</span>
        {u.total_tokens ?? 0} tok
        {hasCaching && (
          <span style={{ color: T.green, fontSize: 10 }}>⚡</span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            background: T.surfaceHi,
            border: `1px solid ${T.borderHi}`,
            borderRadius: T.radius,
            padding: "10px 14px",
            fontSize: 12,
            whiteSpace: "nowrap",
            zIndex: 20,
            boxShadow: T.shadow,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontFamily: T.fontMono,
          }}
        >
          <Row label="Input"      value={u.prompt_tokens ?? 0} unit="tok" />
          <Row label="Output"     value={u.completion_tokens ?? 0} unit="tok" />
          <Row label="Total"      value={u.total_tokens ?? 0} unit="tok" bold />
          {hasCaching && (
            <>
              <Divider />
              <Row label="Cached" value={u.cached_tokens} unit="tok" color={T.green} />
              <Row
                label="Cache hit"
                value={Math.round((u.cached_tokens / Math.max(u.prompt_tokens, 1)) * 100)}
                unit="%"
                color={T.green}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, unit, bold, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 24,
        color: color || T.textSecondary,
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span>{label}</span>
      <span style={{ color: color || T.textPrimary }}>
        {value}
        {unit && <span style={{ color: T.textMuted, marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Avatars
───────────────────────────────────────────── */
function AssistantAvatar() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: T.indigoDim,
        border: `1.5px solid ${T.indigo}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={16} height={16} viewBox="0 0 26 26" fill="none">
        <path
          d="M7 13h4l2-5 2 10 2-5h2"
          stroke={T.indigo}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "#1e40af",
        border: `1.5px solid ${T.blue}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 700,
        color: "#fff",
      }}
    >
      U
    </div>
  );
}

/* ─────────────────────────────────────────────
   Typing indicator
───────────────────────────────────────────── */
function TypingIndicator() {
  return (
    /* Matches assistant row layout */
    <div className="msg-anim" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <AssistantAvatar />
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "12px 16px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: `4px ${T.radiusLg} ${T.radiusLg} ${T.radiusLg}`,
          marginTop: 2,
        }}
      >
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: T.indigo,
              animation: `pulse-dot 1s ease-in-out ${delay}ms infinite`,
              display: "inline-block",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Simple inline markdown renderer
   Handles: **bold**, `code`, numbered lists,
   bullet lists, and newlines.
───────────────────────────────────────────── */
function renderContent(text) {
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Numbered list item
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <span style={{ color: T.indigo, fontWeight: 700, minWidth: 18 }}>
            {numMatch[1]}.
          </span>
          <span>{inlineFormat(numMatch[2], key++)}</span>
        </div>
      );
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <span style={{ color: T.indigo, marginTop: 1 }}>•</span>
          <span>{inlineFormat(bulletMatch[1], key++)}</span>
        </div>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }

    // Normal line
    elements.push(<div key={key++}>{inlineFormat(line, key++)}</div>);
  }

  return elements;
}

function inlineFormat(text, baseKey) {
  // Split on **bold** and `code` spans
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${baseKey}-${i}`} style={{ color: T.textPrimary, fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${baseKey}-${i}`}
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            padding: "1px 5px",
            color: T.indigo,
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/* ─────────────────────────────────────────────
   Message row  (ChatGPT-style)
───────────────────────────────────────────── */
function Message({ msg }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div
        className="msg-anim"
        style={{
          display: "flex",
          flexDirection: "row-reverse",   // avatar on the right
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <UserAvatar />
        <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div
            style={{
              padding: "11px 16px",
              borderRadius: `${T.radiusLg} 4px ${T.radiusLg} ${T.radiusLg}`,
              background: "#1e3a8a",
              border: `1px solid ${T.blue}44`,
              fontSize: 14,
              lineHeight: 1.65,
              color: T.textPrimary,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      className="msg-anim"
      style={{
        display: "flex",
        flexDirection: "row",            // avatar on the left
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <AssistantAvatar />
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div
          style={{
            padding: "11px 16px",
            borderRadius: `4px ${T.radiusLg} ${T.radiusLg} ${T.radiusLg}`,
            background: T.surface,
            border: `1px solid ${T.border}`,
            fontSize: 14,
            lineHeight: 1.7,
            color: T.textPrimary,
            wordBreak: "break-word",
          }}
        >
          {renderContent(msg.content)}
        </div>
        {msg.tokenUsage && (
          <div style={{ marginTop: 4, paddingLeft: 2 }}>
            <TokenBadge usage={msg.tokenUsage} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Metric card (telemetry panel)
───────────────────────────────────────────── */
function MetricCard({ label, children }) {
  return (
    <div
      className="metric-card"
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.textMuted,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Telemetry panel
───────────────────────────────────────────── */
function TelemetryPanel({ telemetry, judgeScore, judgeReason, isJailbreak, tokenUsage }) {
  const guardrail = telemetry?.guardrail || {};
  const retrieval = telemetry?.retrieval || {};
  const generation = telemetry?.generation || {};
  const latency = telemetry?.latency_seconds;
  const passed = guardrail.passed !== false && !isJailbreak;
  const hasData = !!telemetry?.guardrail;

  const cachedTok = tokenUsage?.cached_tokens ?? 0;
  const promptTok = tokenUsage?.prompt_tokens ?? 1;
  const cacheRate = Math.round((cachedTok / promptTok) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Guardrail */}
      <MetricCard label="Guardrail">
        {hasData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Badge
              color={passed ? T.green : T.red}
              bg={passed ? T.greenDim : T.redDim}
            >
              <Dot color={passed ? T.green : T.red} size={6} />
              {passed ? "Passed" : "Blocked"}
            </Badge>
            {!passed && (
              <p style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>
                {guardrail.reason || "Request blocked"}
              </p>
            )}
          </div>
        ) : (
          <EmptyState text="Send a message to run guardrails" />
        )}
      </MetricCard>

      {/* Judge score */}
      <MetricCard label="Factual Alignment Score">
        {hasData ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <ScoreRing score={judgeScore} />
            <p style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.55 }}>
              {judgeReason}
            </p>
          </div>
        ) : (
          <EmptyState text="Score appears after first response" />
        )}
      </MetricCard>

      {/* Retrieval */}
      <MetricCard label="Retrieval & Rerank">
        {retrieval.candidate_count != null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatChip label="Candidates" value={retrieval.candidate_count} />
              <StatChip label="Selected" value={retrieval.reranked_count ?? 0} accent />
            </div>
            {retrieval.rerank_feed && (
              <div
                style={{
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm,
                  padding: "7px 10px",
                  fontSize: 11,
                  color: T.textSecondary,
                  fontFamily: T.fontMono,
                  lineHeight: 1.6,
                  wordBreak: "break-all",
                }}
              >
                {retrieval.rerank_feed}
              </div>
            )}
          </div>
        ) : (
          <EmptyState text="Retrieval scores appear after a query" />
        )}
      </MetricCard>

      {/* Cache performance */}
      <MetricCard label="Prompt Cache">
        {hasData && tokenUsage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatChip label="Cached" value={`${cachedTok} tok`} accent={cachedTok > 0} />
              <StatChip label="Hit rate" value={`${cacheRate}%`} accent={cacheRate > 0} />
            </div>
            {generation.model && (
              <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
                via {generation.model}
              </div>
            )}
          </div>
        ) : (
          <EmptyState text="Cache stats appear after first LLM call" />
        )}
      </MetricCard>

      {/* Latency */}
      <MetricCard label="Pipeline Latency">
        {latency != null ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: latency < 2 ? T.green : latency < 5 ? T.amber : T.red,
                fontFamily: T.fontMono,
              }}
            >
              {latency.toFixed(2)}
            </span>
            <span style={{ fontSize: 13, color: T.textMuted }}>seconds</span>
          </div>
        ) : (
          <EmptyState text="Latency appears after first request" />
        )}
      </MetricCard>
    </div>
  );
}

function StatChip({ label, value, accent }) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "5px 12px",
        borderRadius: T.radiusSm,
        background: accent ? `${T.indigo}18` : T.bg,
        border: `1px solid ${accent ? T.indigo + "44" : T.border}`,
        minWidth: 52,
        gap: 1,
      }}
    >
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: accent ? T.indigo : T.textPrimary,
          fontFamily: T.fontMono,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{text}</p>
  );
}

/* ─────────────────────────────────────────────
   Main App
───────────────────────────────────────────── */
export default function App() {
  useGlobalStyles();

  // Stable session ID for the lifetime of this page load.
  // Resets naturally on page refresh (no persistence needed per spec).
  const [sessionId] = useState(
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome. Ask me anything about enterprise policies, products, or HR guidelines. I'll retrieve the most relevant documents, generate a grounded answer, and score my own output for factual accuracy.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [telemetry, setTelemetry] = useState({});
  const [judgeScore, setJudgeScore] = useState(0);
  const [judgeReason, setJudgeReason] = useState("-");
  const [isJailbreak, setIsJailbreak] = useState(false);
  const [lastTokenUsage, setLastTokenUsage] = useState(null);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const playTTS = useCallback(async (text) => {
    if (!text?.trim()) return;
    try {
      audioRef.current?.pause();
      audioRef.current = null;
      const url = `${API_BASE}/api/tts?text=${encodeURIComponent(text.slice(0, 500))}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.warn("TTS playback failed:", err);
    }
  }, []);

  const sendMessage = useCallback(
    async (override) => {
      const trimmed = (override ?? input).trim();
      if (!trimmed || loading) return;

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setLoading(true);

      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, session_id: sessionId }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setTelemetry(data.telemetry || {});
        setJudgeScore(data.judge_score ?? 0);
        setJudgeReason(data.judge_reason || "-");
        setIsJailbreak(data.is_jailbreak ?? false);
        setLastTokenUsage(data.token_usage || null);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            tokenUsage: data.token_usage,
          },
        ]);

        playTTS(data.answer);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠ Error: ${err.message}` },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, loading, playTTS]
  );

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition requires Chrome or Edge.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      sendMessage(t);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [listening, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = input.trim().length > 0 && !loading;

  /* ── Layout ── */
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        fontFamily: T.fontSans,
        background: T.bg,
        color: T.textPrimary,
      }}
    >
      {/* ── Left: Chat ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          borderRight: `1px solid ${T.border}`,
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 2,
              }}
            >
              <LogoMark />
              <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Enterprise Knowledge Assistant
              </h1>
            </div>
            <p style={{ fontSize: 12, color: T.textMuted }}>
              Multi-agent RAG · LangGraph · Prompt caching
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={T.green} size={7} />
            <span style={{ fontSize: 12, color: T.textSecondary }}>Live</span>
          </div>
        </header>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}
          {loading && (
            <div className="msg-anim" style={{ alignSelf: "flex-start" }}>
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 20px",
            borderTop: `1px solid ${T.border}`,
            background: T.surface,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <button
            className="pill-btn speak-btn"
            onClick={startListening}
            disabled={loading}
            title={listening ? "Stop listening" : "Voice input"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 99,
              border: `1px solid ${listening ? T.indigo : T.border}`,
              background: listening ? T.indigoDim : "transparent",
              color: listening ? T.textPrimary : T.textSecondary,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 15 }}>{listening ? "⏹" : "🎙"}</span>
            <span style={{ display: "none" }}>{listening ? "Stop" : "Speak"}</span>
          </button>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: T.bg,
              border: `1px solid ${T.borderHi}`,
              borderRadius: T.radius,
              padding: "0 12px",
              transition: "border-color 0.15s",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about policies, products, or HR guidelines…"
              disabled={loading}
              style={{
                flex: 1,
                padding: "9px 0",
                background: "none",
                border: "none",
                outline: "none",
                color: T.textPrimary,
                fontSize: 14,
                fontFamily: T.fontSans,
              }}
            />
            {input.length > 0 && (
              <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, paddingLeft: 8 }}>
                {input.length}/4000
              </span>
            )}
          </div>

          <button
            className="pill-btn send-btn"
            onClick={() => sendMessage()}
            disabled={!canSend}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 18px",
              borderRadius: T.radius,
              border: "none",
              background: canSend ? "#2563eb" : T.border,
              color: canSend ? "#fff" : T.textMuted,
              fontSize: 13,
              fontWeight: 600,
              cursor: canSend ? "pointer" : "not-allowed",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            {loading ? (
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: `2px solid rgba(255,255,255,0.3)`,
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
            ) : (
              <>
                <SendIcon />
                Send
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Right: Telemetry ── */}
      <aside
        style={{
          width: 300,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: T.surfaceHi,
          borderLeft: `1px solid ${T.border}`,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Pipeline Telemetry
          </h2>
          <p style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            Live agent metrics
          </p>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <TelemetryPanel
            telemetry={telemetry}
            judgeScore={judgeScore}
            judgeReason={judgeReason}
            isJailbreak={isJailbreak}
            tokenUsage={lastTokenUsage}
          />
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Icons / Logo
───────────────────────────────────────────── */
function LogoMark() {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" fill="none">
      <rect width={26} height={26} rx={7} fill={T.indigoDim} />
      <path
        d="M7 13h4l2-5 2 10 2-5h2"
        stroke={T.indigo}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <line x1={22} y1={2} x2={11} y2={13} />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
