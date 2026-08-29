/**
 * A slow colour wash behind the whole app.
 *
 * Purely decorative, so it is hidden from assistive technology and cannot
 * receive pointer events — it must never intercept a click meant for the UI.
 * All of the work is in globals.css; this is only the markup.
 */
export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden>
      <span className="ambient-field ambient-field-1" />
      <span className="ambient-field ambient-field-2" />
      <span className="ambient-field ambient-field-3" />
    </div>
  );
}
