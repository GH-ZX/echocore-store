export default function PageLoader({ t }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[var(--text-sec)] animate-pulse">
        {t.loadingAdminTab}
      </div>
    </div>
  );
}