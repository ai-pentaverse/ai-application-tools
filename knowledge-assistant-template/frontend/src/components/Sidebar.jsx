export default function Sidebar({ conversations, activeId, onSelect, onNew, onOpenUpload }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__mark">K</div>
        <div>
          <div className="sidebar__title">Knowledge Assistant</div>
          <div className="sidebar__subtitle">Enterprise RAG</div>
        </div>
      </div>

      <div className="sidebar__section">
        <button className="sidebar__new-btn" onClick={onNew}>
          + New question
        </button>
      </div>

      <div className="sidebar__section" style={{ paddingBottom: 0 }}>
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", background: "transparent", color: "var(--text-inverse)", borderColor: "var(--ink-soft)" }}
          onClick={onOpenUpload}
        >
          ⇪ Add documents
        </button>
      </div>

      <div className="sidebar__section-label" style={{ marginTop: 12 }}>
        Recent
      </div>
      <ul className="sidebar__list">
        {conversations.map((c) => (
          <li
            key={c.id}
            className={`sidebar__item ${c.id === activeId ? "sidebar__item--active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            {c.title}
          </li>
        ))}
      </ul>

      <div className="sidebar__footer">
        <span className="status-dot" />
        Knowledge base synced
      </div>
    </aside>
  );
}
