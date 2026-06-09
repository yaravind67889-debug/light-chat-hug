import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  LogOut,
  Search,
  Send,
  MessageCircle,
  Check,
  CheckCheck,
  UserPlus,
  X,
  SmilePlus,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "INCHAT" }] }),
  component: ChatApp,
});

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type Reaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function ChatApp() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFind, setShowFind] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setMe(data.user);
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      setMyProfile(prof as Profile | null);
    });
  }, [navigate]);

  const loadContacts = useCallback(async (userId: string) => {
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_id, recipient_id, content, created_at")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    const otherIds = new Set<string>();
    msgs?.forEach((m) => {
      otherIds.add(m.sender_id === userId ? m.recipient_id : m.sender_id);
    });
    if (otherIds.size === 0) {
      setContacts([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("*")
      .in("id", Array.from(otherIds));
    setContacts((profs ?? []) as Profile[]);
  }, []);

  useEffect(() => {
    if (me) loadContacts(me.id);
  }, [me, loadContacts]);

  // Realtime: messages + reactions
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("inchat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id !== me.id && m.recipient_id !== me.id) return;
          setMessages((cur) => {
            const other = activeId;
            const isCurrent =
              other &&
              ((m.sender_id === me.id && m.recipient_id === other) ||
                (m.sender_id === other && m.recipient_id === me.id));
            if (!isCurrent) return cur;
            if (cur.some((x) => x.id === m.id)) return cur;
            return [...cur, m];
          });
          loadContacts(me.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((cur) => {
            const list = cur[r.message_id] ?? [];
            if (list.some((x) => x.id === r.id)) return cur;
            return { ...cur, [r.message_id]: [...list, r] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.old as Reaction;
          setReactions((cur) => {
            const list = cur[r.message_id];
            if (!list) return cur;
            return { ...cur, [r.message_id]: list.filter((x) => x.id !== r.id) };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, activeId, loadContacts]);

  // Load conversation when active changes
  useEffect(() => {
    if (!me || !activeId) {
      setMessages([]);
      setReactions({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me.id},recipient_id.eq.${activeId}),and(sender_id.eq.${activeId},recipient_id.eq.${me.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(500);
      const msgs = (data ?? []) as Message[];
      setMessages(msgs);

      // Load reactions for these messages
      if (msgs.length > 0) {
        const { data: rxs } = await supabase
          .from("message_reactions")
          .select("*")
          .in(
            "message_id",
            msgs.map((m) => m.id),
          );
        const grouped: Record<string, Reaction[]> = {};
        (rxs ?? []).forEach((r) => {
          const rx = r as Reaction;
          (grouped[rx.message_id] ||= []).push(rx);
        });
        setReactions(grouped);
      } else {
        setReactions({});
      }

      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", activeId)
        .eq("recipient_id", me.id)
        .is("read_at", null);
    })();
  }, [me, activeId]);

  const activeProfile = useMemo(
    () => contacts.find((c) => c.id === activeId) ?? null,
    [contacts, activeId],
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  async function startChatWith(profile: Profile) {
    setContacts((cur) => (cur.some((c) => c.id === profile.id) ? cur : [profile, ...cur]));
    setActiveId(profile.id);
    setShowFind(false);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!me) return;
    const existing = (reactions[messageId] ?? []).find(
      (r) => r.user_id === me.id && r.emoji === emoji,
    );
    if (existing) {
      // optimistic remove
      setReactions((cur) => ({
        ...cur,
        [messageId]: (cur[messageId] ?? []).filter((r) => r.id !== existing.id),
      }));
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: me.id, emoji })
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setReactions((cur) => {
        const list = cur[messageId] ?? [];
        if (list.some((x) => x.id === (data as Reaction).id)) return cur;
        return { ...cur, [messageId]: [...list, data as Reaction] };
      });
    }
  }

  if (!me || !myProfile) {
    return <div className="flex h-screen items-center justify-center bg-background" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-full flex-col border-r bg-panel md:w-[360px] md:min-w-[320px]">
        <div className="flex items-center justify-between bg-header px-4 py-3 text-header-foreground">
          <div className="flex items-center gap-3">
            <Avatar profile={myProfile} size={36} />
            <div>
              <div className="font-semibold leading-tight">
                {myProfile.display_name || myProfile.username}
              </div>
              <div className="text-xs opacity-70">@{myProfile.username}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFind(true)}
              className="rounded-full p-2 hover:bg-white/10"
              title="Find people"
            >
              <UserPlus className="size-5" />
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-full p-2 hover:bg-white/10"
              title="Sign out"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {contacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="mx-auto mb-3 size-10 text-muted-foreground/50" />
              No conversations yet.
              <br />
              <button
                onClick={() => setShowFind(true)}
                className="mt-3 inline-block font-semibold text-primary hover:underline"
              >
                Find someone to chat with
              </button>
            </div>
          ) : (
            contacts.map((c) => (
              <ContactRow
                key={c.id}
                profile={c}
                active={c.id === activeId}
                onClick={() => setActiveId(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      <main className={`flex-1 flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
        {activeProfile ? (
          <Conversation
            me={me}
            other={activeProfile}
            messages={messages}
            reactions={reactions}
            onBack={() => setActiveId(null)}
            onSent={(m) => setMessages((cur) => [...cur, m])}
            onToggleReaction={toggleReaction}
          />
        ) : (
          <EmptyState />
        )}
      </main>

      {showFind && (
        <FindPeopleModal
          meId={me.id}
          onPick={startChatWith}
          onClose={() => setShowFind(false)}
        />
      )}
    </div>
  );
}

function ContactRow({
  profile,
  active,
  onClick,
}: {
  profile: Profile;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition hover:bg-accent ${
        active ? "bg-accent" : ""
      }`}
    >
      <Avatar profile={profile} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{profile.display_name || profile.username}</div>
        <div className="truncate text-xs text-muted-foreground">@{profile.username}</div>
      </div>
    </button>
  );
}

function Conversation({
  me,
  other,
  messages,
  reactions,
  onBack,
  onSent,
  onToggleReaction,
}: {
  me: User;
  other: Profile;
  messages: Message[];
  reactions: Record<string, Reaction[]>;
  onBack: () => void;
  onSent: (m: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Close picker on outside click / escape
  useEffect(() => {
    if (!pickerFor) return;
    const onDown = () => setPickerFor(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerFor(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerFor]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: me.id, recipient_id: other.id, content })
      .select()
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    onSent(data as Message);
  }

  return (
    <>
      <div className="flex items-center gap-3 bg-header px-4 py-3 text-header-foreground">
        <button onClick={onBack} className="rounded-full p-1 hover:bg-white/10 md:hidden">
          <X className="size-5" />
        </button>
        <Avatar profile={other} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{other.display_name || other.username}</div>
          <div className="truncate text-xs opacity-70">{other.status || `@${other.username}`}</div>
        </div>
      </div>

      <div ref={scrollRef} className="chat-pattern flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {messages.map((m, i) => {
            const mine = m.sender_id === me.id;
            const prev = messages[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id;
            const msgReactions = reactions[m.id] ?? [];
            const grouping = groupReactions(msgReactions);
            return (
              <div
                key={m.id}
                className={`group/msg relative flex ${mine ? "justify-end" : "justify-start"} ${
                  grouped ? "mt-0.5" : "mt-2"
                }`}
              >
                <div className={`flex max-w-[78%] items-end gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                  <div className="relative">
                    <div
                      className={`rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                        mine
                          ? "bg-bubble-out text-bubble-out-foreground"
                          : "bg-bubble-in text-bubble-in-foreground"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-60">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {mine &&
                          (m.read_at ? (
                            <CheckCheck className="size-3 text-tick" />
                          ) : (
                            <Check className="size-3" />
                          ))}
                      </div>
                    </div>

                    {grouping.length > 0 && (
                      <div
                        className={`-mt-1 flex flex-wrap gap-1 ${
                          mine ? "justify-end" : "justify-start"
                        } pl-1 pr-1`}
                      >
                        {grouping.map((g) => {
                          const reacted = g.userIds.includes(me.id);
                          return (
                            <button
                              key={g.emoji}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleReaction(m.id, g.emoji);
                              }}
                              className={`flex items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 text-xs shadow-sm transition hover:scale-105 ${
                                reacted ? "border-primary bg-primary/10" : ""
                              }`}
                              title={reacted ? "Remove reaction" : "Add reaction"}
                            >
                              <span className="text-sm leading-none">{g.emoji}</span>
                              {g.count > 1 && (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {g.count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickerFor(pickerFor === m.id ? null : m.id);
                    }}
                    className="mb-1 rounded-full bg-card p-1.5 text-muted-foreground opacity-0 shadow transition hover:text-foreground group-hover/msg:opacity-100"
                    title="Add reaction"
                  >
                    <SmilePlus className="size-4" />
                  </button>
                </div>

                {pickerFor === m.id && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`absolute z-20 flex gap-1 rounded-full border bg-popover p-1.5 shadow-xl ${
                      mine ? "right-12" : "left-12"
                    } -top-9`}
                  >
                    {QUICK_EMOJIS.map((emoji) => {
                      const reacted = (reactions[m.id] ?? []).some(
                        (r) => r.user_id === me.id && r.emoji === emoji,
                      );
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            onToggleReaction(m.id, emoji);
                            setPickerFor(null);
                          }}
                          className={`flex size-8 items-center justify-center rounded-full text-lg transition hover:scale-125 ${
                            reacted ? "bg-primary/15" : "hover:bg-accent"
                          }`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t bg-panel px-3 py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          className="flex-1 rounded-full border bg-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-5" />
        </button>
      </form>
    </>
  );
}

function groupReactions(rxs: Reaction[]) {
  const map = new Map<string, { emoji: string; count: number; userIds: string[] }>();
  for (const r of rxs) {
    const cur = map.get(r.emoji);
    if (cur) {
      cur.count += 1;
      cur.userIds.push(r.user_id);
    } else {
      map.set(r.emoji, { emoji: r.emoji, count: 1, userIds: [r.user_id] });
    }
  }
  return Array.from(map.values());
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-chat-bg px-8 text-center">
      <MessageCircle className="size-20 text-muted-foreground/40" />
      <h2 className="mt-4 text-2xl font-semibold">INCHAT for Web</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Select a conversation from the sidebar, or find someone new to start chatting. Messages are
        delivered in real time.
      </p>
    </div>
  );
}

function FindPeopleModal({
  meId,
  onPick,
  onClose,
}: {
  meId: string;
  onPick: (p: Profile) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const query = supabase.from("profiles").select("*").neq("id", meId).limit(20);
      const { data } = q.trim()
        ? await query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        : await query.order("created_at", { ascending: false });
      setResults((data ?? []) as Profile[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, meId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or @username"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {results.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No people found.</div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition hover:bg-accent"
              >
                <Avatar profile={p} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.display_name || p.username}</div>
                  <div className="truncate text-xs text-muted-foreground">@{p.username}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile, size = 40 }: { profile: Profile; size?: number }) {
  const initial = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const hash = Array.from(profile.id).reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue} 55% 45%)`,
        fontSize: size * 0.4,
      }}
    >
      {initial}
    </div>
  );
}
