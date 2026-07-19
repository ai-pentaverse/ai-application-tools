// Splits assistant text on [n] citation markers and renders each as an
// interactive chip that syncs with the Evidence panel on the right.
function renderWithCitations(text, sources, activeSourceId, onCiteClick) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) return <span key={i}>{part}</span>;
    const num = Number(match[1]);
    const source = sources[num - 1];
    if (!source) return <span key={i}>{part}</span>;
    const isActive = source.id === activeSourceId;
    return (
      <button
        key={i}
        className={`cite ${isActive ? "cite--active" : ""}`}
        onClick={() => onCiteClick(source.id)}
        title={source.title}
      >
        {num}
      </button>
    );
  });
}

export default function MessageBubble({ message, activeSourceId, onCiteClick }) {
  const isUser = message.role === "user";
  const confidencePct = Math.round((message.confidence ?? 0) * 100);
  const isLow = confidencePct > 0 && confidencePct < 70;

  return (
    <div className={`msg ${isUser ? "msg--user" : "msg--assistant"}`}>
      <span className="msg__role">{isUser ? "You" : "Assistant"}</span>
      <div className="msg__bubble">
        <p>
          {isUser || !message.sources
            ? message.text
            : renderWithCitations(message.text, message.sources, activeSourceId, onCiteClick)}
        </p>
      </div>
      {!isUser && !message.error && message.confidence != null && (
        <div className={`confidence ${isLow ? "confidence--low" : ""}`}>
          <span className="confidence__bar">
            <span className="confidence__fill" style={{ width: `${confidencePct}%` }} />
          </span>
          {confidencePct}% confidence
        </div>
      )}
    </div>
  );
}
