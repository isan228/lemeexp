import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function FavoriteButton({
  videoId,
  className = "",
  size = "md",
  showLabel = false
}) {
  const { isVideoFavorite, toggleFavorite } = useAuth();
  const [pending, setPending] = useState(false);
  const vid = Number(videoId);
  const favorited = isVideoFavorite(vid);

  if (!Number.isFinite(vid) || vid <= 0) return null;

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      await toggleFavorite(vid);
    } finally {
      setPending(false);
    }
  }

  const label = favorited ? "В избранном" : "В избранное";

  return (
    <button
      type="button"
      className={`favorite-btn favorite-btn--${size}${favorited ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={label}
      title={label}
    >
      <span className="favorite-btn-icon" aria-hidden="true">
        {favorited ? "★" : "☆"}
      </span>
      {showLabel ? <span className="favorite-btn-label">{label}</span> : null}
    </button>
  );
}
