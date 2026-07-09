export default function LegalPageView({ title, sections = [], lang = 'ar' }) {
  const isAr = lang === 'ar';

  return (
    <div className="max-w-3xl mx-auto mt-8 sm:mt-12 px-2 animate-fade-in">
      <div className="card p-6 sm:p-10">
        <h1 className="text-3xl font-black mb-2">{title}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">
          {isAr ? 'آخر تحديث: يوليو 2026' : 'Last updated: July 2026'}
        </p>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-bold text-[var(--accent)] mb-3">{section.heading}</h2>
              <div className="space-y-3 text-[var(--text-secondary)] leading-relaxed text-sm sm:text-[15px]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}