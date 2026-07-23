import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* ─────────────────────────────────────────────
   Design tokens (ChatGPT-dark palette)
───────────────────────────────────────────── */
const T = {
  bg:          "#212121",
  sidebar:     "#171717",
  surface:     "#2f2f2f",
  surfaceHi:   "#3f3f3f",
  border:      "#3f3f3f",
  borderHi:    "#555",
  indigo:      "#a78bfa",
  blue:        "#3b82f6",
  green:       "#22c55e",
  amber:       "#f59e0b",
  red:         "#ef4444",
  textPrimary:   "#ececec",
  textSecondary: "#8e8ea0",
  textMuted:     "#555",
  radius:   "12px",
  radiusSm: "6px",
  radiusLg: "18px",
  fontMono: "'JetBrains Mono','Fira Code',monospace",
  fontSans: "'Inter',system-ui,-apple-system,sans-serif",
  shadow:   "0 8px 32px rgba(0,0,0,0.6)",
};

/* ─────────────────────────────────────────────
   Global CSS
───────────────────────────────────────────── */
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body, #root { height:100%; }
  body {
    background:${T.bg}; color:${T.textPrimary};
    font-family:${T.fontSans}; -webkit-font-smoothing:antialiased;
  }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#444; border-radius:99px; }
  ::-webkit-scrollbar-thumb:hover { background:#666; }

  @keyframes pulse-dot {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:0.35; transform:scale(0.7); }
  }
  @keyframes slide-up {
    from { opacity:0; transform:translateY(10px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes panel-in {
    from { opacity:0; transform:translateX(24px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes mic-pulse {
    0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0.5); }
    50%      { box-shadow:0 0 0 10px rgba(239,68,68,0); }
  }

  .msg-anim   { animation:slide-up 0.2s ease; }
  .panel-anim { animation:panel-in 0.22s ease; }
  textarea:focus { outline:none; }

  .send-btn { transition:background 0.15s, opacity 0.15s; }
  .send-btn:hover:not(:disabled) { background:#19c37d !important; }
  .send-btn:disabled { opacity:0.4; cursor:not-allowed; }
  
  .mic-recording {
    animation: mic-pulse 1s ease-in-out infinite;
    background: #ef4444 !important;
    color: #fff !important;
  }
`;

function useGlobalStyles() {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);
}

/* ─────────────────────────────────────────────
   Inline markdown renderer
───────────────────────────────────────────── */
function renderMarkdown(text) {
  const lines = text.split("\n");
  const out = [];
  let key = 0;
  for (const line of lines) {
    if (!line.trim()) { out.push(<div key={key++} style={{ height:8 }} />); continue; }
    const numM    = line.match(/^(\d+)\.\s+(.*)/);
    const bulletM = line.match(/^[-*•]\s+(.*)/);
    if (numM) {
      out.push(
        <div key={key++} style={{ display:"flex", gap:8, marginTop:3 }}>
          <span style={{ color:T.indigo, fontWeight:700, minWidth:16 }}>{numM[1]}.</span>
          <span>{inlineFmt(numM[2], key++)}</span>
        </div>
      );
    } else if (bulletM) {
      out.push(
        <div key={key++} style={{ display:"flex", gap:8, marginTop:3 }}>
          <span style={{ color:T.indigo }}>•</span>
          <span>{inlineFmt(bulletM[1], key++)}</span>
        </div>
      );
    } else {
      out.push(<div key={key++}>{inlineFmt(line, key++)}</div>);
    }
  }
  return out;
}

function inlineFmt(text, base) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={`${base}-${i}`} style={{ fontWeight:700 }}>{part.slice(2,-2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={`${base}-${i}`} style={{
          fontFamily:T.fontMono, fontSize:12, background:"#1a1a1a",
          border:`1px solid ${T.border}`, borderRadius:4,
          padding:"1px 5px", color:"#a78bfa",
        }}>
          {part.slice(1,-1)}
        </code>
      );
    return part;
  });
}

function BotAvatar() {
  return (
    <div style={{
      width:36, height:36, borderRadius:"50%",
      background:"linear-gradient(135deg,#6d28d9,#4f46e5)",
      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
    }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
           stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
        <circle cx={9} cy={13} r={1} fill="#fff" stroke="none"/>
        <circle cx={15} cy={13} r={1} fill="#fff" stroke="none"/>
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div style={{
      width:36, height:36, borderRadius:"50%", background:"#19c37d",
      display:"flex", alignItems:"center", justifyContent:"center",
      flexShrink:0, fontSize:14, fontWeight:700, color:"#fff",
    }}>
      U
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg-anim" style={{ display:"flex", gap:14, padding:"6px 0" }}>
      <BotAvatar />
      <div style={{
        display:"inline-flex", alignItems:"center", gap:5,
        padding:"12px 16px", background:T.surface,
        borderRadius:`4px ${T.radiusLg} ${T.radiusLg} ${T.radiusLg}`, marginTop:4,
      }}>
        {[0,150,300].map(d => (
          <span key={d} style={{
            width:7, height:7, borderRadius:"50%", background:"#8e8ea0",
            animation:`pulse-dot 1.1s ease-in-out ${d}ms infinite`, display:"inline-block",
          }}/>
        ))}
      </div>
    </div>
  );
}

function TokenBadge({ usage }) {
  const [open, setOpen] = useState(false);
  if (!usage) return null;
  const u = usage;
  return (
    <div style={{ position:"relative" }}
         onMouseEnter={() => setOpen(true)}
         onMouseLeave={() => setOpen(false)}>
      <div style={{
        display:"inline-flex", alignItems:"center", gap:5,
        padding:"2px 10px", borderRadius:99,
        border:`1px solid ${T.border}`,
        fontSize:11, color:T.textSecondary,
        fontFamily:T.fontMono, cursor:"default", marginTop:6,
      }}>
        <span style={{ fontSize:10 }}>Σ</span>
        {u.total_tokens ?? 0} tokens
      </div>
      {open && (
        <div style={{
          position:"absolute", bottom:"calc(100% + 6px)", left:0,
          background:"#1a1a1a", border:`1px solid ${T.border}`,
          borderRadius:T.radius, padding:"10px 14px",
          fontSize:12, color:T.textSecondary, fontFamily:T.fontMono,
          whiteSpace:"nowrap", zIndex:50, boxShadow:T.shadow,
          display:"flex", flexDirection:"column", gap:4,
        }}>
          <TRow label="Input"  value={u.prompt_tokens ?? 0}     unit="tokens" />
          <TRow label="Output" value={u.completion_tokens ?? 0}  unit="tokens" />
          <div style={{ height:1, background:T.border }} />
          <TRow label="Total"  value={u.total_tokens ?? 0}       unit="tokens" bold />
        </div>
      )}
    </div>
  );
}

function TRow({ label, value, unit, bold }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", gap:20,
                  fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span style={{ color:T.textPrimary }}>{value}<span style={{ color:T.textMuted, marginLeft:2 }}>{unit}</span></span>
    </div>
  );
}

function Message({ msg }) {
  const isUser  = msg.role === "user";
  const isError = !isUser && msg.content?.startsWith("⚠");

  return (
    <div className="msg-anim" style={{
      display:"flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap:14, padding:"6px 0", alignItems:"flex-start",
    }}>
      {isUser ? <UserAvatar /> : <BotAvatar />}
      <div style={{
        maxWidth:"78%", display:"flex", flexDirection:"column",
        alignItems: isUser ? "flex-end" : "flex-start", gap:2,
      }}>
        <div style={{
          padding:"12px 18px",
          borderRadius: isUser
            ? `${T.radiusLg} 4px ${T.radiusLg} ${T.radiusLg}`
            : `4px ${T.radiusLg} ${T.radiusLg} ${T.radiusLg}`,
          background: isUser ? "#19c37d22" : T.surface,
          border: isUser ? "1px solid #19c37d44" : `1px solid ${T.border}`,
          fontSize:15, lineHeight:1.7,
          color: isError ? T.red : T.textPrimary,
          wordBreak:"break-word",
        }}>
          {isUser ? msg.content : renderMarkdown(msg.content)}
        </div>
        {!isUser && msg.tokenUsage && <TokenBadge usage={msg.tokenUsage} />}
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const r = 28, circ = 2 * Math.PI * r;
  const color = score >= 0.7 ? T.green : score >= 0.4 ? T.amber : T.red;
  return (
    <svg width={70} height={70} viewBox="0 0 70 70">
      <circle cx={35} cy={35} r={r} fill="none" stroke="#2a2a2a" strokeWidth={6}/>
      <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${circ*score} ${circ*(1-score)}`}
        strokeDashoffset={circ/4} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Toggle-to-speak mic button
───────────────────────────────────────────── */
function MicButton({ onTranscript, disabled }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef(null);

  const toggleRecording = useCallback(() => {
    if (recording) {
      // Stop recording
      recRef.current?.stop();
      setRecording(false);
      // Wait a moment to capture the final chunk of speech
      setTimeout(() => {
        // Grab the full text (final + any lingering interim words)
        const text = (recRef._currentFullText || recRef._finalText || "").trim();
        setInterim("");
        if (text) onTranscript(text);
        
        // Reset properties for the next recording
        recRef._finalText = "";
        recRef._currentFullText = "";
      }, 300);
    } else {
      // Start recording
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }

      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => setRecording(true);
      rec.onend = () => {
        if (recRef.current) {
            setRecording(false);
            setInterim("");
        }
      };
      rec.onerror = () => { setRecording(false); setInterim(""); };
      
      rec.onresult = (e) => {
        let final = "", inter = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else inter += e.results[i][0].transcript;
        }
        setInterim(inter);
        if (final) {
          recRef._finalText = (recRef._finalText || "") + " " + final;
        }
        // Always keep track of the absolute latest combined text
        recRef._currentFullText = (recRef._finalText || "") + " " + inter;
      };

      recRef._finalText = "";
      recRef._currentFullText = "";
      recRef.current = rec;
      rec.start();
    }
  }, [recording, onTranscript]);

  useEffect(() => {
    return () => {
      if (recRef.current) {
         recRef.current.stop();
         recRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <button
        onClick={toggleRecording}
        disabled={disabled}
        title={recording ? "Click to send" : "Click to speak"}
        className={recording ? "mic-recording" : ""}
        style={{
          width:38, height:38, borderRadius:"50%",
          background: recording ? T.red : T.surfaceHi,
          border:`1px solid ${recording ? T.red : T.border}`,
          cursor: disabled ? "not-allowed" : "pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0, transition:"background 0.15s, border-color 0.15s",
          color: recording ? "#fff" : T.textSecondary,
          opacity: disabled ? 0.4 : 1,
          userSelect:"none", WebkitUserSelect:"none",
        }}
      >
        {recording ? (
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <rect x={6} y={6} width={12} height={12} rx={2} ry={2}/>
          </svg>
        ) : (
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1={12} y1={19} x2={12} y2={23}/>
            <line x1={8}  y1={23} x2={16} y2={23}/>
          </svg>
        )}
      </button>

      {recording && (
        <div style={{
          position:"absolute", bottom:"calc(100% + 10px)",
          left:"50%", transform:"translateX(-50%)",
          background:"#1a1a1a", border:`1px solid ${T.red}44`,
          borderRadius:T.radius, padding:"8px 12px",
          fontSize:12, color:T.textSecondary,
          whiteSpace:"nowrap", maxWidth:260, overflow:"hidden",
          textOverflow:"ellipsis", zIndex:50, boxShadow:T.shadow,
        }}>
          {interim || <span style={{ color:T.textMuted }}>Listening… click to stop & send</span>}
        </div>
      )}
    </div>
  );
}

function TelemetryPanel({ telemetry, judgeScore, judgeReason, isJailbreak, onClose }) {
  const guardrail  = telemetry?.guardrail  || {};
  const retrieval  = telemetry?.retrieval  || {};
  const generation = telemetry?.generation || {};
  const latency    = telemetry?.latency_seconds;
  const hasData    = !!telemetry?.guardrail;
  const passed     = guardrail.passed !== false && !isJailbreak;

  const pct   = Math.round((judgeScore ?? 0) * 100);
  const color = (judgeScore ?? 0) >= 0.7 ? T.green : (judgeScore ?? 0) >= 0.4 ? T.amber : T.red;

  return (
    <div className="panel-anim" style={{
      width:320, flexShrink:0, background:T.sidebar,
      borderLeft:`1px solid ${T.border}`,
      display:"flex", flexDirection:"column", height:"100%", overflowY:"auto",
    }}>
      {/* header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"16px 18px 14px", borderBottom:`1px solid ${T.border}`,
        position:"sticky", top:0, background:T.sidebar, zIndex:10,
      }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.textPrimary }}>Pipeline Telemetry</div>
          <div style={{ fontSize:11, color:T.textMuted, marginTop:1 }}>LLM-as-Judge validation</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close panel">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
          </svg>
        </button>
      </div>

      <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>


        {/* ── Judge Score ── */}
        <PanelSection title="Factual Alignment Score">
          {hasData ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <ScoreRing score={judgeScore ?? 0} />
                <div>
                  <div style={{ fontSize:26, fontWeight:800, color, fontFamily:T.fontMono }}>{pct}%</div>
                  <div style={{ fontSize:12, color:T.textSecondary, marginTop:2 }}>
                    {pct >= 70 ? "High alignment" : pct >= 40 ? "Medium alignment" : "Low alignment"}
                  </div>
                </div>
              </div>
              {judgeReason && judgeReason !== "-" && (
                <div style={{
                  background:"#1a1a1a", border:`1px solid ${T.border}`,
                  borderRadius:T.radiusSm, padding:"10px 12px",
                  fontSize:12, color:T.textSecondary, lineHeight:1.6,
                }}>
                  {judgeReason}
                </div>
              )}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.textMuted, marginBottom:4 }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
                <div style={{ height:6, background:T.surface, borderRadius:99, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", width:`${pct}%`,
                    background:`linear-gradient(90deg,${color}88,${color})`,
                    borderRadius:99, transition:"width 0.6s ease",
                  }}/>
                </div>
              </div>
            </div>
          ) : <PanelEmpty text="Send a message — the judge will score the response for factual accuracy." />}
        </PanelSection>

        <PanelSection title="Guardrail">
          {hasData ? (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background: passed ? T.green : T.red }}/>
                <span style={{ fontSize:13, fontWeight:600, color: passed ? T.green : T.red }}>
                  {passed ? "Passed" : "Blocked"}
                </span>
                {guardrail.method && (
                  <span style={{
                    fontSize:10, color:T.textMuted, fontFamily:T.fontMono,
                    background:"#111", border:`1px solid ${T.border}`,
                    borderRadius:4, padding:"1px 6px",
                  }}>
                    via {guardrail.method}
                  </span>
                )}
              </div>
              {!passed && (
                <div style={{
                  background:"#1a1a1a", border:`1px solid #ef444433`,
                  borderRadius:T.radiusSm, padding:"8px 12px",
                  fontSize:12, color:"#fca5a5", lineHeight:1.5,
                }}>
                  {guardrail.reason || "Request blocked by guardrail"}
                </div>
              )}
            </div>
          ) : <PanelEmpty text="Awaiting first message" />}
        </PanelSection>

        {/* ── Retrieval ── */}
        <PanelSection title="Retrieval & Rerank">
          {retrieval.candidate_count != null ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", gap:8 }}>
                <PChip label="Candidates" value={retrieval.candidate_count} />
                <PChip label="Selected"   value={retrieval.reranked_count ?? 0} accent />
              </div>
              {retrieval.rerank_feed && (
                <div style={{
                  background:"#111", border:`1px solid ${T.border}`,
                  borderRadius:T.radiusSm, padding:"8px 10px",
                  fontSize:11, color:T.textSecondary,
                  fontFamily:T.fontMono, lineHeight:1.6, wordBreak:"break-all",
                }}>
                  {retrieval.rerank_feed}
                </div>
              )}
            </div>
          ) : <PanelEmpty text="Retrieval scores appear after a query" />}
        </PanelSection>

        {/* ── Session context ── */}
        <PanelSection title="Session Context">
          {hasData ? (
            <div style={{ display:"flex", gap:8 }}>
              <PChip label="Turns"   value={telemetry?.history_turns ?? 0} accent />
              <PChip label="Model"   value={generation.model || "—"} />
            </div>
          ) : <PanelEmpty text="Awaiting first message" />}
        </PanelSection>

        {/* ── Latency ── */}
        <PanelSection title="Pipeline Latency">
          {latency != null ? (
            <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
              <span style={{
                fontSize:26, fontWeight:800, fontFamily:T.fontMono,
                color: latency < 3 ? T.green : latency < 8 ? T.amber : T.red,
              }}>{latency.toFixed(2)}</span>
              <span style={{ fontSize:12, color:T.textMuted }}>s</span>
            </div>
          ) : <PanelEmpty text="Latency appears after first request" />}
        </PanelSection>
      </div>
    </div>
  );
}

