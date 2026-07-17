"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Send, Star, Trash2, UserPlus } from "lucide-react";
import type { Contact } from "@/lib/types";
import {
  getRecentContacts,
  rememberContact,
  removeContact,
} from "@/lib/storage/preferences";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

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
  const [body, setBody] = useState<string>(he.email.defaultBody);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const reloadContacts = () => setContacts(getRecentContacts());

  useEffect(() => {
    reloadContacts();
  }, []);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  const suggestions = useMemo(() => {
    const q = to.trim().toLowerCase();
    if (!q) return contacts.slice(0, 8);
    return contacts
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [to, contacts]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <div className="space-y-3" dir="rtl">
      {/* Quick-send saved emails */}
      <div className="space-y-1.5">
        <p className="text-xs tracking-wider text-[var(--fg-muted)]">
          {he.email.quickSend}
        </p>
        {contacts.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">{he.email.noSavedEmails}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {contacts.map((c) => (
              <div
                key={c.email}
                className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 ps-2.5 pe-1 py-1"
              >
                <button
                  type="button"
                  onClick={() => setTo(c.email)}
                  className="text-xs text-sky-100 hover:underline max-w-[10rem] truncate"
                  title={c.email}
                >
                  {c.name ?? c.email}
                </button>
                <button
                  type="button"
                  aria-label={he.actions.removeEmail}
                  onClick={() => {
                    removeContact(c.email);
                    reloadContacts();
                    if (to === c.email) setTo("");
                  }}
                  className="rounded-full p-1 text-sky-200/70 hover:bg-red-500/20 hover:text-red-200"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <label className="block text-xs tracking-wider text-[var(--fg-muted)] mb-1.5">
          {he.email.to}
        </label>
        <div className="relative">
          <Mail className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-muted)]" />
          <input
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={he.email.placeholder}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pe-10 ps-3 py-2.5 text-sm outline-none focus:border-teal-400"
            dir="ltr"
            autoComplete="off"
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
            {suggestions.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  className="w-full text-start px-3 py-2.5 text-sm hover:bg-[var(--surface-2)] flex flex-col"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTo(c.email);
                    setShowSuggestions(false);
                  }}
                >
                  <span>{c.name ?? c.email}</span>
                  {c.name && (
                    <span className="text-xs text-[var(--fg-muted)]" dir="ltr">
                      {c.email}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {valid && (
        <button
          type="button"
          onClick={() => {
            rememberContact({ email: to.trim() });
            reloadContacts();
          }}
          className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {he.email.saveEmail}
          <Star className="h-3 w-3" />
        </button>
      )}

      <div>
        <label className="block text-xs tracking-wider text-[var(--fg-muted)] mb-1.5">
          {he.email.subject}
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-teal-400"
        />
      </div>

      <div>
        <label className="block text-xs tracking-wider text-[var(--fg-muted)] mb-1.5">
          {he.email.message}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-teal-400 resize-none"
        />
      </div>

      <Button
        className="w-full"
        disabled={!valid || sending}
        onClick={() => {
          rememberContact({ email: to.trim() });
          reloadContacts();
          onSend({ to: to.trim(), subject, body });
        }}
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {he.email.sending}
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> {he.email.send}
          </>
        )}
      </Button>
    </div>
  );
}
