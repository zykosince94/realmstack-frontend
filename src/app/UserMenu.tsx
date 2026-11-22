import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { BookOpen, ChevronDown, LogOut, Settings } from "lucide-react";

/**
 * The account menu behind the top-right avatar. The avatar used to sign out on click,
 * which made one stray click end the session; now it opens a menu (Settings,
 * Documentation, Log out).
 *
 * It follows the ARIA menu-button pattern: the button says it has a menu and whether it is
 * open, opening moves focus to the first item, arrow keys move between items, Escape
 * closes and returns focus to the button, and a click outside closes it.
 */
export function UserMenu({ email, onDocs, onSettings, onSignOut }: { email: string; onDocs: () => void; onSettings: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }
  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = items.current.filter((item): item is HTMLButtonElement => item !== null);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "ArrowDown") { event.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }
  function choose(action: () => void) {
    close(false);
    action();
  }

  return (
    <div className="user-menu" ref={root}>
      <button ref={button} className="user-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen(!open)}>
        <span className="top-avatar">{email.slice(0, 1).toUpperCase()}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="user-menu-panel" role="menu" aria-label="Account" onKeyDown={onMenuKey}>
          <div className="user-menu-head" role="presentation"><b>{email}</b><small>Workspace owner</small></div>
          <button ref={(el) => { items.current[0] = el; }} role="menuitem" className="user-menu-item" onClick={() => choose(onSettings)}><Settings size={17} /> Settings</button>
          <button ref={(el) => { items.current[1] = el; }} role="menuitem" className="user-menu-item" onClick={() => choose(onDocs)}><BookOpen size={17} /> Documentation</button>
          <button ref={(el) => { items.current[2] = el; }} role="menuitem" className="user-menu-item danger" onClick={() => choose(onSignOut)}><LogOut size={17} /> Log out</button>
        </div>
      )}
    </div>
  );
}
