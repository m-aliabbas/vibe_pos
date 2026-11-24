'use client';

/**
 * App-wide keyboard layer (Odoo-style):
 *  - Hold Alt to see hotkey badges; Alt+<key> presses the badged control.
 *    Alt+1…0 = top menu, Alt+N = New/Add on the page, Alt+S (or Ctrl+Enter) = save in an open window.
 *  - Ctrl+K = command palette (jump to any screen).
 *  - "/" = focus the page's search box.
 *  - ↑/↓ (or J/K), Home/End = move through table rows; Enter = open/act; ←/→ move between row buttons.
 *  - PageDown/PageUp = next/previous page of a list.
 *  - "?" (or F1 outside Sales) = keyboard help.
 * Controls opt in with data-hotkey="x"; common ones are detected automatically.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Keyboard, Search, CornerDownLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getMoreItems, getNavItems, navHotkey, type NavItem } from '@/lib/nav';

type Hint = { key: string; top: number; left: number };

const NEW_RE = /^\s*\+?\s*(add|new|create)\b/i;
const CANCEL_RE = /^\s*(cancel|close|no|back|discard|dismiss)\b/i;
const NEXT_RE = /^\s*(next|›|»|>)\s*$/i;
const PREV_RE = /^\s*(prev(ious)?|‹|«|<)\s*$/i;

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type);
  }
  return el.getAttribute('role') === 'combobox';
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function topLayer(): HTMLElement | null {
  const layers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open]'
    )
  ).filter(isVisible);
  return layers.length ? layers[layers.length - 1] : null;
}

function isEnabled(el: HTMLElement) {
  return !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
}

function textOf(el: HTMLElement) {
  return (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
}

/** Every hotkey currently available, scoped to the top-most open window when there is one. */
function collectHotkeys(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  const layer = topLayer();
  const scope: ParentNode = layer ?? document;

  scope.querySelectorAll<HTMLElement>('[data-hotkey]').forEach((el) => {
    if (!isVisible(el) || !isEnabled(el)) return;
    if (!layer && el.closest('[role=dialog],[role=alertdialog]')) return;
    const key = el.dataset.hotkey!.toLowerCase();
    if (!map.has(key)) map.set(key, el);
  });

  if (layer) {
    if (!map.has('s')) {
      const footerButtons = Array.from(
        layer.querySelectorAll<HTMLElement>('[data-slot=dialog-footer] button, [data-slot=alert-dialog-footer] button, button[type=submit]')
      ).filter((b) => isVisible(b) && isEnabled(b) && !CANCEL_RE.test(textOf(b)));
      const primary = footerButtons[footerButtons.length - 1];
      if (primary) map.set('s', primary);
    }
  } else {
    const main = document.querySelector('main');
    if (main && !map.has('n')) {
      // Page-level "Add/New/Create" button: visible label only, never a per-row action.
      const candidates = Array.from(main.querySelectorAll<HTMLElement>('button, a')).filter(
        (b) => isVisible(b) && isEnabled(b) && !b.closest('tr')
      );
      const label = (b: HTMLElement) => (b.innerText || '').trim();
      const add =
        candidates.find((b) => NEW_RE.test(label(b))) ??
        candidates.find((b) => /\b(new|add|create)\b/i.test(label(b)) && label(b).length <= 40);
      if (add) map.set('n', add);
    }
  }
  return map;
}

function activate(el: HTMLElement) {
  if (isTyping(el) && el.getAttribute('role') !== 'combobox') {
    el.focus();
    (el as HTMLInputElement).select?.();
    return;
  }
  // Pressing a button by hotkey must not steal the cursor from a field the user is
  // typing in (e.g. Alt+2 = Card while entering Amount Paid).
  if (isTyping(document.activeElement)) {
    el.click();
    return;
  }
  el.focus();
  el.click();
}

function findSearchInput(): HTMLInputElement | null {
  const main = document.querySelector('main');
  if (!main) return null;
  const candidates = Array.from(
    main.querySelectorAll<HTMLInputElement>('input[type=search], input[placeholder*="earch" i], input[aria-label*="earch" i]')
  ).filter((i) => isVisible(i) && !i.disabled);
  return candidates[0] ?? null;
}

function listRows(preferred: HTMLTableSectionElement | null): { body: HTMLTableSectionElement | null; rows: HTMLTableRowElement[] } {
  const main = document.querySelector('main');
  if (!main) return { body: null, rows: [] };
  const bodies = Array.from(main.querySelectorAll<HTMLTableSectionElement>('tbody')).filter(isVisible);
  const pick = (b: HTMLTableSectionElement) =>
    Array.from(b.rows).filter((r) => isVisible(r) && !(r.cells.length === 1 && r.cells[0].colSpan > 1));
  const ordered = preferred && bodies.includes(preferred) ? [preferred, ...bodies.filter((b) => b !== preferred)] : bodies;
  for (const body of ordered) {
    const rows = pick(body);
    if (rows.length) return { body, rows };
  }
  return { body: null, rows: [] };
}

