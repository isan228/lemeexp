const paths = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z",
  lessons: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 3v2h10V7H7Zm0 4v2h6v-2H7Z",
  favorites: "M12 17.3 6.2 21l1.6-6.7L2 9.5l6.9-.6L12 2.5l3.1 6.4 6.9.6-5.8 4.8 1.6 6.7L12 17.3Z",
  profile: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z",
  leaderboard: "M4 20h4V9H4v11Zm6 0h4V4h-4v16Zm6 0h4v-8h-4v8Z",
  support: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4.5L12 20v-4H6a2 2 0 0 1-2-2V6Z"
};

export default function NavIcon({ name }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
