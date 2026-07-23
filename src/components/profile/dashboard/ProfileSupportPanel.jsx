import { MessageSquare, Inbox, HelpCircle, ExternalLink } from 'lucide-react';

export default function ProfileSupportPanel({ t = {}, navigate }) {
  const links = [
    {
      icon: MessageSquare,
      label: t.supportMenuLabel || t.support,
      desc: t.dashSupportContactDesc,
      path: '/support',
    },
    {
      icon: HelpCircle,
      label: t.faq || t.faqTitle,
      desc: t.dashSupportFaqDesc,
      path: '/faq',
    },
    {
      icon: Inbox,
      label: t.siteInboxTitle,
      desc: t.dashSupportInboxDesc,
      path: '/notifications',
    },
    {
      icon: MessageSquare,
      label: t.contactUs || t.contact,
      desc: t.dashSupportMessageDesc,
      path: '/contact',
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        {t.dashSupportHelp}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {links.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate?.(item.path)}
            className="card p-4 text-start hover:border-[var(--accent)]/40 transition-colors border border-[var(--border)]"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm flex items-center gap-1">
                  {item.label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
