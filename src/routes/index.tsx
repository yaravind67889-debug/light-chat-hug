import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Lock, Zap, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "INCHAT — Fast, simple, secure messaging" },
      {
        name: "description",
        content: "INCHAT is a fast, simple and secure real-time messaging app. Sign in and start chatting.",
      },
      { property: "og:title", content: "INCHAT — Fast, simple, secure messaging" },
      { property: "og:description", content: "Real-time chat with friends. Free and secure." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
      else setChecked(true);
    });
  }, [navigate]);

  if (!checked) {
    return <div className="flex min-h-screen items-center justify-center bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-header text-header-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <MessageCircle className="size-6" />
            INCHAT
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h1 className="text-5xl font-bold leading-tight tracking-tight">
              Message anyone, <span className="text-primary">instantly.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              INCHAT brings simple, secure real-time messaging to your browser. No downloads, no
              fuss — just chat.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                to="/auth"
                className="rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90"
              >
                Get started — it's free
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 text-sm">
              <Feature icon={<Zap className="size-5" />} title="Realtime" desc="Instant delivery" />
              <Feature icon={<Lock className="size-5" />} title="Secure" desc="Private by default" />
              <Feature icon={<Users className="size-5" />} title="Social" desc="Find anyone" />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl bg-header p-3 shadow-2xl">
              <div className="rounded-2xl chat-pattern p-4">
                <div className="space-y-2">
                  <Bubble side="in">Hey! Welcome to INCHAT 👋</Bubble>
                  <Bubble side="out">This looks great!</Bubble>
                  <Bubble side="in">Try sending your first message →</Bubble>
                  <Bubble side="out">On it ✨</Bubble>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div>
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <div className="mt-2 font-semibold">{title}</div>
      <div className="text-muted-foreground">{desc}</div>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  return (
    <div className={`flex ${side === "out" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow ${
          side === "out"
            ? "bg-bubble-out text-bubble-out-foreground"
            : "bg-bubble-in text-bubble-in-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
