import { useEffect, useId, useRef, useState } from "react";

export default function AdminSearchBox({
  value,
  onChange,
  suggestions = [],
  onPick,
  placeholder = "Поиск…",
  id: idProp,
  className = "",
  style,
  inputClassName = "adm-search",
  ariaLabel = "Поиск"
}) {
  const autoId = useId();
  const inputId = idProp || autoId;
  const listId = `${inputId}-suggestions`;
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const hasQuery = Boolean(value.trim());
  const showList = open && hasQuery && suggestions.length > 0;

  useEffect(() => {
    setActiveIdx(-1);
  }, [value, suggestions.length]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function pickSuggestion(suggestion, idx) {
    onPick?.(suggestion, idx);
    setOpen(false);
    setActiveIdx(-1);
  }

  function onKeyDown(e) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx], activeIdx);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  return (
    <div ref={wrapRef} className={`adm-search-wrap${className ? ` ${className}` : ""}`} style={style}>
      <input
        id={inputId}
        type="search"
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {showList ? (
        <ul id={listId} className="adm-search-suggestions" role="listbox">
          {suggestions.map((s, idx) => (
            <li key={s.key ?? `${s.label}-${idx}`} role="option" aria-selected={idx === activeIdx}>
              <button
                type="button"
                className={idx === activeIdx ? "adm-search-suggestion active" : "adm-search-suggestion"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(s, idx)}
              >
                <span className="adm-search-suggestion-label">{s.label}</span>
                {s.meta ? <span className="adm-search-suggestion-meta">{s.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
