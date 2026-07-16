"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import type { Contact } from "@/lib/types";
import {
  getRecentContacts,
  rememberContact,
} from "@/lib/storage/preferences";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Props = {
  defaultSubject: string;
  sending: boolean;
  onSend: (payload: {
    to: string;
    subject: string;
    body: string;
  }) => void;
};

export function EmailComposer({ defaultSubject, sending, onSend }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(
    "Please find the scanned document attached."
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const local = getRecentContacts();
    fetch("/api/email/contacts")
      .then((r) => r.json())
      .then((data) => {
        const api: Contact[] = data.contacts ?? [];
        const merged = [...local];
        for (const c of api) {
          if (!merged.some((m) => m.email === c.email)) merged.push(c);
        }
        setContacts(merged);
      })
      .catch(() => setContacts(local));
  }, []);

  const suggestions = useMemo(() => {
    const q = to.trim().toLowerCase();
    if (!q) return contacts.slice(0, 6);
    return contacts
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [to, contacts]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="block text-xs uppercase tracking-wider text-[var(--fg-muted)] mb-1.5">
          To
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-muted)]" />
          <input
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="recipient@company.com"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pl-10 pr-3 py-2.5 text-sm outline-none focus:border-teal-400"
            autoComplete="off"
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
            {suggestions.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--surface-2)] flex flex-col"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTo(c.email);
                    setShowSuggestions(false);
                  }}
                >
                  <span>{c.name ?? c.email}</span>
                  {c.name && (
                    <span className="text-xs text-[var(--fg-muted)]">
                      {c.email}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--fg-muted)] mb-1.5">
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-teal-400"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--fg-muted)] mb-1.5">
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-teal-400 resize-none"
        />
      </div>

      {contacts.length > 0 && !to && (
        <div className="flex flex-wrap gap-1.5">
          {contacts.slice(0, 4).map((c) => (
            <button
              key={c.email}
              type="button"
              onClick={() => setTo(c.email)}
              className={cn(
                "rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--fg-muted)]",
                "hover:border-teal-400/50 hover:text-[var(--fg)]"
              )}
            >
              {c.name ?? c.email}
            </button>
          ))}
        </div>
      )}

      <Button
        className="w-full"
        disabled={!valid || sending}
        onClick={() => {
          rememberContact({ email: to.trim() });
          onSend({ to: to.trim(), subject, body });
        }}
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Send via Email
          </>
        )}
      </Button>
    </div>
  );
}
