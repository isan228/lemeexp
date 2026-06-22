import { Link } from "react-router-dom";
import { routes, site } from "../config/site.js";

/** Логотип + название, ведут на главную. */
export default function SiteBrand({ className = "landing-brand", showLogo = true }) {
  return (
    <Link to={routes.home} className={`${className} site-brand-link${showLogo ? "" : " site-brand-text-only"}`}>
      {showLogo ? (
        <span className="logo-mark">
          <img src="/9ff6137d-ee1d-4cd6-a762-9795d7540eae.svg" alt={site.name} className="logo-mark-img" />
        </span>
      ) : null}
      <span className="logo-text">{site.name}</span>
    </Link>
  );
}
