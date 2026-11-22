import { BrandLogo, BrandWatermark } from "../../components/Brand";
import { AppFooter } from "../../components/ui";
import { DocsPage } from "./DocsPage";

/**
 * The public documentation page at `#/docs`. It renders without authentication and
 * without the dashboard shell, so a prospective integrator can read it before signing in.
 */
export function DocsPublic({ onExit }: { onExit: () => void }) {
  return (
    <div className="docs-public">
      <header className="docs-public-top">
        <div className="brand"><BrandLogo size={30} /> REALMSTACK</div>
        <div className="docs-public-actions">
          <a className="button secondary" href="https://zykosince94.github.io" target="_blank" rel="noreferrer">Website</a>
          <button type="button" className="button primary" onClick={onExit}>Sign in</button>
        </div>
      </header>
      <main className="docs-public-main">
        <DocsPage />
      </main>
      <AppFooter />
      <BrandWatermark />
    </div>
  );
}
