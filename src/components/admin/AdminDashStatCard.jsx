const TONE_CLASS = {
  games: 'admin-dash-stat--games',
  topup: 'admin-dash-stat--topup',
  gift: 'admin-dash-stat--gift',
  orders: 'admin-dash-stat--orders',
  revenue: 'admin-dash-stat--revenue',
  profit: 'admin-dash-stat--profit',
  margin: 'admin-dash-stat--margin',
  cost: 'admin-dash-stat--cost',
  catalog: 'admin-dash-stat--catalog',
};

export default function AdminDashStatCard({
  tone = 'games',
  label,
  value,
  help,
  icon: Icon,
  className = '',
}) {
  return (
    <article className={`admin-dash-stat ${TONE_CLASS[tone] || ''} ${className}`.trim()}>
      <div className="admin-dash-stat__accent" aria-hidden="true" />
      <div className="admin-dash-stat__inner">
        <div className="admin-dash-stat__icon-wrap">
          {Icon ? <Icon className="admin-dash-stat__icon" strokeWidth={2} /> : null}
        </div>
        <div className="admin-dash-stat__body">
          <span className="admin-dash-stat__label">{label}</span>
          <span className="admin-dash-stat__value">{value}</span>
          {help ? <p className="admin-dash-stat__help">{help}</p> : null}
        </div>
      </div>
    </article>
  );
}