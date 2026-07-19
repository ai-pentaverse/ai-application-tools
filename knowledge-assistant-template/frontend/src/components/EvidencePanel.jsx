export default function EvidencePanel({ sources, activeSourceId, onSelect }) {
  return (
    <aside className="evidence-panel">
      <div className="evidence-panel__header">
        <div className="evidence-panel__title">Evidence</div>
        <div className="evidence-panel__subtitle">
          Passages the answer was grounded in
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="evidence-empty">
          Sources for the current answer will appear here, linked to each citation marker.
        </div>
      ) : (
        <div className="evidence-panel__list">
          {sources.map((s, i) => (
            <div
              key={s.id}
              id={`source-${s.id}`}
              className={`source-card ${s.id === activeSourceId ? "source-card--active" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="source-card__top">
                <span className="source-card__num">{i + 1}</span>
                <span className="source-card__name">{s.title}</span>
              </div>
              <div className="source-card__meta">{s.location}</div>
              <div className="source-card__excerpt">"{s.excerpt}"</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
