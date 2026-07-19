export default function Header({ title, sourceCount }) {
  return (
    <header className="header">
      <div>
        <div className="header__title">{title}</div>
        <div className="header__meta">
          {sourceCount > 0
            ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} cited in this answer`
            : "Ask a question grounded in your knowledge base"}
        </div>
      </div>
      <div className="header__actions">
        <button className="btn">Export</button>
        <button className="btn btn--primary">Share</button>
      </div>
    </header>
  );
}