function PanelSection({ title, children }) {
  return (
    <div style={{
      background:"#1a1a1a", border:`1px solid ${T.border}`,
      borderRadius:T.radius, padding:"14px 16px",
      display:"flex", flexDirection:"column", gap:10,
    }}>
      <div style={{
        fontSize:10, fontWeight:700, letterSpacing:"0.1em",
        textTransform:"uppercase", color:T.textMuted,
      }}>{title}</div>
      {children}
    </div>
  );
}

function PChip({ label, value, accent }) {
  return (
    <div style={{
      display:"inline-flex", flexDirection:"column", alignItems:"center",
      padding:"6px 14px", borderRadius:T.radiusSm,
      background: accent ? "#6366f115" : "#111",
      border:`1px solid ${accent ? "#6366f144" : T.border}`, gap:2,
    }}>
      <span style={{ fontSize:15, fontWeight:700, color: accent ? T.indigo : T.textPrimary, fontFamily:T.fontMono }}>
        {value}
      </span>
      <span style={{ fontSize:10, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
        {label}
      </span>
    </div>
  );
}

function PanelEmpty({ text }) {
  return <p style={{ fontSize:12, color:T.textMuted, lineHeight:1.6 }}>{text}</p>;
}

/* ─────────────────────────────────────────────
   Main App
───────────────────────────────────────────── */
export default function App() {
  useGlobalStyles();

  const [sessionId] = useState(
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );

  const [messages,   setMessages]   = useState([{
    role:"assistant",
    content:"Hello! I'm your Enterprise Knowledge Assistant. Ask me anything about company policies, products, or HR guidelines — I'll retrieve grounded answers using Hybrid Search and validate them with Multi-Agent RAG.",
  }]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [panelOpen,  setPanelOpen]  = useState(true);

  const [telemetry,  setTelemetry]  = useState({});
  const [judgeScore, setJudgeScore] = useState(null);
  const [judgeReason,setJudgeReason]= useState("");
  const [isJailbreak,setIsJailbreak]= useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const sendMessage = useCallback(async (override) => {
    const trimmed = (override ?? input).trim();
    if (!trimmed || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role:"user", content:trimmed }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message:trimmed, session_id:sessionId }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);

      const data = await res.json();
      const score  = data.judge_score ?? null;
      const reason = data.judge_reason ?? "";

      setTelemetry(data.telemetry || {});
      setJudgeScore(score);
      setJudgeReason(reason);
      setIsJailbreak(data.is_jailbreak ?? false);

      setMessages(prev => [...prev, {
        role:"assistant",
        content: data.answer,
        tokenUsage: data.token_usage,
      }]);

    } catch (err) {
      setMessages(prev => [...prev, { role:"assistant", content:`⚠ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, loading, sessionId]);

  const handleVoiceTranscript = useCallback((text) => {
    setInput(text);
    sendMessage(text);
  }, [sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div style={{
      display:"flex", height:"100vh", overflow:"hidden",
      background:T.bg, color:T.textPrimary, fontFamily:T.fontSans,
    }}>

      {/* ── Chat column ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        {/* Header */}
        <header style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"14px 20px", borderBottom:`1px solid ${T.border}`,
          background:T.sidebar, flexShrink:0,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:32, height:32, borderRadius:8,
              background:"linear-gradient(135deg,#6d28d9,#4f46e5)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                   stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
                <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
                <circle cx={9} cy={13} r={1} fill="#fff" stroke="none"/>
                <circle cx={15} cy={13} r={1} fill="#fff" stroke="none"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>Enterprise Knowledge Assistant</div>
              <div style={{ fontSize:11, color:T.textMuted }}>Multi-agent RAG · LangGraph · Hybrid Search</div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:T.green }}/>
              <span style={{ fontSize:12, color:T.textSecondary }}>Live</span>
            </div>
            <button
              className="icon-btn"
              onClick={() => setPanelOpen(o => !o)}
              style={{
                padding:"6px 12px", borderRadius:T.radiusSm,
                background: panelOpen ? "#6366f122" : "transparent",
                border:`1px solid ${panelOpen ? "#6366f144" : T.border}`,
                color: panelOpen ? T.indigo : T.textSecondary,
                fontSize:12, fontWeight:600, display:"flex", gap:6,
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x={3} y={3} width={7} height={18} rx={1}/>
                <rect x={14} y={3} width={7} height={10} rx={1}/>
                <rect x={14} y={17} width={7} height={4} rx={1}/>
              </svg>
              {panelOpen ? "Hide" : "Telemetry"}
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 0", display:"flex", flexDirection:"column" }}>
          <div style={{ maxWidth:760, width:"100%", margin:"0 auto", padding:"0 24px" }}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding:"16px 24px 20px", background:T.bg, flexShrink:0 }}>
          <div style={{ maxWidth:760, margin:"0 auto" }}>
            <div style={{
              display:"flex", alignItems:"flex-end", gap:8,
              background:T.surface, border:`1px solid ${T.border}`,
              borderRadius:16, padding:"10px 12px 10px 16px",
              boxShadow:"0 2px 12px rgba(0,0,0,0.3)",
            }}>
              
              {/* Toggle-to-speak mic */}
              <MicButton onTranscript={handleVoiceTranscript} disabled={loading} />

              {/* textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Enterprise Assistant…"
                disabled={loading}
                rows={1}
                style={{
                  flex:1, background:"none", border:"none", outline:"none",
                  color:T.textPrimary, fontSize:15, fontFamily:T.fontSans,
                  resize:"none", lineHeight:1.6, maxHeight:160, overflowY:"auto", paddingTop:2,
                }}
              />

              {/* Send */}
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={!canSend}
                style={{
                  width:34, height:34, borderRadius:8,
                  background: canSend ? "#19c37d" : "#333",
                  border:"none", cursor: canSend ? "pointer" : "not-allowed",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}
              >
                {loading ? (
                  <span style={{
                    width:14, height:14,
                    border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff",
                    borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block",
                  }}/>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                       stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={22} y1={2} x2={11} y2={13}/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#fff" stroke="none"/>
                  </svg>
                )}
              </button>
            </div>

            <p style={{ textAlign:"center", fontSize:11, color:T.textMuted, marginTop:8 }}>
              Enter to send · Shift+Enter for new line · Click 🎙 to speak, click again to send
            </p>
          </div>
        </div>
      </div>

      {/* ── Telemetry panel ── */}
      {panelOpen && (
        <TelemetryPanel
          telemetry={telemetry}
          judgeScore={judgeScore}
          judgeReason={judgeReason}
          isJailbreak={isJailbreak}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
