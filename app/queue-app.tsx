"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CirclePlus, Clock3, Crown, DoorOpen, LogIn, LogOut, Pencil, Shield, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

type Member = {
  id: number; courtId: number; userId: string; displayName: string;
  status: "queued" | "playing"; joinedAt: number; hoppedOnAt: number | null; position?: number;
};
type Court = { id: number; name: string; createdAt: number; players: Member[]; queue: Member[] };
type State = {
  me: { id: string; email: string; displayName: string; role: "admin" | "player" } | null;
  courts: Court[];
};
type Action = { action: string; courtId?: number; membershipId?: number; name?: string };
type Profile = { id: string; name: string };

const PROFILE_KEY = "queueup-player-profile";

function profileHeaders(profile: Profile | null) {
  return profile
    ? { "x-queueup-player-id": profile.id, "x-queueup-player-name": profile.name }
    : {};
}

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string; title: string; description: string; inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => Promise<unknown> | unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function PlayerAvatar({ name, index = 0 }: { name: string; index?: number }) {
  const tones = [
    "bg-[#d9ff63] text-[#142115]", "bg-[#ffc857] text-[#2b1c00]",
    "bg-[#9be7ff] text-[#08242e]", "bg-[#ff9fb1] text-[#341019]",
  ];
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-black ${tones[index % tones.length]}`}>
      {initials(name)}
    </span>
  );
}

export function QueueApp() {
  const [state, setState] = useState<State | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courtDialogOpen, setCourtDialogOpen] = useState(false);
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courtName, setCourtName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [myName, setMyName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [kickTarget, setKickTarget] = useState<Member | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Profile;
        if (parsed.id && parsed.name) setProfile(parsed);
      }
    } catch {
      window.localStorage.removeItem(PROFILE_KEY);
    } finally {
      setProfileReady(true);
    }
  }, []);

  const load = useCallback(async (profileOverride?: Profile | null) => {
    try {
      const activeProfile = profileOverride === undefined ? profile : profileOverride;
      const response = await fetch("/api/courts", {
        cache: "no-store",
        headers: profileHeaders(activeProfile),
      });
      const data = (await response.json()) as State & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load courts.");
      setState(data);
      setSelectedId((current) => current ?? data.courts[0]?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load courts.");
    }
  }, [profile]);

  useEffect(() => {
    if (!profileReady || !profile) return;
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load, profile, profileReady]);

  const act = useCallback(async (action: Action, success?: string, profileOverride?: Profile | null) => {
    setBusy(true);
    try {
      const activeProfile = profileOverride === undefined ? profile : profileOverride;
      const response = await fetch("/api/courts", {
        method: "POST",
        headers: { "content-type": "application/json", ...profileHeaders(activeProfile) },
        body: JSON.stringify(action),
      });
      const data = (await response.json()) as State & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That action did not work.");
      setState(data);
      setError(null);
      if (success) toast.success(success);
      return data;
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "That action did not work.";
      toast.error(message);
      throw actionError;
    } finally {
      setBusy(false);
    }
  }, [profile]);

  const savePlayer = useCallback(async () => {
    const name = myName.trim();
    if (!name) return;
    const isEditing = Boolean(profile);
    const nextProfile: Profile = { id: profile?.id ?? crypto.randomUUID(), name };
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    setProfile(nextProfile);
    setProfileDialogOpen(false);
    setMyName("");
    await load(nextProfile);
    if (isEditing) toast.success("Display name updated");
  }, [load, myName, profile]);

  const openPlayerJoin = useCallback((courtId: number) => {
    void act({ action: "join", courtId }, "You joined the queue");
  }, [act]);

  const openProfileEditor = useCallback(() => {
    setMyName(profile?.name ?? "");
    setProfileDialogOpen(true);
  }, [profile]);

  const adminLogin = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Admin login failed.");
      setAdminDialogOpen(false);
      setAdminUsername("");
      setAdminPassword("");
      await load();
      toast.success("Admin mode unlocked");
    } catch (loginError) {
      toast.error(loginError instanceof Error ? loginError.message : "Admin login failed.");
    } finally {
      setBusy(false);
    }
  }, [adminPassword, adminUsername, load]);

  const adminLogout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      await load();
      toast.success("Admin mode closed");
    } finally {
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof context.registerTool>[0]) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };
    register({
      name: "list_live_courts", title: "List live courts",
      description: "Read every court, the players on it, and the current queue.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => {
        const response = await fetch("/api/courts", {
          cache: "no-store",
          headers: profileHeaders(profile),
        });
        if (!response.ok) throw new Error("Could not read live courts.");
        const data = (await response.json()) as State;
        setState(data);
        return data.courts.map(({ id, name, players, queue }) => ({
          id, name, players: players.map((player) => player.displayName),
          queue: queue.map((player) => player.displayName),
        }));
      },
    });
    register({
      name: "join_court_queue", title: "Join a court queue",
      description: "Join the back of one court's queue. A player may belong to only one court.",
      inputSchema: {
        type: "object", properties: { courtId: { type: "integer", minimum: 1 } },
        required: ["courtId"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const courtId = Number((input as { courtId?: number })?.courtId);
        if (!Number.isInteger(courtId) || courtId < 1) throw new Error("courtId must be a positive integer.");
        if (!state?.me) throw new Error("Choose your player name in QueueUP before joining a court.");
        const data = await act({ action: "join", courtId });
        return { joined: true, courtId, state: data };
      },
    });
    return () => lifecycle.abort();
  }, [act, profile, state?.me]);

  const selected = state?.courts.find((court) => court.id === selectedId) ?? state?.courts[0];
  const myMembership = useMemo(() => {
    if (!state?.me) return null;
    for (const court of state.courts) {
      const member = [...court.players, ...court.queue].find((item) => item.userId === state.me?.id);
      if (member) return { court, member };
    }
    return null;
  }, [state]);

  if (!profileReady) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#07110d] text-white">
        <div className="flex items-center gap-3 text-base font-semibold">
          <span className="size-3 animate-pulse rounded-full bg-[#d9ff63]" /> Opening QueueUP…
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#07110d] p-4 text-[#f4f7ef]">
        <Toaster position="top-center" />
        <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#102019] p-6 shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#d9ff63] text-lg font-black tracking-[-.12em] text-[#142115] shadow-[0_0_30px_rgba(217,255,99,.18)]">QU</div>
          <h1 className="mt-6 text-3xl font-black tracking-[-.05em]">Enter your display name</h1>
          <p className="mt-2 text-base leading-relaxed text-white/55">Players need a name before viewing or joining the live courts. It will be remembered on this device.</p>
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void savePlayer();
            }}
          >
            <label className="block text-sm font-bold" htmlFor="new-player-display-name">Display name</label>
            <Input
              id="new-player-display-name"
              autoFocus
              autoComplete="nickname"
              value={myName}
              maxLength={40}
              placeholder="e.g. Jordan"
              className="mt-2 h-12 border-white/15 bg-black/15 text-white placeholder:text-white/30"
              onChange={(event) => setMyName(event.target.value)}
            />
            <Button type="submit" disabled={busy || !myName.trim()} className="mt-5 h-12 w-full bg-[#d9ff63] text-base font-black text-[#142115] hover:bg-[#c8ef4e]">
              Continue to courts
            </Button>
          </form>
        </section>
      </main>
    );
  }

  if (!state && !error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#07110d] text-white">
        <div className="flex items-center gap-3 text-base font-semibold">
          <span className="size-3 animate-pulse rounded-full bg-[#d9ff63]" /> Loading live courts…
        </div>
      </main>
    );
  }
  if (!state || !selected) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#07110d] p-6 text-white">
        <section className="max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-lg font-bold">Courts are unavailable</p>
          <p className="mt-2 text-sm text-white/60">{error}</p>
          <Button className="mt-5 bg-[#d9ff63] text-[#142115] hover:bg-[#c7ed51]" onClick={() => void load()}>Try again</Button>
        </section>
      </main>
    );
  }

  const meOnSelected = myMembership?.court.id === selected.id ? myMembership.member : null;
  const nextUp = selected.queue[0];
  const canHopOn = Boolean(meOnSelected?.status === "queued" && nextUp?.userId === state.me?.id && selected.players.length < 4);
  const membershipElsewhere = myMembership && myMembership.court.id !== selected.id;

  return (
    <main className="min-h-dvh bg-[#07110d] text-[#f4f7ef]">
      <Toaster position="top-center" />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07110d]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#d9ff63] text-[#142115] shadow-[0_0_30px_rgba(217,255,99,.2)]">
              <span className="text-lg font-black tracking-[-.12em]">QU</span>
            </div>
            <div>
              <p className="text-lg font-black leading-none tracking-[-.03em]">QueueUP</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[.18em] text-white/45">Live courts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-10 border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
              onClick={() => state.me?.role === "admin" ? void adminLogout() : setAdminDialogOpen(true)}
            >
              {state.me?.role === "admin" ? <LogOut /> : <LogIn />}
              <span className="hidden sm:inline">{state.me?.role === "admin" ? "Exit admin" : "Admin"}</span>
            </Button>
            <button
              type="button"
              className="group relative grid size-10 place-items-center rounded-full border border-white/15 bg-white/8 text-sm font-black transition hover:border-[#d9ff63]/60 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9ff63]"
              aria-label="Edit display name"
              title="Edit display name"
              onClick={openProfileEditor}
            >
              {initials(profile.name)}
              <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-[#d9ff63] text-[#142115]">
                <Pencil className="size-2.5" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-7 lg:py-8">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex items-end justify-between lg:mb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-white/40">Tonight</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-.04em]">Choose a court</h1>
            </div>
            {state.me?.role === "admin" && (
              <Button size="icon" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" aria-label="Create court" onClick={() => setCourtDialogOpen(true)}>
                <CirclePlus />
              </Button>
            )}
          </div>
          <Tabs className="min-w-0 max-w-full" value={String(selected.id)} onValueChange={(value) => setSelectedId(Number(value))}>
            <TabsList className="scrollbar-none flex h-auto w-full max-w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-white/5 p-2 lg:flex-col lg:bg-transparent lg:p-0">
              {state.courts.map((court) => {
                const full = court.players.length >= 4;
                return (
                  <TabsTrigger key={court.id} value={String(court.id)} className="h-auto min-w-[150px] justify-between rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-left text-white/65 data-[state=active]:border-[#d9ff63]/45 data-[state=active]:bg-[#d9ff63] data-[state=active]:text-[#142115] lg:w-full">
                    <span>
                      <span className="block font-black">{court.name}</span>
                      <span className="mt-1 block text-xs opacity-65">{court.queue.length} waiting</span>
                    </span>
                    <span className={`size-2.5 rounded-full ${full ? "bg-[#ff6b6b]" : "bg-[#5ee28a]"}`} aria-label={full ? "Court full" : "Space available"} />
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </aside>

        <section className="w-full min-w-0">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#102019] shadow-[0_30px_80px_rgba(0,0,0,.28)]">
            <div className="relative border-b border-[#d9ff63]/15 bg-[linear-gradient(135deg,#173426_0%,#10251b_55%,#0c1b14_100%)] p-5 sm:p-7">
              <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(217,255,99,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(217,255,99,.18)_1px,transparent_1px)] [background-size:34px_34px]" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[#d9ff63]"><span className="size-2 animate-pulse rounded-full bg-[#5ee28a]" /> Live now</div>
                  <h2 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{selected.name}</h2>
                  <p className="mt-1 text-sm text-white/55">Four spots · first in, first on</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center backdrop-blur-sm">
                  <p className="text-2xl font-black tabular-nums">{selected.players.length}<span className="text-white/30">/4</span></p>
                  <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/45">On court</p>
                </div>
              </div>

              <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((slot) => {
                  const player = selected.players[slot];
                  return (
                    <div key={slot} className={`min-h-28 rounded-2xl border p-3 ${player ? "border-[#d9ff63]/25 bg-black/25" : "border-dashed border-white/15 bg-black/10"}`}>
                      {player ? (
                        <div className="flex h-full flex-col justify-between">
                          <div className="flex items-start justify-between gap-2">
                            <PlayerAvatar name={player.displayName} index={slot} />
                            {state.me?.role === "admin" && player.userId !== state.me.id && (
                              <button className="rounded-lg p-2 text-white/35 hover:bg-white/10 hover:text-white" aria-label={`Remove ${player.displayName}`} onClick={() => setKickTarget(player)}>
                                <UserMinus className="size-4" />
                              </button>
                            )}
                          </div>
                          <p className="mt-3 truncate text-sm font-bold">{player.displayName}{player.userId === state.me?.id ? " · You" : ""}</p>
                        </div>
                      ) : (
                        <div className="grid h-full place-items-center text-center text-white/25">
                          <div><DoorOpen className="mx-auto size-5" /><p className="mt-2 text-xs font-bold uppercase tracking-[.12em]">Open spot</p></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-3 sm:flex-row">
                {!myMembership && (
                  <Button size="lg" disabled={busy} className="h-14 flex-1 rounded-2xl bg-[#d9ff63] text-base font-black text-[#142115] hover:bg-[#c8ef4e]" onClick={() => openPlayerJoin(selected.id)}>
                    <UserPlus className="size-5" /> Join this queue
                  </Button>
                )}
                {membershipElsewhere && (
                  <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
                    <Clock3 className="size-5 shrink-0 text-[#ffc857]" /> You’re already at {myMembership.court.name}. Leave it before switching courts.
                  </div>
                )}
                {meOnSelected?.status === "queued" && (
                  <>
                    <Button size="lg" disabled={busy || !canHopOn} className="h-14 flex-1 rounded-2xl bg-[#d9ff63] text-base font-black text-[#142115] hover:bg-[#c8ef4e] disabled:bg-white/10 disabled:text-white/35" onClick={() => void act({ action: "hopOn", courtId: selected.id }, "You’re on the court")}>
                      <Users className="size-5" /> Hop on
                    </Button>
                    <Button size="lg" variant="outline" disabled={busy} className="h-14 rounded-2xl border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => void act({ action: "leave", courtId: selected.id }, "Left the queue")}>
                      Leave queue
                    </Button>
                  </>
                )}
                {meOnSelected?.status === "playing" && (
                  <>
                    <Button size="lg" disabled={busy} className="h-14 flex-1 rounded-2xl bg-[#ff6b6b] text-base font-black text-white hover:bg-[#ef5b5b]" onClick={() => void act({ action: "hopOff", courtId: selected.id }, "You’re back in the queue")}>
                      <LogOut className="size-5" /> Hop off
                    </Button>
                    <Button size="lg" variant="outline" disabled={busy} className="h-14 rounded-2xl border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => void act({ action: "leave", courtId: selected.id }, "Left the court")}>
                      Leave completely
                    </Button>
                  </>
                )}
              </div>
              {meOnSelected?.status === "queued" && !canHopOn && (
                <p className="mt-3 text-center text-sm text-white/45">
                  {selected.players.length >= 4 ? "Hop on unlocks when someone hops off." : `You’re #${meOnSelected.position} in line. The next player goes first.`}
                </p>
              )}
            </div>
          </div>

          <section className="mt-5 rounded-[28px] border border-white/10 bg-white/[.035] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-white/40">Up next</p><h3 className="mt-1 text-xl font-black">Queue · {selected.queue.length}</h3></div>
              {state.me?.role === "admin" && (
                <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => setPlayerDialogOpen(true)}>
                  <UserPlus /> Add player
                </Button>
              )}
            </div>
            <div className="mt-5 space-y-2">
              {selected.queue.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 py-9 text-center">
                  <Users className="mx-auto size-6 text-white/25" /><p className="mt-2 text-sm font-semibold text-white/45">No one is waiting</p>
                </div>
              ) : selected.queue.map((player, index) => (
                <div key={player.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 p-3">
                  <span className="w-7 text-center text-sm font-black tabular-nums text-[#d9ff63]">{index + 1}</span>
                  <PlayerAvatar name={player.displayName} index={index + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{player.displayName}{player.userId === state.me?.id ? " · You" : ""}</p>
                    <p className="mt-0.5 text-xs text-white/40">{index === 0 ? "Ready to hop on" : `Behind ${index} player${index === 1 ? "" : "s"}`}</p>
                  </div>
                  {index === 0 && <Crown className="size-4 text-[#ffc857]" aria-label="Next player" />}
                  {state.me?.role === "admin" && player.userId !== state.me.id && (
                    <button className="rounded-lg p-2 text-white/35 hover:bg-white/10 hover:text-white" aria-label={`Remove ${player.displayName}`} onClick={() => setKickTarget(player)}>
                      <UserMinus className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>

      <Dialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      >
        <DialogContent className="border-white/10 bg-[#102019] text-white">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void savePlayer();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit display name</DialogTitle>
              <DialogDescription className="text-white/55">
                This updates your name everywhere you appear in the courts and queues.
              </DialogDescription>
            </DialogHeader>
            <label className="mt-5 block text-sm font-bold" htmlFor="player-display-name">Display name</label>
            <Input
              id="player-display-name"
              autoFocus
              autoComplete="nickname"
              value={myName}
              maxLength={40}
              placeholder="e.g. Jordan"
              className="mt-2 h-12 border-white/15 bg-black/15 text-white placeholder:text-white/30"
              onChange={(event) => setMyName(event.target.value)}
            />
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setProfileDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !myName.trim()} className="bg-[#d9ff63] text-[#142115] hover:bg-[#c8ef4e]">
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="border-white/10 bg-[#102019] text-white">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void adminLogin();
            }}
          >
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-[#d9ff63] text-[#142115]"><Shield className="size-5" /></div>
              <DialogTitle>Admin login</DialogTitle>
              <DialogDescription className="text-white/55">
                Admin mode unlocks court and player management.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-bold" htmlFor="admin-username">Username</label>
                <Input
                  id="admin-username"
                  autoComplete="username"
                  value={adminUsername}
                  className="mt-2 h-12 border-white/15 bg-black/15 text-white"
                  onChange={(event) => setAdminUsername(event.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold" htmlFor="admin-password">Password</label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={adminPassword}
                  className="mt-2 h-12 border-white/15 bg-black/15 text-white"
                  onChange={(event) => setAdminPassword(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setAdminDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !adminUsername.trim() || !adminPassword} className="bg-[#d9ff63] text-[#142115] hover:bg-[#c8ef4e]">
                <LogIn /> Enter admin mode
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={courtDialogOpen} onOpenChange={setCourtDialogOpen}>
        <DialogContent className="border-white/10 bg-[#102019] text-white">
          <DialogHeader><DialogTitle>Create a court</DialogTitle><DialogDescription className="text-white/55">It will appear immediately for every player.</DialogDescription></DialogHeader>
          <Input autoFocus value={courtName} maxLength={32} placeholder="e.g. Championship Court" className="h-12 border-white/15 bg-black/15 text-white placeholder:text-white/30" onChange={(event) => setCourtName(event.target.value)} />
          <DialogFooter>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setCourtDialogOpen(false)}>Cancel</Button>
            <Button disabled={busy || !courtName.trim()} className="bg-[#d9ff63] text-[#142115] hover:bg-[#c8ef4e]" onClick={() => {
              void act({ action: "createCourt", name: courtName }, "Court created").then(() => { setCourtName(""); setCourtDialogOpen(false); });
            }}>Create court</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={playerDialogOpen} onOpenChange={setPlayerDialogOpen}>
        <DialogContent className="border-white/10 bg-[#102019] text-white">
          <DialogHeader><DialogTitle>Add a player to {selected.name}</DialogTitle><DialogDescription className="text-white/55">They’ll be placed at the back of this queue.</DialogDescription></DialogHeader>
          <Input autoFocus value={playerName} maxLength={40} placeholder="Player name" className="h-12 border-white/15 bg-black/15 text-white placeholder:text-white/30" onChange={(event) => setPlayerName(event.target.value)} />
          <DialogFooter>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setPlayerDialogOpen(false)}>Cancel</Button>
            <Button disabled={busy || !playerName.trim()} className="bg-[#d9ff63] text-[#142115] hover:bg-[#c8ef4e]" onClick={() => {
              void act({ action: "addPlayer", courtId: selected.id, name: playerName }, "Player added").then(() => { setPlayerName(""); setPlayerDialogOpen(false); });
            }}>Add to queue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(kickTarget)} onOpenChange={(open) => !open && setKickTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#102019] text-white">
          <AlertDialogHeader><AlertDialogTitle>Remove {kickTarget?.displayName}?</AlertDialogTitle><AlertDialogDescription className="text-white/55">They’ll be removed from {selected.name} and can join again later.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white">Keep player</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (!kickTarget) return;
              void act({ action: "kickPlayer", membershipId: kickTarget.id }, "Player removed"); setKickTarget(null);
            }}>Remove player</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