function rowActions(row: HTMLTableRowElement) {
  return Array.from(row.querySelectorAll<HTMLElement>('a[href], button, input, [role=checkbox]')).filter(
    (el) => isVisible(el) && isEnabled(el)
  );
}

export function KeyboardLayer() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const [hints, setHints] = useState<Hint[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const activeBodyRef = useRef<HTMLTableSectionElement | null>(null);
  const activeIndexRef = useRef(-1);

  const onSales = pathname === '/sales';
  const enabled = Boolean(user) && pathname !== '/login';

  const clearRowCursor = useCallback(() => {
    document.querySelectorAll('[data-kbd-active]').forEach((r) => r.removeAttribute('data-kbd-active'));
    activeIndexRef.current = -1;
  }, []);

  // Reset the row cursor whenever the screen changes.
  useEffect(() => {
    clearRowCursor();
    activeBodyRef.current = null;
  }, [pathname, clearRowCursor]);

  const showHints = useCallback(() => {
    const next: Hint[] = [];
    collectHotkeys().forEach((el, key) => {
      const r = el.getBoundingClientRect();
      next.push({ key: key.toUpperCase(), top: Math.max(2, r.top - 8), left: Math.max(2, r.left - 6) });
    });
    setHints(next);
  }, []);

  const moveRow = useCallback((delta: number | 'first' | 'last') => {
    const { body, rows } = listRows(activeBodyRef.current);
    if (!body || rows.length === 0) return false;
    const current = rows.findIndex((r) => r.hasAttribute('data-kbd-active'));
    let index: number;
    if (delta === 'first') index = 0;
    else if (delta === 'last') index = rows.length - 1;
    else index = current < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + delta));

    // Keep focus on the same action column when moving with focus inside a row.
    const focused = document.activeElement as HTMLElement | null;
    const focusedRow = focused?.closest('tr');
    const actionIndex = focusedRow && current >= 0 ? rowActions(rows[current]).indexOf(focused!) : -1;

    rows.forEach((r) => r.removeAttribute('data-kbd-active'));
    const row = rows[index];
    row.setAttribute('data-kbd-active', 'true');
    row.scrollIntoView({ block: 'nearest' });
    activeBodyRef.current = body;
    activeIndexRef.current = index;

    if (actionIndex >= 0) {
      rowActions(row)[actionIndex]?.focus();
    } else if (focused && focused !== document.body && focusedRow) {
      focused.blur();
    }
    return true;
  }, []);

  const openActiveRow = useCallback(() => {
    const row = document.querySelector<HTMLTableRowElement>('main tr[data-kbd-active]');
    if (!row) return false;
    if (row.classList.contains('cursor-pointer') || row.getAttribute('role') === 'button') {
      row.click();
      return true;
    }
    const link = row.querySelector<HTMLElement>('a[href]');
    if (link) {
      link.click();
      return true;
    }
    const first = rowActions(row)[0];
    if (first) {
      first.focus();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        if (!e.repeat) showHints();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        setHints([]);
        setPaletteOpen((open) => !open);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const m = e.code.match(/^(?:Key([A-Z])|Digit([0-9]))$/);
        if (!m) return;
        const key = (m[1] || m[2]).toLowerCase();
        const target = collectHotkeys().get(key);
        if (target) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setHints([]);
          activate(target);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && topLayer()) {
        const target = collectHotkeys().get('s');
        if (target) {
          e.preventDefault();
          target.click();
        }
        return;
      }

      if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
      const typing = isTyping(document.activeElement);

      if (!typing && e.key === '?') {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (e.key === 'F1' && !onSales) {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (typing || onSales || topLayer()) return;

      if (e.key === '/') {
        const input = findSearchInput();
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      if (e.key === 'PageDown' || e.key === 'PageUp') {
        const re = e.key === 'PageDown' ? NEXT_RE : PREV_RE;
        const btn = Array.from(document.querySelectorAll<HTMLElement>('main button')).find(
          (b) => isVisible(b) && isEnabled(b) && (re.test(textOf(b)) || re.test(b.getAttribute('aria-label') || ''))
        );
        if (btn) {
          e.preventDefault();
          btn.click();
          clearRowCursor();
        }
        return;
      }

      const focused = document.activeElement as HTMLElement | null;
      const focusedRow = focused?.closest('main tr');

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          if (moveRow(1)) e.preventDefault();
          return;
        case 'ArrowUp':
        case 'k':
          if (moveRow(-1)) e.preventDefault();
          return;
        case 'Home':
          if (moveRow('first')) e.preventDefault();
          return;
        case 'End':
          if (moveRow('last')) e.preventDefault();
          return;
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (!focusedRow) return;
          const actions = rowActions(focusedRow as HTMLTableRowElement);
          const i = actions.indexOf(focused!);
          const next = actions[i + (e.key === 'ArrowRight' ? 1 : -1)];
          if (next) {
            e.preventDefault();
            next.focus();
          }
          return;
        }
        case 'Enter':
          if (focusedRow && focused !== document.body) return; // let the focused button handle Enter
          if (openActiveRow()) e.preventDefault();
          return;
        case 'Escape':
          if (focusedRow) {
            focused?.blur();
            e.preventDefault();
          } else if (document.querySelector('main tr[data-kbd-active]')) {
            clearRowCursor();
            e.preventDefault();
          }
          return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault(); // keep Windows from focusing the window menu
        setHints([]);
      }
    };
    const hide = () => setHints([]);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [enabled, onSales, showHints, moveRow, openActiveRow, clearRowCursor]);

  if (!enabled) return null;

  return (
    <>
      {hints.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[1000]" aria-hidden="true">
          {hints.map((h) => (
            <span
              key={`${h.key}-${h.top}-${h.left}`}
              className="kbd-hint absolute"
              style={{ top: h.top, left: h.left }}
            >
              {h.key}
            </span>
          ))}
        </div>
      )}
      {paletteOpen && <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        role={user?.role}
        onNavigate={(href) => {
          setPaletteOpen(false);
          router.push(href);
        }}
        onHelp={() => {
          setPaletteOpen(false);
          setHelpOpen(true);
        }}
      />}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" /> Keyboard shortcuts
            </DialogTitle>
            <DialogDescription>Work on every screen without the mouse. Hold Alt to see the keys on screen.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            {GLOBAL_SHORTCUTS.map((group) => (
              <div key={group.title} className="rounded-md border p-3">
                <p className="mb-2 font-semibold">{group.title}</p>
                <dl className="space-y-1">
                  {group.rows.map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3">
                      <dt>
                        <kbd className="kbd">{key}</kbd>
                      </dt>
                      <dd className="text-right text-muted-foreground">{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {onSales && (
            <p className="text-xs text-muted-foreground">On the Sales screen press F1 for the cashier keys (F2 search, F3 cart, F9 checkout …).</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const GLOBAL_SHORTCUTS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Anywhere',
    rows: [
      ['Alt (hold)', 'Show keys on screen'],
      ['Alt+1 … Alt+0', 'Open a menu'],
      ['Ctrl+K', 'Jump to any screen'],
      ['?', 'This help'],
    ],
  },
  {
    title: 'Lists',
    rows: [
      ['/', 'Search'],
      ['↑ / ↓  or  J / K', 'Move between rows'],
      ['Enter', 'Open row / go to its buttons'],
      ['← / →', 'Move between row buttons'],
      ['PageDown / PageUp', 'Next / previous page'],
      ['Alt+N', 'New / Add'],
    ],
  },
  {
    title: 'Windows & forms',
    rows: [
      ['Tab / Shift+Tab', 'Next / previous field'],
      ['Alt+S  or  Ctrl+Enter', 'Save / confirm'],
      ['Esc', 'Close'],
    ],
  },
  {
    title: 'Sales screen',
    rows: [
      ['F2 / F3', 'Search / cart'],
      ['F6', 'Sell by amount'],
      ['F8 / F9', 'Hold / checkout'],
      ['Ctrl+B', 'Stop selling product'],
    ],
  },
];

function CommandPalette({
  open,
  onOpenChange,
  role,
  onNavigate,
  onHelp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: string | null;
  onNavigate: (href: string) => void;
  onHelp: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    const nav = getNavItems(role).map((item, i) => ({ ...item, hotkey: navHotkey(i) }));
    const more = getMoreItems(role).map((item) => ({ ...item, hotkey: undefined as string | undefined }));
    const all: (NavItem & { hotkey?: string; group: string })[] = [
      ...nav.map((i) => ({ ...i, group: 'Menu' })),
      ...more.map((i) => ({ ...i, group: 'More' })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.keywords || ''} ${i.href}`.toLowerCase().includes(q));
  }, [role, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Go to</DialogTitle>
          <DialogDescription>Type to filter screens, Enter to open.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = items[index];
                if (item) onNavigate(item.href);
                else if (/help|key|short/i.test(query)) onHelp();
              }
            }}
            placeholder="Go to… (type a screen, e.g. customers, purchase, backup)"
            aria-label="Search screens"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1" role="listbox" aria-label="Screens">
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No screen matches “{query}”.</p>}
          {items.map((item, i) => {
            const Icon = item.icon;
            const showGroup = i === 0 || items[i - 1].group !== item.group;
            return (
              <div key={item.href + item.label}>
                {showGroup && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.group}</p>}
                <button
                  type="button"
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => onNavigate(item.href)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${i === index ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1">{item.label}</span>
                  {item.hotkey && <kbd className={`kbd ${i === index ? 'opacity-90' : ''}`}>Alt+{item.hotkey}</kbd>}
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ move · Enter open · Esc close</span>
          <button type="button" className="underline-offset-2 hover:underline" onClick={onHelp}>
            All shortcuts (?)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
