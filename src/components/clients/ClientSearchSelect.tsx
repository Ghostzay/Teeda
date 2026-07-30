"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";

import { recentClients, searchClients } from "@/lib/actions/clients";
import { formatDate } from "@/lib/format";
import type { ClientSearchRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

/**
 * Pick a client. The only way staff do so, anywhere.
 *
 * What it replaces: three `<select>` elements each fed a prefetched list of up
 * to five hundred clients. That put the salon's client list in the page source
 * of every booking form, and it stopped working the moment a salon had more
 * clients than the limit — silently, by omitting people.
 *
 * Every keystroke goes to `staff_search_clients`. Nothing is filtered here.
 *
 * The row detail is the point of the component, not decoration. Two clients
 * called Maria Gonzalez are common; the last four digits, the last visit and
 * the usual tech are what tell them apart, and trimming any of them to make
 * the row tidier makes the component useless for its actual job.
 */
export function ClientSearchSelect({
  value,
  onChange,
  name,
  label = "Client",
  required,
  onAddNew,
}: {
  /** Controlled: the selected client, or null. */
  value: ClientSearchRow | null;
  onChange: (client: ClientSearchRow | null) => void;
  /** Emits a hidden input so this drops into an existing form unchanged. */
  name?: string;
  label?: string;
  required?: boolean;
  /** Opens the registration form, prefilled with whatever was typed. */
  onAddNew?: (prefill: { name?: string; phone?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientSearchRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Superseded requests must not overwrite newer results. Typing is faster
  // than the network and out-of-order responses make a list flicker backwards.
  const requestRef = useRef(0);

  const run = useCallback(async (q: string) => {
    const ticket = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const result = q.trim().length >= MIN_CHARS ? await searchClients(q) : await recentClients();
      if (ticket !== requestRef.current) return;
      setRows(result);
    } catch {
      if (ticket !== requestRef.current) return;
      setError("Couldn't search just now.");
      setRows([]);
    } finally {
      if (ticket === requestRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    // Below the minimum, show today's clients rather than an empty panel —
    // most of the time the person being picked is already on today's book.
    if (trimmed.length > 0 && trimmed.length < MIN_CHARS) {
      setRows([]);
      return;
    }

    const timer = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, run]);

  useEffect(() => setActive(0), [rows]);

  // Close on an outside tap. A panel that stays open behind a dialog is a
  // panel that eats the next click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (client: ClientSearchRow) => {
    onChange(client);
    setOpen(false);
    setQuery("");
  };

  const addNew = () => {
    const trimmed = query.trim();
    const digits = trimmed.replace(/\D/g, "");
    // Digits go to the phone field, letters to the name field — whichever they
    // were part-way through typing is the one they should not retype.
    onAddNew?.(
      digits.length > 0 && digits === trimmed.replace(/[\s()+-]/g, "")
        ? { phone: digits }
        : { name: trimmed },
    );
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!rows) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[active]) choose(rows[active]);
      else if (query.trim()) addNew();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  // Selected: a chip, not raw text, so removing it is one obvious tap.
  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{label}</span>
        {name ? <input type="hidden" name={name} value={value.id} /> : null}
        <div className="flex items-center gap-2 rounded-xl border border-accent-border bg-accent-subtle px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{displayName(value)}</span>
            <span className="block truncate text-meta text-muted-text">{detail(value)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              // Focus lands back where the next action is.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label={`Remove ${displayName(value)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-text hover:text-primary-text"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const showing = rows ?? [];

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <label htmlFor={`${listId}-input`} className="block text-sm font-medium">
        {label}
      </label>
      {/* Keeps `required` honest when nothing is picked: the form will not
          submit, and the browser focuses this field rather than failing
          silently on a hidden input that is not there. */}
      {name && required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => {}}
          className="pointer-events-none absolute size-0 opacity-0"
        />
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && showing[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="Name or phone"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-xl border border-subtle bg-surface-raised pl-9 pr-3 text-primary-text"
        />
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Clients"
          // A fixed minimum height: the panel must not resize between loading,
          // results and empty, or the whole form jumps under the operator's
          // finger mid-tap.
          className="min-h-[8rem] overflow-hidden rounded-xl border border-subtle bg-surface-raised"
        >
          <p aria-live="polite" className="sr-only">
            {busy ? "Searching" : `${showing.length} clients found`}
          </p>

          {busy && showing.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-text">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </p>
          ) : error ? (
            <div className="space-y-2 px-4 py-8 text-center">
              <p className="text-sm text-danger">{error}</p>
              <button
                type="button"
                onClick={() => run(query)}
                className="min-h-11 rounded-lg border border-subtle px-4 text-sm font-medium"
              >
                Try again
              </button>
            </div>
          ) : query.trim().length > 0 && query.trim().length < MIN_CHARS ? (
            <p className="py-10 text-center text-sm text-muted-text">
              Keep typing — at least {MIN_CHARS} characters.
            </p>
          ) : showing.length === 0 ? (
            <div className="space-y-3 px-4 py-8 text-center">
              <p className="text-sm text-muted-text">
                {query.trim() ? `Nobody matching “${query.trim()}”.` : "Nobody in yet today."}
              </p>
              {onAddNew ? (
                <button
                  type="button"
                  onClick={addNew}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-default px-4 text-sm font-semibold text-on-accent"
                >
                  <UserPlus className="size-4" />
                  Add new client
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {query.trim().length < MIN_CHARS ? (
                <li className="px-3 pt-2 text-meta uppercase tracking-wide text-muted-text">
                  In today
                </li>
              ) : null}
              {showing.map((client, index) => (
                <li key={client.id}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(client)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start px-3 py-2 text-left transition-colors",
                      index === active ? "bg-surface-overlay" : "",
                      !client.is_active && "opacity-60",
                    )}
                  >
                    <span className="truncate font-medium leading-tight">
                      {displayName(client)}
                      {!client.is_active ? (
                        <span className="ml-2 text-meta text-muted-text">inactive</span>
                      ) : null}
                    </span>
                    <span className="truncate text-meta text-muted-text">{detail(client)}</span>
                  </button>
                </li>
              ))}
              {onAddNew && query.trim().length >= MIN_CHARS ? (
                <li className="border-t border-subtle">
                  <button
                    type="button"
                    onClick={addNew}
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium text-accent-default"
                  >
                    <UserPlus className="size-4" />
                    Add “{query.trim()}” as a new client
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function displayName(client: ClientSearchRow): string {
  return [client.first_name, client.last_name].filter(Boolean).join(" ") || "Client";
}

/** "···4142 · last visit Jun 14 · usually Mai" — the disambiguating line. */
function detail(client: ClientSearchRow): string {
  const parts: string[] = [];
  if (client.phone_last4) parts.push(`···${client.phone_last4}`);
  parts.push(client.last_visit ? `last visit ${formatDate(client.last_visit)}` : "no visits yet");
  if (client.usual_tech) parts.push(`usually ${client.usual_tech}`);
  return parts.join(" · ");
}
