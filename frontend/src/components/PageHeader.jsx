export default function PageHeader({ kicker, title, intro, actions, children }) {
  return (
    <header className="student-page-head">
      {kicker ? <p className="student-page-kicker">{kicker}</p> : null}
      <div className="student-page-head-row">
        <div className="student-page-head-text">
          <h1>{title}</h1>
          {intro ? <p className="subtitle student-page-intro">{intro}</p> : null}
        </div>
        {actions ? <div className="student-page-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
