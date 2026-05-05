import "../styles/privacy-consent.css";

type Props = {
  onDecide: (consent: "granted" | "denied" | "later") => void;
};

export function PrivacyConsent({ onDecide }: Props) {
  return (
    <div className="consent-scrim">
      <div className="consent-card">
        <div className="consent-eyebrow">★ a small ask</div>
        <h2 className="consent-title">
          Help shape <em>platter</em>.
        </h2>

        <p className="consent-body">
          Share <strong>anonymous</strong> usage stats so I can see what's working and what
          isn't. No file paths, no contents, no account. Just a random device ID and a
          short list of events like "review started" and "settings opened".
        </p>

        <ul className="consent-list">
          <li>
            <span className="consent-tick consent-tick--yes">✓</span>
            <span>Random device UUID + event names + small structured payloads</span>
          </li>
          <li>
            <span className="consent-tick consent-tick--yes">✓</span>
            <span>Stored on Cloudflare D1 in a database I own</span>
          </li>
          <li>
            <span className="consent-tick consent-tick--no">×</span>
            <span>No file paths, file contents, or anything you've made</span>
          </li>
          <li>
            <span className="consent-tick consent-tick--no">×</span>
            <span>No third-party trackers (no PostHog, Mixpanel, GA, etc.)</span>
          </li>
          <li>
            <span className="consent-tick consent-tick--no">×</span>
            <span>Never required — change your mind any time in Settings → Privacy</span>
          </li>
        </ul>

        <div className="consent-actions">
          <button className="consent-btn consent-btn--ghost" onClick={() => onDecide("denied")}>
            No thanks
          </button>
          <button className="consent-btn consent-btn--ghost" onClick={() => onDecide("later")}>
            Decide later
          </button>
          <button className="consent-btn consent-btn--primary" onClick={() => onDecide("granted")}>
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Share stats
          </button>
        </div>

        <a
          className="consent-foot"
          href="https://github.com/rudraptpsingh/platter/blob/main/docs/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the full privacy policy →
        </a>
      </div>
    </div>
  );
}
