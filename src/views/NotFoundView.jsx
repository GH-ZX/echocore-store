export default function NotFoundView({ t = {}, navigate }) {
  return (
    <div className="max-w-lg mx-auto mt-16 sm:mt-24 px-4 text-center animate-fade-in">
      <p className="text-7xl font-black text-[var(--accent)]/30 mb-2">404</p>
      <h1 className="text-2xl sm:text-3xl font-black mb-3">
        {t.pageNotFound}
      </h1>
      <p className="text-[var(--text-sec)] mb-8 leading-relaxed">
        {t.pageNotFoundDesc}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" onClick={() => navigate('/')} className="btn btn-primary">
          {t.backToHome}
        </button>
        <button type="button" onClick={() => navigate('/games')} className="btn btn-secondary">
          {t.browseGames}
        </button>
      </div>
    </div>
  );
}