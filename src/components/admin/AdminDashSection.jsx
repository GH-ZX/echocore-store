export default function AdminDashSection({
  title,
  description,
  action = null,
  icon: Icon = null,
  children,
  className = '',
}) {
  return (
    <section className={`admin-dash-section ${className}`.trim()}>
      <header className="admin-dash-section__head">
        <div className="admin-dash-section__title-block">
          {Icon ? (
            <span className="admin-dash-section__badge" aria-hidden="true">
              <Icon strokeWidth={2} />
            </span>
          ) : null}
          <div className="admin-dash-section__titles">
            <h2 className="admin-dash-section__title">{title}</h2>
            {description ? (
              <p className="admin-dash-section__desc">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="admin-dash-section__action">{action}</div> : null}
      </header>
      <div className="admin-dash-section__body">{children}</div>
    </section>
  );
}
