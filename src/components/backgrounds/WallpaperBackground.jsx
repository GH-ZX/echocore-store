/**
 * Wallpaper background — renders an admin-chosen image.
 * The image URL lives on the `--wallpaper-url` CSS custom property and is
 * set via the theme system (applyTheme) from the admin Appearance panel.
 */
export default function WallpaperBackground() {
  return (
    <div className="store-bg store-bg-wallpaper-layer" aria-hidden="true">
      <div className="store-bg-wallpaper" />
      <div className="store-bg-wallpaper-scrim" />
      <div className="store-bg-wallpaper-vignette" />
    </div>
  );
}