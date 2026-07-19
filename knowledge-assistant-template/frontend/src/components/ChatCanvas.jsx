import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.jsx";
import { mockPrompts } from "../data/mockData.js";

export default function ChatCanvas({
  messages,
  isThinking,
  onSend,
  activeSourceId,
  onCiteClick,
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  const submit = () => {
    if (!draft.trim() || isThinking) return;
    onSend(draft);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="chat-canvas">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Ask anything about your knowledge base</h2>
            <p>
              Answers are generated from your ingested documents and every
              claim links back to its source.
            </p>
            <div className="empty-state__prompts">
              {mockPrompts.map((p) => (
                <button key={p} className="empty-state__prompt" onClick={() => onSend(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              activeSourceId={activeSourceId}
              onCiteClick={onCiteClick}
            />
          ))
        )}

        {isThinking && (
          <div className="msg msg--assistant">
            <span className="msg__role">Assistant</span>
            <div className="msg__bubble">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer__box">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask a question about your documents..."
            value={draft}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
          />
          <button className="composer__send" onClick={submit} disabled={!draft.trim() || isThinking} aria-label="Send">
            ↑
          </button>
        </div>
        <div className="composer__hint">Enter to send · Shift+Enter for a new line</div>
      </div>
    </div>
  );
}
