"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileEdit,
  Inbox,
  Loader2,
  Mail,
  Send,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { MailboxFolder } from "@/lib/email/mailbox";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  subject: string;
  last_message_at: string;
  participants: unknown;
  folder?: MailboxFolder;
  is_read?: boolean;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_addresses: string[];
  subject: string;
  text_body: string | null;
  html_body: string | null;
  created_at: string;
};

type FolderCounts = Record<MailboxFolder, number>;

const FOLDER_META: Array<{
  id: MailboxFolder;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
  { id: "spam", label: "Spam", icon: AlertTriangle },
];

function participantsLabel(participants: unknown): string {
  if (Array.isArray(participants)) {
    return participants
      .map((p) => String(p))
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
  }
  return "";
}

export function AdminInboxClient() {
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [folder, setFolder] = useState<MailboxFolder>("inbox");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [counts, setCounts] = useState<FolderCounts>({
    inbox: 0,
    sent: 0,
    drafts: 0,
    spam: 0,
  });
  const [unreadInbox, setUnreadInbox] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [mailboxAddress, setMailboxAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback((nextFolder: MailboxFolder) => {
    startTransition(async () => {
      const response = await fetch(
        `/api/admin/inbox?folder=${encodeURIComponent(nextFolder)}`,
      );
      const payload = (await response.json()) as {
        error?: string;
        threads?: Thread[];
        counts?: FolderCounts;
        unreadInbox?: number;
        mailboxAddress?: string | null;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to load mailbox.");
        return;
      }
      setThreads(payload.threads ?? []);
      if (payload.counts) setCounts(payload.counts);
      if (typeof payload.unreadInbox === "number") {
        setUnreadInbox(payload.unreadInbox);
      }
      if (payload.mailboxAddress !== undefined) {
        setMailboxAddress(payload.mailboxAddress);
      }
      setError(null);
    });
  }, []);

  function switchFolder(next: MailboxFolder) {
    setFolder(next);
    setActiveId(null);
    setMessages([]);
    setComposing(false);
    setReplyBody("");
    loadThreads(next);
  }

  function openCompose(prefill?: {
    to?: string;
    subject?: string;
    body?: string;
    threadId?: string | null;
  }) {
    setComposing(true);
    setActiveId(prefill?.threadId ?? null);
    setMessages([]);
    setComposeTo(prefill?.to ?? "");
    setComposeSubject(prefill?.subject ?? "");
    setComposeBody(prefill?.body ?? "");
  }

  function loadThread(id: string) {
    setComposing(false);
    setActiveId(id);
    startTransition(async () => {
      const response = await fetch(`/api/admin/inbox/${id}`);
      const payload = (await response.json()) as {
        error?: string;
        messages?: Message[];
        thread?: Thread;
      };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to load thread.");
        return;
      }
      setMessages(payload.messages ?? []);
      if (payload.thread) {
        setComposeSubject(payload.thread.subject);
        const people = participantsLabel(payload.thread.participants);
        if (payload.thread.folder === "drafts") {
          const draft = payload.messages?.[0];
          openCompose({
            threadId: payload.thread.id,
            to:
              draft?.to_addresses?.[0] ||
              people.split(",")[0]?.trim() ||
              "",
            subject: payload.thread.subject,
            body: draft?.text_body ?? "",
          });
          setActiveId(payload.thread.id);
          setMessages(payload.messages ?? []);
        }
        // Refresh list so unread badge updates after mark-read.
        if (folder === "inbox") loadThreads("inbox");
      }
    });
  }

  useEffect(() => {
    loadThreads("inbox");
  }, [loadThreads]);

  // Keep inbox in sync with Resend webhook inserts
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") loadThreads(folder);
    };
    const id = window.setInterval(tick, 15000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [folder, loadThreads]);

  async function moveThread(id: string, nextFolder: MailboxFolder) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/inbox/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: nextFolder }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to move message.");
        return;
      }
      success(
        nextFolder === "spam"
          ? "Moved to spam."
          : nextFolder === "inbox"
            ? "Moved to inbox."
            : `Moved to ${nextFolder}.`,
      );
      setActiveId(null);
      setMessages([]);
      setComposing(false);
      loadThreads(folder);
    });
  }

  async function deleteThread(id: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/inbox/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        error?: string;
        movedToSpam?: boolean;
        deleted?: boolean;
      };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to delete.");
        return;
      }
      success(
        payload.deleted
          ? "Deleted."
          : payload.movedToSpam
            ? "Moved to spam."
            : "Updated.",
      );
      setActiveId(null);
      setMessages([]);
      setComposing(false);
      loadThreads(folder);
    });
  }

  function saveDraft(e?: React.FormEvent) {
    e?.preventDefault();
    startTransition(async () => {
      const response = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft",
          thread_id: activeId && folder === "drafts" ? activeId : undefined,
          to: composeTo ? [composeTo] : [],
          subject: composeSubject,
          text: composeBody,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        threadId?: string;
      };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to save draft.");
        return;
      }
      success("Draft saved.");
      setFolder("drafts");
      setActiveId(payload.threadId ?? null);
      setComposing(true);
      loadThreads("drafts");
    });
  }

  function sendNew(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const response = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          thread_id:
            activeId && (folder === "drafts" || composing) ? activeId : undefined,
          to: [composeTo],
          subject: composeSubject,
          text: composeBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to send.");
        return;
      }
      success("Email sent.");
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposing(false);
      setActiveId(null);
      setFolder("sent");
      loadThreads("sent");
    });
  }

  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !messages.length) return;
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");
    const to = lastInbound?.from_address;
    if (!to) {
      toastError("No inbound sender to reply to.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          thread_id: activeId,
          to: [to],
          subject: composeSubject.startsWith("Re:")
            ? composeSubject
            : `Re: ${composeSubject}`,
          text: replyBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to send reply.");
        return;
      }
      success("Reply sent.");
      setReplyBody("");
      loadThread(activeId);
      loadThreads(folder);
    });
  }

  const emptyCopy = useMemo(() => {
    switch (folder) {
      case "sent":
        return "No sent messages yet.";
      case "drafts":
        return "No drafts.";
      case "spam":
        return "Spam is empty.";
      default:
        return "No messages in inbox.";
    }
  }, [folder]);

  const showConversation =
    activeId && !composing && folder !== "drafts" && messages.length >= 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mailbox"
        description={
          mailboxAddress
            ? `Your company address: ${mailboxAddress}`
            : "Company mailbox — allocate an address under Settings if missing."
        }
        actions={
          <Button
            type="button"
            onClick={() => openCompose()}
            disabled={pending}
          >
            <Mail className="size-4" aria-hidden />
            Compose
          </Button>
        }
      />

      {error ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}{" "}
          <Link href="/admin/settings" className="underline">
            Settings
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,0.95fr)_minmax(0,1.15fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Folders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {FOLDER_META.map((item) => {
              const Icon = item.icon;
              const count = counts[item.id] ?? 0;
              const active = folder === item.id && !composing;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchFolder(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-muted font-medium" : "hover:bg-muted/60",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "inbox" && unreadInbox > 0 ? (
                    <Badge variant="default">{unreadInbox}</Badge>
                  ) : count > 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="capitalize">{folder}</CardTitle>
            <CardDescription>
              {folder === "inbox"
                ? "Incoming messages for your support address."
                : folder === "sent"
                  ? "Messages you have sent."
                  : folder === "drafts"
                    ? "Unsent drafts."
                    : "Quarantined messages."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyCopy}</p>
            ) : (
              <ul className="divide-y divide-border">
                {threads.map((thread) => {
                  const unread = folder === "inbox" && thread.is_read === false;
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-2 py-3 text-left text-sm hover:bg-muted",
                          activeId === thread.id ? "bg-muted" : "",
                        )}
                        onClick={() => loadThread(thread.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "truncate",
                              unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {thread.subject || "(no subject)"}
                          </p>
                          {unread ? (
                            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {participantsLabel(thread.participants) || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(thread.last_message_at)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {composing
                  ? activeId && folder === "drafts"
                    ? "Edit draft"
                    : "Compose"
                  : activeId
                    ? "Conversation"
                    : "Select a message"}
              </CardTitle>
              <CardDescription>
                {composing
                  ? "Send now or save as draft."
                  : activeId
                    ? "Reply or move this thread."
                    : "Choose a thread from the list, or compose a new message."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {composing ? (
                <form onSubmit={sendNew} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="to">To</Label>
                    <Input
                      id="to"
                      type="email"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="body">Message</Label>
                    <textarea
                      id="body"
                      className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={pending}>
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      Send
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => saveDraft()}
                    >
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setComposing(false);
                        setActiveId(null);
                        setComposeTo("");
                        setComposeSubject("");
                        setComposeBody("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : showConversation && activeId ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {folder !== "inbox" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => moveThread(activeId, "inbox")}
                      >
                        Move to inbox
                      </Button>
                    ) : null}
                    {folder !== "spam" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => moveThread(activeId, "spam")}
                      >
                        Mark spam
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => deleteThread(activeId)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {folder === "spam" ? "Delete" : "Spam"}
                    </Button>
                  </div>
                  <div className="max-h-80 space-y-3 overflow-y-auto">
                    {messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No messages in this thread.
                      </p>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <p className="text-xs text-muted-foreground">
                            {message.direction} · {message.from_address} ·{" "}
                            {formatDate(message.created_at)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap">
                            {message.text_body ||
                              message.html_body?.replace(/<[^>]+>/g, " ") ||
                              "(empty)"}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  {folder !== "spam" ? (
                    <form onSubmit={sendReply} className="space-y-3">
                      <Label htmlFor="reply">Reply</Label>
                      <textarea
                        id="reply"
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        required
                      />
                      <Button
                        type="submit"
                        disabled={pending || !replyBody.trim()}
                      >
                        {pending ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        Send reply
                      </Button>
                    </form>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a conversation or click Compose.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
