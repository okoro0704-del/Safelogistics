"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
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
import { formatDate } from "@/lib/format";

type Thread = {
  id: string;
  subject: string;
  last_message_at: string;
  participants: unknown;
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

export function AdminInboxClient() {
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadThreads() {
    startTransition(async () => {
      const response = await fetch("/api/admin/inbox");
      const payload = (await response.json()) as {
        error?: string;
        threads?: Thread[];
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to load inbox.");
        return;
      }
      setThreads(payload.threads ?? []);
      setError(null);
    });
  }

  function loadThread(id: string) {
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
      }
    });
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendNew(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const response = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      loadThreads();
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
      loadThreads();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Shared company mailbox powered by Resend."
      />

      {error ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}{" "}
          <Link href="/admin/settings" className="underline">
            Settings
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Threads</CardTitle>
          </CardHeader>
          <CardContent>
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={`w-full px-2 py-3 text-left text-sm hover:bg-muted ${
                        activeId === thread.id ? "bg-muted" : ""
                      }`}
                      onClick={() => loadThread(thread.id)}
                    >
                      <p className="font-medium">{thread.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(thread.last_message_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{activeId ? "Conversation" : "Compose"}</CardTitle>
              <CardDescription>
                {activeId
                  ? "Reply using your verified company mailbox."
                  : "Send a new message from the default support address."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeId ? (
                <>
                  <div className="max-h-80 space-y-3 overflow-y-auto">
                    {messages.map((message) => (
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
                    ))}
                  </div>
                  <form onSubmit={sendReply} className="space-y-3">
                    <Label htmlFor="reply">Reply</Label>
                    <textarea
                      id="reply"
                      className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      required
                    />
                    <Button type="submit" disabled={pending || !replyBody.trim()}>
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      Send reply
                    </Button>
                  </form>
                </>
              ) : (
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
                  <Button type="submit" disabled={pending}>
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Send
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
