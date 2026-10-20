"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "../lib/supabase/browser";

type View = "COMMAND" | "MAP" | "COMMS" | "GAPS" | "REVENUE" | "CREWS" | "SETTINGS";
type MapLayer = "CREWS" | "JOBS" | "GAPS";
type SettingsTab = "PROFILE" | "FIELD OPS" | "OUTREACH" | "CONNECTIONS";
type Theme = "silver" | "daylight" | "night";
type AccountType = "field_service" | "last_mile" | "freight" | "public_works";
type Modal = "outreach" | "invoice" | "crew" | "message" | "account" | "dispatch" | null;
type SoundCue = "confirm" | "radio" | "alert" | "sync";
type CurrentUser = { email: string; displayName: string };
type WorkspaceRole = "owner" | "dispatcher";

type Crew = {
  id: string;
  name: string;
  vehicle: string;
  neighborhood: string;
  assignment: string;
  status: string;
  next: string;
  lngLat: [number, number];
  pin: { left: string; top: string };
};

type Invoice = {
  id: string;
  customer: string;
  job: string;
  amount: number;
  state: "Paid" | "Due today" | "Draft" | "Reminder sent";
};

type IntegrationKey = "stripe" | "quickbooks" | "calendar";
type ChannelId = "dispatch" | "field" | "maintenance" | "leadership";
type TeamMessage = { id: string; channel: ChannelId; author: string; initials: string; role: string; body: string; time: string; urgent?: boolean; reactions: number; pinned?: boolean };

type AppSettings = {
  businessName: string;
  homeBase: string;
  accountType: AccountType;
  serviceRadius: number;
  dispatchMode: "Approval first" | "Auto-dispatch";
  startHour: string;
  endHour: string;
  outreachEnabled: boolean;
  theme: Theme;
  compact: boolean;
  motion: boolean;
  sound: boolean;
  integrations: Record<IntegrationKey, boolean>;
};

const defaultSettings: AppSettings = {
  businessName: "",
  homeBase: "",
  accountType: "field_service",
  serviceRadius: 0,
  dispatchMode: "Approval first",
  startHour: "",
  endHour: "",
  outreachEnabled: false,
  theme: "silver",
  compact: false,
  motion: true,
  sound: false,
  integrations: { stripe: false, quickbooks: false, calendar: false },
};

const navItems: Array<{ id: View; label: string; icon: string; hint: string }> = [
  { id: "MAP", label: "Dispatch", icon: "⌖", hint: "Live operations board" },
  { id: "COMMS", label: "Team comms", icon: "◍", hint: "Channels & handoffs" },
  { id: "COMMAND", label: "Overview", icon: "◉", hint: "Performance & pulse" },
  { id: "GAPS", label: "Route gaps", icon: "✦", hint: "Capacity opportunities" },
  { id: "REVENUE", label: "Revenue", icon: "$", hint: "Invoices & payments" },
  { id: "CREWS", label: "Crews", icon: "◎", hint: "Team roster" },
  { id: "SETTINGS", label: "Setup", icon: "⚙", hint: "Rules & connections" },
];

const accountProfiles: Record<AccountType, { label: string; people: string; work: string; exception: string }> = {
  field_service: { label: "Field service", people: "Crews", work: "Jobs", exception: "Route gaps" },
  last_mile: { label: "Last-mile delivery", people: "Drivers", work: "Stops", exception: "Exceptions" },
  freight: { label: "Freight & fleet", people: "Units", work: "Loads", exception: "Delays" },
  public_works: { label: "Public works", people: "Field units", work: "Work orders", exception: "Incidents" },
};

const dispatchFeeds: Record<AccountType, Array<{ id: string; priority: string; title: string; meta: string; crew: string }>> = {
  field_service: [], last_mile: [], freight: [], public_works: [],
};
const crews: Crew[] = [];
const jobs: Array<{ id: string; label: string; lngLat: [number, number]; pin: { left: string; top: string } }> = [];
const alerts: Array<{ time: string; title: string; text: string }> = [];
const initialInvoices: Invoice[] = [];
const initialTeamMessages: TeamMessage[] = [];

const viewTitles: Record<View, { eyebrow: string; title: string; copy: string }> = {
  COMMAND: { eyebrow: "WORKSPACE OVERVIEW", title: "Welcome to Naviwork.", copy: "Add your business details and connect your own operational data to get started." },
  MAP: { eyebrow: "DISPATCH CHANNEL 01", title: "Live dispatch control", copy: "Your dispatches and field teams will appear here once you add them." },
  COMMS: { eyebrow: "TEAM RADIO · READY FOR SETUP", title: "Team communications", copy: "Keep every conversation attached to the work, the route, and the people who need it." },
  GAPS: { eyebrow: "OPPORTUNITY SCAN", title: "Route gaps", copy: "Review suggested work before anything reaches a customer." },
  REVENUE: { eyebrow: "MONEY FEED", title: "Revenue & collections", copy: "Track today’s value and turn outstanding work into collected revenue." },
  CREWS: { eyebrow: "FIELD CHANNEL", title: "Crews", copy: "See who is moving, who is free, and what each team needs next." },
  SETTINGS: { eyebrow: "CONTROL SETUP", title: "Workspace settings", copy: "Make Naviwork match the way your team runs the day." },
};

export default function Home() {
  const [active, setActive] = useState<View>("MAP");
  const [mapLayer, setMapLayer] = useState<MapLayer>("CREWS");
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("PROFILE");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [selectedCustomer] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [message, setMessage] = useState("");
  const [crewMessage, setCrewMessage] = useState("");
  const [mapZoom, setMapZoom] = useState(1);
  const [recenterKey, setRecenterKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "local">("local");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [assignedDispatches, setAssignedDispatches] = useState<string[]>([]);
  const [createdDispatch, setCreatedDispatch] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>("dispatch");
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>(initialTeamMessages);
  const [teamDraft, setTeamDraft] = useState("");
  const [messageUrgent, setMessageUrgent] = useState(false);
  const [huddleActive, setHuddleActive] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>("owner");
  const [workspaceName, setWorkspaceName] = useState("Workspace");
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "ready" | "membership_required" | "setup_required" | "error">(() => isSupabaseConfigured() ? "loading" : "setup_required");
  const [dispatchTitle, setDispatchTitle] = useState("");
  const [dispatchNeighborhood, setDispatchNeighborhood] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const selectedCrew = crews.find((crew) => crew.id === selectedCrewId);
  const selectedInvoice = invoices[0];
  const permittedNav = useMemo(() => navItems.filter((item) => (workspaceRole === "owner" ? ["COMMAND", "REVENUE", "MAP", "SETTINGS"] : ["MAP", "CREWS", "GAPS", "COMMS", "SETTINGS"]).includes(item.id)), [workspaceRole]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
  }, []);

  const goTo = useCallback((view: View) => {
    setActive(view);
    setAlertsOpen(false);
    setCommandOpen(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const loadWorkspace = async (knownSession?: { access_token: string } | null) => {
      setAuthState("loading");
      const { data: { session } } = knownSession === undefined ? await supabase.auth.getSession() : { data: { session: knownSession } };
      if (!session) { setAuthState("signed_out"); return; }
      try {
        const response = await fetch("/api/workspace", { headers: { authorization: `Bearer ${session.access_token}` } });
        const data = await response.json().catch(() => null);
        if (!response.ok) { setAuthState(response.status === 401 ? "membership_required" : "error"); return; }
      setCurrentUser(data.user);
      setWorkspaceRole(data.membership.role);
      setWorkspaceName(data.membership.workspaceName);
      setSettings((current) => ({ ...current, ...data.settings }));
      setSaveState("saved");
      if (Array.isArray(data.messages)) setTeamMessages(data.messages.map((item: { id: string; channel: ChannelId; body: string; priority: boolean; created_at: string; profiles?: { full_name?: string; email?: string } | null }) => ({ id: item.id, channel: item.channel, body: item.body, urgent: item.priority, time: new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), author: item.profiles?.full_name ?? item.profiles?.email ?? "Team member", initials: (item.profiles?.full_name ?? item.profiles?.email ?? "TM").split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(), role: "Team", reactions: 0 })));
      setAuthState("ready");
      setActive(data.membership.role === "owner" ? "COMMAND" : "MAP");
      } catch {
        setAuthState("error");
      }
    };
    void loadWorkspace();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase holds its auth lock while this callback runs. Deferring the
      // workspace request prevents a post-OAuth callback from re-reading a
      // stale session and falling back to the sign-in prompt.
      window.setTimeout(() => { void loadWorkspace(session); }, 0);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.localStorage.removeItem("naviwork-settings");
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setModal(null);
        setCommandOpen(false);
        setAlertsOpen(false);
        setCustomizerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaveState("local");
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowser();
    const result = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const session = result.data.session;
    if (!session) throw new Error("Sign in to your Supabase workspace first.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${session.access_token}`);
    if (init.body) headers.set("content-type", "application/json");
    return fetch(path, { ...init, headers });
  }, []);

  const signInWithGoogle = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) { showNotice("Add Supabase browser settings before enabling sign-in."); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) showNotice(error.message);
  };

  const sendMagicLink = async (email: string) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) { showNotice("Add Supabase browser settings before enabling sign-in."); return; }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    showNotice(error ? error.message : "Magic link sent. Check your email to continue.");
  };

  const playCue = useCallback((cue: SoundCue) => {
    if (!settings.sound || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    const tones: Record<SoundCue, Array<[number, number, number]>> = {
      confirm: [[520, 0, 0.06], [720, 0.07, 0.08]],
      radio: [[860, 0, 0.025], [1120, 0.04, 0.035]],
      alert: [[390, 0, 0.09], [390, 0.13, 0.09]],
      sync: [[460, 0, 0.045], [580, 0.05, 0.045], [700, 0.1, 0.07]],
    };
    const start = context.currentTime;
    tones[cue].forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = cue === "alert" ? "square" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start + delay);
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.035, start + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + duration + 0.01);
    });
  }, [settings.sound]);

  const saveWorkspace = async () => {
    setSaveState("saving");
    try {
      const response = await authorizedFetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", settings }),
      });
      if (!response.ok) throw new Error("workspace unavailable");
      setSaveState("saved");
      playCue("confirm");
      showNotice("Workspace settings saved to Supabase.");
    } catch {
      setSaveState("local");
      showNotice("Workspace settings need an owner session and configured Supabase workspace.");
    }
  };

  const toggleIntegration = (key: IntegrationKey) => {
    const provider = key === "calendar" ? "google_calendar" : key === "quickbooks" ? "quickbooks" : null;
    if (!provider) { showNotice("Stripe is not configured for this workspace. Use QuickBooks for owner finance sync."); return; }
    void authorizedFetch(`/api/integrations/${provider}/connect`, { method: "POST" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Connection could not be started.");
      window.location.assign(data.authorizationUrl);
    }).catch((error) => showNotice(error instanceof Error ? error.message : "Connection could not be started."));
  };

  const syncNow = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      playCue("sync");
      showNotice("Routes, invoices, and calendars are up to date.");
    }, 900);
  };

  const queueOutreach = () => {
    setModal(null);
    showNotice(`Outreach to ${selectedCustomer} queued for dispatcher approval.`);
  };

  const sendReminder = () => {
    if (!selectedInvoice) return;
    setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoice.id ? { ...invoice, state: "Reminder sent" } : invoice));
    setModal(null);
    showNotice(`Payment reminder sent to ${selectedInvoice.customer}.`);
  };

  const persistTeamMessages = useCallback((next: TeamMessage[]) => {
    setTeamMessages(next);
  }, []);

  const sendTeamMessage = (body = teamDraft, urgent = messageUrgent) => {
    const cleanBody = body.trim();
    if (!cleanBody) return;
    const now = new Date();
    const nextMessage: TeamMessage = {
      id: `m-${now.getTime()}`,
      channel: selectedChannel,
      author: currentUser?.displayName || "Team member",
      initials: (currentUser?.displayName || "TM").split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      role: workspaceRole === "owner" ? "Owner" : "Dispatcher",
      body: cleanBody,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      urgent,
      reactions: 0,
    };
    persistTeamMessages([...teamMessages, nextMessage]);
    void authorizedFetch("/api/messages", { method: "POST", body: JSON.stringify({ channel: selectedChannel, body: cleanBody, priority: urgent }) }).then((response) => {
      if (!response.ok) throw new Error("message not saved");
      setSaveState("saved");
    }).catch(() => { setSaveState("local"); showNotice("Message is visible here, but was not saved. Sign in to an active workspace to sync it."); });
    setTeamDraft("");
    setMessageUrgent(false);
    playCue(urgent ? "alert" : "radio");
    showNotice(`Posted to ${channelNames[selectedChannel]}.`);
  };

  const reactToMessage = (id: string) => {
    persistTeamMessages(teamMessages.map((item) => item.id === id ? { ...item, reactions: item.reactions + 1 } : item));
  };

  const pinMessage = (id: string) => {
    const target = teamMessages.find((item) => item.id === id);
    persistTeamMessages(teamMessages.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item));
    showNotice(target?.pinned ? "Message unpinned." : "Message pinned for the team.");
  };

  const pageTitle = viewTitles[active];

  const submitDispatch = async () => {
    if (!dispatchTitle.trim()) return;
    try {
      const response = await authorizedFetch("/api/workspace", { method: "POST", body: JSON.stringify({ action: "create", title: dispatchTitle, neighborhood: dispatchNeighborhood }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Dispatch could not be created.");
      setCreatedDispatch(true); setSelectedDispatchId(data.dispatch.code); setMapLayer("JOBS"); setModal(null); setDispatchTitle(""); playCue("radio"); showNotice(`New dispatch ${data.dispatch.code} created.`);
    } catch (error) { showNotice(error instanceof Error ? error.message : "Dispatch could not be created."); }
  };

  if (authState !== "ready" || !currentUser) {
    return <AccessGate state={authState} signInWithGoogle={signInWithGoogle} sendMagicLink={sendMagicLink} />;
  }

  return (
    <main className={`app-shell theme-${settings.theme} ${settings.compact ? "is-compact" : ""} ${settings.motion ? "" : "reduce-motion"}`}>
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <button type="button" className="brand" onClick={() => goTo("MAP")} aria-label="Open live dispatch board">
          <span className="lens-mark"><i /></span>
          <span><strong>NAVIWORK</strong><small>FIELD COMMAND · HI8</small></span>
        </button>
        <label className="account-switch"><span>OPS TYPE</span><select value={settings.accountType} onChange={(event) => updateSettings("accountType", event.target.value as AccountType)}>{(Object.keys(accountProfiles) as AccountType[]).map((type) => <option key={type} value={type}>{accountProfiles[type].label}</option>)}</select></label>
        <button type="button" className={`record-strip ${tracking ? "is-live" : ""}`} onClick={() => setTracking((current) => !current)} aria-pressed={tracking}>
          <span className="rec-dot" />
          <b>{tracking ? "REC · LIVE FIELD LINK" : "PAUSED · FIELD LINK"}</b>
          <em>{settings.homeBase || "NO HOME BASE"} · {crews.length} TEAMS</em>
        </button>
        <div className="top-actions">
          <button type="button" className="search-button" onClick={() => setCommandOpen(true)}><span>Jump to…</span><kbd>⌘ K</kbd></button>
          <button type="button" className={alertsOpen ? "icon-button active" : "icon-button"} onClick={() => { setAlertsOpen((open) => !open); if (!alertsOpen) playCue("alert"); }} aria-label="Open activity alerts">{alerts.length > 0 && <span>{alerts.length}</span>}⌁</button>
          <button type="button" className={settings.sound ? "icon-button sound-active" : "icon-button"} onClick={() => { updateSettings("sound", !settings.sound); if (!settings.sound) window.setTimeout(() => playCue("confirm"), 0); }} aria-label={settings.sound ? "Mute interface sounds" : "Enable interface sounds"}>{settings.sound ? "♪" : "♩"}</button>
          <button type="button" className="icon-button" onClick={() => setCustomizerOpen(true)} aria-label="Customize appearance">◐</button>
          <button type="button" className="profile-button" onClick={() => setModal("account")} aria-label="Open account">{currentUser ? currentUser.displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "IN"}</button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="Primary navigation">
          {permittedNav.map((item) => (
            <button type="button" key={item.id} className={active === item.id ? "active" : ""} onClick={() => goTo(item.id)}>
              <i>{item.icon}</i><span><b>{item.label}</b><small>{item.hint}</small></span>{item.id === "GAPS" && alerts.length > 0 && <em>{alerts.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="storage-bar"><span><i /> {saveState === "saved" ? "Workspace synced" : "Saved on device"}</span></div>
          <button type="button" onClick={syncNow} className={syncing ? "syncing" : ""}><i>↻</i><span><b>{syncing ? "Syncing…" : "Sync now"}</b><small>{saveState === "saved" ? "Workspace connected" : "No sync completed"}</small></span></button>
        </div>
      </aside>

      <section className={`workspace ${active === "MAP" ? "dispatch-workspace" : active === "COMMS" ? "comms-workspace" : ""}`}>
        <div className="page-heading">
          <div><span>{pageTitle.eyebrow}</span><h1>{pageTitle.title}</h1><p>{pageTitle.copy}</p></div>
          <div className="heading-actions">
            {active === "MAP" && <><button type="button" className="secondary-button" onClick={() => { setRecenterKey((key) => key + 1); showNotice(settings.homeBase ? `Map recentered on ${settings.homeBase}.` : "Add a home base in Setup first."); }}>⌖ Recenter</button><button type="button" className="primary-button" onClick={() => setModal("dispatch")}>Create dispatch</button></>}
            {active === "COMMS" && <><button type="button" className="secondary-button" onClick={() => { setSelectedChannel("dispatch"); setTeamDraft("All teams — "); }}>Broadcast update</button><button type="button" className={huddleActive ? "primary-button huddle-live" : "primary-button"} onClick={() => { setHuddleActive((current) => !current); playCue("radio"); showNotice(huddleActive ? "Dispatch huddle ended." : "Dispatch huddle is live."); }}>{huddleActive ? "● End huddle" : "◉ Start huddle"}</button></>}
            {active === "COMMAND" && <><button type="button" className="secondary-button" onClick={() => goTo("MAP")}>Open dispatch</button><button type="button" className="primary-button" onClick={() => goTo("SETTINGS")}>Set up workspace</button></>}
            {active === "REVENUE" && <button type="button" className="primary-button" onClick={() => { setSettingsTab("CONNECTIONS"); goTo("SETTINGS"); }}>Payment settings</button>}
            {active === "CREWS" && <button type="button" className="primary-button" onClick={() => { setSettingsTab("FIELD OPS"); goTo("SETTINGS"); }}>Edit crew rules</button>}
            {active === "SETTINGS" && <button type="button" className="primary-button" onClick={saveWorkspace}>{saveState === "saving" ? "Saving…" : "Save workspace"}</button>}
          </div>
        </div>

        <div className="view-stage" key={active}>
          {active === "COMMAND" && <EmptyWorkspaceView goTo={goTo} businessName={settings.businessName} />}
          {active === "MAP" && (
            selectedCrew ? <MapView
              layer={mapLayer}
              setLayer={setMapLayer}
              selectedCrew={selectedCrew}
              selectCrew={setSelectedCrewId}
              openCrew={() => setModal("crew")}
              zoom={mapZoom}
              setZoom={setMapZoom}
              recenterKey={recenterKey}
              showNotice={showNotice}
              accountType={settings.accountType}
              selectedDispatchId={selectedDispatchId}
              selectDispatch={(id, crewId) => { setSelectedDispatchId(id); setSelectedCrewId(crewId); setMapLayer("JOBS"); }}
              assignedDispatches={assignedDispatches}
              assignDispatch={(id) => { void authorizedFetch("/api/workspace", { method: "POST", body: JSON.stringify({ action: "assign", dispatchId: id, crewId: selectedCrew.id }) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setAssignedDispatches((current) => current.includes(id) ? current : [...current, id]); playCue("confirm"); showNotice(`${id} assigned to ${selectedCrew.name}.`); }).catch((error) => showNotice(error instanceof Error ? error.message : "Assignment could not be saved.")); }}
              createdDispatch={createdDispatch}
              createDispatch={() => setModal("dispatch")}
              openMessage={() => setModal("message")}
            homeBase={settings.homeBase}
            /> : <MapEmptyView homeBase={settings.homeBase} zoom={mapZoom} setZoom={setMapZoom} recenterKey={recenterKey} goToSetup={() => goTo("SETTINGS")} />
          )}
          {active === "COMMS" && <TeamCommsView messages={teamMessages} channel={selectedChannel} setChannel={setSelectedChannel} draft={teamDraft} setDraft={setTeamDraft} urgent={messageUrgent} toggleUrgent={() => setMessageUrgent((current) => !current)} huddleActive={huddleActive} toggleHuddle={() => { setHuddleActive((current) => !current); playCue("radio"); }} sendMessage={sendTeamMessage} reactToMessage={reactToMessage} pinMessage={pinMessage} attachRoute={() => showNotice("Create a dispatch before attaching a route.")} addVoiceNote={() => sendTeamMessage("Voice note attached.")} createHandoff={() => sendTeamMessage("Shift handoff started.", true)} goTo={goTo} />}
          {active === "GAPS" && <EmptyState eyebrow="NO OPPORTUNITIES" title="No route gaps to review" copy="Opportunities will appear after your schedules, customers, and crews are connected." action="Manage connections" onAction={() => { setSettingsTab("CONNECTIONS"); goTo("SETTINGS"); }} />}
          {active === "REVENUE" && <EmptyState eyebrow="NO FINANCIAL DATA" title="No invoices or payments yet" copy="Connect your accounting provider to bring your own revenue data into this workspace." action="Manage connections" onAction={() => { setSettingsTab("CONNECTIONS"); goTo("SETTINGS"); }} />}
          {active === "CREWS" && <EmptyState eyebrow="EMPTY ROSTER" title="No crews have been added" copy="Your own teams will appear here after they are added through your connected operations system." action="Manage connections" onAction={() => { setSettingsTab("CONNECTIONS"); goTo("SETTINGS"); }} />}
          {active === "SETTINGS" && <SettingsView tab={settingsTab} setTab={setSettingsTab} settings={settings} updateSettings={updateSettings} toggleIntegration={toggleIntegration} openCustomizer={() => setCustomizerOpen(true)} />}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {permittedNav.map((item) => <button type="button" key={item.id} className={active === item.id ? "active" : ""} onClick={() => goTo(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}
      </nav>

      {alertsOpen && <AlertsPanel close={() => setAlertsOpen(false)} goTo={goTo} />}
      {customizerOpen && <Customizer settings={settings} updateSettings={updateSettings} close={() => setCustomizerOpen(false)} />}
      {commandOpen && <CommandPalette items={permittedNav} goTo={goTo} close={() => setCommandOpen(false)} syncNow={syncNow} openCustomizer={() => { setCommandOpen(false); setCustomizerOpen(true); }} />}
      {modal === "outreach" && <OutreachModal customer={selectedCustomer} message={message} setMessage={setMessage} close={() => setModal(null)} queue={queueOutreach} />}
      {modal === "invoice" && selectedInvoice && <InvoiceModal invoice={selectedInvoice} close={() => setModal(null)} sendReminder={sendReminder} markPaid={() => { setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoice.id ? { ...invoice, state: "Paid" } : invoice)); setModal(null); showNotice(`Invoice #${selectedInvoice.id} marked paid.`); }} />}
      {modal === "crew" && selectedCrew && <CrewModal crew={selectedCrew} close={() => setModal(null)} openMap={() => { setModal(null); goTo("MAP"); }} message={() => { setModal("message"); }} />}
      {modal === "message" && selectedCrew && <MessageModal crew={selectedCrew} value={crewMessage} setValue={setCrewMessage} close={() => setModal(null)} send={() => { setCrewMessage(""); setModal(null); showNotice(`Message sent to ${selectedCrew.name}.`); }} />}
      {modal === "account" && <AccountModal user={currentUser} settings={settings} saveState={saveState} authState={authState} workspaceName={workspaceName} configured={isSupabaseConfigured()} close={() => setModal(null)} openSettings={() => { setModal(null); goTo("SETTINGS"); }} signInWithGoogle={signInWithGoogle} sendMagicLink={sendMagicLink} />}
      {modal === "dispatch" && <DispatchModal title={dispatchTitle} setTitle={setDispatchTitle} neighborhood={dispatchNeighborhood} setNeighborhood={setDispatchNeighborhood} close={() => setModal(null)} create={submitDispatch} />}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </main>
  );
}

function EmptyWorkspaceView({ goTo, businessName }: { goTo: (view: View) => void; businessName: string }) {
  return (
    <div className="empty-workspace-grid">
      <section className="camera-panel empty-workspace-hero">
        <PanelHeader label="FRESH WORKSPACE" detail="READY FOR SETUP" />
        <div>
          <span>01 · START HERE</span>
          <h2>{businessName ? `${businessName} is ready for data.` : "Build your workspace from a clean slate."}</h2>
          <p>No sample customers, crews, jobs, invoices, messages, or activity have been loaded. Add only the information that belongs to your business.</p>
          <button type="button" className="primary-button" onClick={() => goTo("SETTINGS")}>Add business details</button>
        </div>
      </section>
      <section className="camera-panel empty-workspace-checklist">
        <PanelHeader label="OWNER CHECKLIST" detail="0 OF 3" />
        <ol><li><span>1</span><div><b>Complete your profile</b><small>Business name, home base, operating radius, and hours.</small></div></li><li><span>2</span><div><b>Connect your systems</b><small>Bring in your own calendar, accounting, and routing data.</small></div></li><li><span>3</span><div><b>Start operations</b><small>Create dispatches and invite the people who work in this workspace.</small></div></li></ol>
      </section>
    </div>
  );
}

function EmptyState({ eyebrow, title, copy, action, onAction, secondary, onSecondary }: { eyebrow: string; title: string; copy: string; action: string; onAction: () => void; secondary?: string; onSecondary?: () => void }) {
  return <section className="camera-panel empty-state"><span>{eyebrow}</span><i>＋</i><h2>{title}</h2><p>{copy}</p><div className="button-row"><button type="button" className="primary-button" onClick={onAction}>{action}</button>{secondary && onSecondary && <button type="button" className="secondary-button" onClick={onSecondary}>{secondary}</button>}</div></section>;
}

function AccessGate({ state, signInWithGoogle, sendMagicLink }: { state: string; signInWithGoogle: () => void; sendMagicLink: (email: string) => void }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const isLoading = state === "loading";
  const membershipIssue = state === "membership_required";
  const configurationIssue = state === "setup_required";
  const connectionIssue = state === "error";
  const heading = isLoading ? "Opening your workspace" : membershipIssue ? "This account needs access" : configurationIssue ? "Access is being configured" : connectionIssue ? "We could not open your workspace" : "Sign in to Naviwork";
  const copy = isLoading ? "Securely confirming your account and workspace permissions." : membershipIssue ? "Your identity is confirmed, but this email is not an active member of a Naviwork workspace." : configurationIssue ? "Authentication is not configured for this deployment yet." : connectionIssue ? "Your account is protected, but its workspace could not be loaded. Please try again." : "Use Google or a secure email link. You must sign in before accessing the command center.";
  return <main className="access-gate theme-silver">
    <div className="ambient-grid" aria-hidden="true" />
    <header className="access-topbar"><span className="lens-mark"><i /></span><div><strong>NAVIWORK</strong><small>SECURE FIELD COMMAND</small></div><em>◉ ENCRYPTED ACCESS</em></header>
    <section className="access-card" aria-live="polite">
      <div className="access-console">
        <div className="access-signal"><span>{isLoading ? "◌" : "●"}</span><p>{isLoading ? "VERIFYING SESSION" : membershipIssue ? "WORKSPACE APPROVAL REQUIRED" : connectionIssue ? "CONNECTION CHECK REQUIRED" : "SECURE WORKSPACE ACCESS"}</p></div>
        <div className="access-hero"><i>{isLoading ? "◌" : "⌁"}</i><div><b>{heading}</b><p>{copy}</p></div></div>
        {isLoading ? <div className="access-loading"><i /> Checking your secure session…</div> : <>
          {!configurationIssue && <button type="button" className="google-access-button" onClick={signInWithGoogle}><span>G</span><b>Continue with Google</b><em>→</em></button>}
          {!configurationIssue && <div className="access-divider"><span />or use a work email<span /></div>}
          {!configurationIssue && !emailOpen && <button type="button" className="email-reveal" onClick={() => setEmailOpen(true)}>Email me a secure sign-in link</button>}
          {!configurationIssue && emailOpen && <div className="email-access"><label className="field"><span>WORK EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label><button type="button" className="secondary-button" onClick={() => sendMagicLink(email)} disabled={!email.includes("@")}>Send link</button></div>}
          {membershipIssue && <div className="access-help"><b>Need workspace access?</b><span>Ask an owner to invite this email, then sign in again.</span></div>}
          {connectionIssue && <button type="button" className="email-reveal" onClick={() => window.location.reload()}>Try again</button>}
        </>}
        <p className="access-footer">Google or email-link sign-in only · No demo mode · No passwords stored by Naviwork</p>
      </div>
    </section>
  </main>;
}

function MapEmptyView({ homeBase, zoom, setZoom, recenterKey, goToSetup }: { homeBase: string; zoom: number; setZoom: (zoom: number) => void; recenterKey: number; goToSetup: () => void }) {
  return <section className="camera-panel map-panel workspace-map-empty">
    <div className="map-toolbar"><span className="map-empty-label">WORKSPACE MAP · PRIVATE TO THIS ACCOUNT</span><div className="map-tools"><button type="button" onClick={() => setZoom(Math.min(1.35, zoom + .1))} aria-label="Zoom in">＋</button><button type="button" onClick={() => setZoom(Math.max(.8, zoom - .1))} aria-label="Zoom out">−</button></div></div>
    <div className="map-frame"><MapViewport layer="CREWS" selectedCrewId="" onSelectCrew={() => undefined} zoom={zoom} recenterKey={recenterKey} homeBase={homeBase} /><div className="map-reticle" aria-hidden="true"><i /><i /></div><div className="north-indicator">N<br />↑</div><div className="map-empty-card"><span>MAP READY</span><b>{homeBase ? `Centered on ${homeBase}` : "Set your operating area"}</b><small>{homeBase ? "This map belongs to your workspace. Crews and dispatches will appear only after you add them." : "Add a home base so Naviwork can calibrate this workspace map."}</small>{!homeBase && <button type="button" className="primary-button" onClick={goToSetup}>Set home base</button>}</div></div>
    <div className="map-status"><span><i /> MAP SERVICE ONLINE</span><b>{homeBase || "OPERATING AREA REQUIRED"}</b></div>
  </section>;
}

function MapView({ layer, setLayer, selectedCrew, selectCrew, openCrew, zoom, setZoom, recenterKey, showNotice, accountType, selectedDispatchId, selectDispatch, assignedDispatches, assignDispatch, createdDispatch, createDispatch, openMessage, homeBase }: { layer: MapLayer; setLayer: (layer: MapLayer) => void; selectedCrew: Crew; selectCrew: (id: string) => void; openCrew: () => void; zoom: number; setZoom: (zoom: number) => void; recenterKey: number; showNotice: (text: string) => void; accountType: AccountType; selectedDispatchId: string; selectDispatch: (id: string, crewId: string) => void; assignedDispatches: string[]; assignDispatch: (id: string) => void; createdDispatch: boolean; createDispatch: () => void; openMessage: () => void; homeBase: string }) {
  const [routeAssist, setRouteAssist] = useState(true);
  const [queueMode, setQueueMode] = useState<"open" | "assigned">("open");
  const profile = accountProfiles[accountType];
  const feed = createdDispatch ? [...dispatchFeeds[accountType], { id: selectedDispatchId || "NEW", priority: "NEW", title: "Unassigned dispatch", meta: "Awaiting assignment", crew: selectedCrew.id }] : dispatchFeeds[accountType];
  const visibleFeed = queueMode === "assigned" ? feed.filter((item) => assignedDispatches.includes(item.id)) : feed.filter((item) => !assignedDispatches.includes(item.id));
  const activeDispatch = feed.find((item) => item.id === selectedDispatchId) ?? visibleFeed[0] ?? feed[0];
  const layerLabels: Record<MapLayer, string> = { CREWS: profile.people, JOBS: profile.work, GAPS: profile.exception };
  return (
    <div className="dispatch-board">
      <section className="instrument-rack" aria-label="Live operation status">
        <div><span>ACTIVE</span><b>{crews.length}</b><small>{profile.people}</small></div><div><span>OPEN</span><b>{feed.length}</b><small>{profile.work}</small></div><div className="warn"><span>PRIORITY</span><b>0</b><small>Need dispatch</small></div><div><span>ON TIME</span><b>—</b><small>No data</small></div><div className="signal"><i /><span>RADIO + GPS</span><b>STANDBY</b></div>
      </section>

      <aside className="camera-panel dispatch-queue">
        <PanelHeader label="INCOMING DISPATCH" detail={`${visibleFeed.length} ${queueMode.toUpperCase()}`} />
        <div className="queue-tabs" role="tablist" aria-label="Dispatch queue filter"><button type="button" role="tab" aria-selected={queueMode === "open"} className={queueMode === "open" ? "active" : ""} onClick={() => setQueueMode("open")}>OPEN</button><button type="button" role="tab" aria-selected={queueMode === "assigned"} className={queueMode === "assigned" ? "active" : ""} onClick={() => setQueueMode("assigned")}>ASSIGNED</button></div>
        <div className="queue-list">
          {visibleFeed.length ? visibleFeed.map((item) => <button type="button" key={item.id} className={selectedDispatchId === item.id ? "active" : ""} onClick={() => selectDispatch(item.id, item.crew)}><em className={`priority-${item.priority.toLowerCase()}`}>{item.priority}</em><span><b>{item.title}</b><small>{item.id} · {item.meta}</small></span><i>{assignedDispatches.includes(item.id) ? "✓" : "›"}</i></button>) : <p className="queue-empty">No {queueMode} dispatches.</p>}
        </div>
        <button type="button" className="new-dispatch-button" onClick={createDispatch} disabled={createdDispatch}><span>＋</span>{createdDispatch ? "Draft added" : "Create dispatch"}</button>
      </aside>

      <section className="camera-panel map-panel pilot-map">
        <div className="map-toolbar">
          <div className="segmented">{(["CREWS", "JOBS", "GAPS"] as MapLayer[]).map((item) => <button type="button" key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>{layerLabels[item].toUpperCase()}</button>)}</div>
          <div className="map-readout-pilot"><span>LAT —</span><span>LON —</span><b>NO LOCATION</b></div>
          <div className="map-tools"><button type="button" onClick={() => setZoom(Math.min(1.35, zoom + 0.1))} aria-label="Zoom in">＋</button><button type="button" onClick={() => setZoom(Math.max(.8, zoom - 0.1))} aria-label="Zoom out">−</button><button type="button" onClick={() => { setZoom(1); showNotice("Map reset."); }} aria-label="Fit map">⌖</button></div>
        </div>
        <div className="map-frame"><MapViewport layer={layer} selectedCrewId={selectedCrew.id} onSelectCrew={selectCrew} zoom={zoom} recenterKey={recenterKey} homeBase={homeBase} /><div className="map-reticle" aria-hidden="true"><i /><i /></div><div className="north-indicator">N<br />↑</div><div className="dispatch-tag"><span>{activeDispatch.priority}</span><b>{activeDispatch.id}</b><small>{activeDispatch.title}</small></div></div>
        <div className="map-status"><span><i /> WORKSPACE MAP · {crews.length} REPORTING</span><b>{homeBase || "SET HOME BASE IN SETUP"}</b></div>
      </section>

      <aside className="camera-panel unit-console">
        <PanelHeader label={`SELECTED ${profile.people.slice(0, -1).toUpperCase()}`} detail={selectedCrew.vehicle.toUpperCase()} />
        <div className="crew-identity"><span>{selectedCrew.id}</span><div><h3>{selectedCrew.name}</h3><p>{selectedCrew.neighborhood}</p></div><em>● LIVE</em></div>
        <div className="unit-gauges"><div><span>ETA</span><b>09</b><small>MIN</small></div><div><span>LOAD</span><b>68</b><small>%</small></div><div><span>SHIFT</span><b>4.2</b><small>HR</small></div></div>
        <dl><div><dt>Current</dt><dd>{selectedCrew.assignment}</dd></div><div><dt>Status</dt><dd><i /> {selectedCrew.status}</dd></div><div><dt>Next update</dt><dd>{selectedCrew.next}</dd></div></dl>
        <div className="dispatch-assignment"><span>SELECTED DISPATCH</span><b>{activeDispatch.id}</b><p>{activeDispatch.title}</p><button type="button" className="primary-button" onClick={() => assignDispatch(activeDispatch.id)} disabled={assignedDispatches.includes(activeDispatch.id)}>{assignedDispatches.includes(activeDispatch.id) ? `✓ Assigned to ${selectedCrew.id}` : `Assign to ${selectedCrew.id}`}</button></div>
        <div className="unit-actions"><button type="button" onClick={openMessage}>RADIO</button><button type="button" onClick={openCrew}>DETAIL</button><button type="button" onClick={() => { selectCrew(crews[(crews.findIndex((crew) => crew.id === selectedCrew.id) + 1) % crews.length].id); }}>NEXT UNIT</button></div>
      </aside>

      <section className="flight-deck">
        <div className="deck-label"><span>DISPATCH CONTROL</span><b>CH 01</b></div>
        <button type="button" className="guarded-button" onClick={openMessage}><i>◉</i><span><b>ALL CALL</b><small>Radio selected unit</small></span></button>
        <button type="button" className={routeAssist ? "cockpit-button active" : "cockpit-button"} onClick={() => { setRouteAssist((value) => !value); showNotice(`Route assist ${routeAssist ? "disengaged" : "engaged"}.`); }}><i>↝</i><span><b>AUTO ROUTE</b><small>{routeAssist ? "Engaged" : "Standby"}</small></span></button>
        <button type="button" className="cockpit-button" onClick={() => setLayer("GAPS")}><i>⌁</i><span><b>SCAN {profile.exception.toUpperCase()}</b><small>Find risk & capacity</small></span></button>
        <button type="button" className="cockpit-button" onClick={() => { setZoom(1); showNotice("Tactical map reset."); }}><i>⌖</i><span><b>RECENTER</b><small>Home base</small></span></button>
        <button type="button" className="launch-button" onClick={createDispatch} disabled={createdDispatch}><i>＋</i><span><b>NEW DISPATCH</b><small>{createdDispatch ? "Draft on board" : "Open assignment"}</small></span></button>
      </section>
    </div>
  );
}

function MapViewport({ layer, selectedCrewId, onSelectCrew, zoom, recenterKey, homeBase }: { layer: MapLayer; selectedCrewId: string; onSelectCrew: (id: string) => void; zoom: number; recenterKey: number; homeBase: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

  useEffect(() => {
    if (!element.current || !token || map.current) return;
    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: element.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 20],
      zoom: 12,
      attributionControl: false,
    });
    return () => { map.current?.remove(); map.current = null; };
  }, [token]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const addMarker = (className: string, text: string, lngLat: [number, number], onClick?: () => void) => {
      const element = onClick ? document.createElement("button") : document.createElement("div");
      element.className = className;
      element.textContent = text;
      if (element instanceof HTMLButtonElement) {
        element.type = "button";
        element.setAttribute("aria-label", text);
        element.onclick = (event) => { event.stopPropagation(); onClick(); };
      } else {
        element.setAttribute("aria-hidden", "true");
      }
      markers.current.push(new mapboxgl.Marker({ element }).setLngLat(lngLat).addTo(map.current!));
    };
    if (layer === "CREWS") crews.forEach((crew) => addMarker(`map-crew-marker ${selectedCrewId === crew.id ? "selected" : ""}`, crew.id, crew.lngLat, () => onSelectCrew(crew.id)));
    if (layer === "JOBS") jobs.forEach((job) => addMarker("map-job-marker", job.id, job.lngLat));
    if (layer === "GAPS" && crews[0] && jobs[0]) [crews[0].lngLat, jobs[0].lngLat].forEach((point, index) => addMarker("map-gap-marker", `G${index + 1}`, point));
  }, [layer, selectedCrewId, onSelectCrew, token]);

  useEffect(() => {
    if (!map.current) return;
    const target = crews.find((crew) => crew.id === selectedCrewId) ?? crews[0];
    if (!target) return;
    map.current.easeTo({ center: target.lngLat, zoom: 11.8 + zoom, duration: 650 });
  }, [selectedCrewId, zoom, recenterKey]);

  if (token) return <div className="live-map" ref={element} onPointerDown={(event) => event.stopPropagation()} />;

  return (
    <div className="fallback-map" style={{ "--map-zoom": zoom } as React.CSSProperties}>
      <div className="map-paper">
        <div className="water"><span>SAN FRANCISCO BAY</span></div>
        <i className="road r-a" /><i className="road r-b" /><i className="road r-c" /><i className="road r-d" />
        <span className="map-label l-downtown">{homeBase ? homeBase.toUpperCase() : "SET YOUR"}<br />{homeBase ? "WORKSPACE MAP" : "HOME BASE"}</span>
        {layer === "CREWS" && crews.map((crew) => <button type="button" key={crew.id} className={`fallback-pin crew ${selectedCrewId === crew.id ? "selected" : ""}`} style={crew.pin} onClick={() => onSelectCrew(crew.id)} aria-label={`Select ${crew.name}`}><b>{crew.id}</b><small>{crew.status}</small></button>)}
        {layer === "JOBS" && jobs.map((job) => <div key={job.id} className="fallback-pin job" style={job.pin}><b>{job.id}</b><small>{job.label}</small></div>)}
        {layer === "GAPS" && <div className="gap-bubble gap-one"><b>—</b><small>No openings</small></div>}
      </div>
      <div className="fallback-note">{homeBase ? `${homeBase.toUpperCase()} · PRIVATE WORKSPACE MAP` : "WORKSPACE MAP · SET A HOME BASE TO CALIBRATE"}</div>
    </div>
  );
}

const channelNames: Record<ChannelId, string> = {
  dispatch: "Dispatch room",
  field: "Field team",
  maintenance: "Fleet & maintenance",
  leadership: "Leadership",
};

const channelMeta: Array<{ id: ChannelId; label: string; detail: string; icon: string; unread?: number; direct?: boolean }> = [
  { id: "dispatch", label: "Dispatch room", detail: "No messages", icon: "#" },
  { id: "field", label: "Field team", detail: "No crews", icon: "#" },
  { id: "maintenance", label: "Fleet & maintenance", detail: "Vehicles + parts", icon: "#" },
  { id: "leadership", label: "Leadership", detail: "Private channel", icon: "⌁" },
];

function TeamCommsView({ messages, channel, setChannel, draft, setDraft, urgent, toggleUrgent, huddleActive, toggleHuddle, sendMessage, reactToMessage, pinMessage, attachRoute, addVoiceNote, createHandoff, goTo }: {
  messages: TeamMessage[];
  channel: ChannelId;
  setChannel: (channel: ChannelId) => void;
  draft: string;
  setDraft: (value: string) => void;
  urgent: boolean;
  toggleUrgent: () => void;
  huddleActive: boolean;
  toggleHuddle: () => void;
  sendMessage: (body?: string, urgent?: boolean) => void;
  reactToMessage: (id: string) => void;
  pinMessage: (id: string) => void;
  attachRoute: () => void;
  addVoiceNote: () => void;
  createHandoff: () => void;
  goTo: (view: View) => void;
}) {
  const [search, setSearch] = useState("");
  const activeChannel = channelMeta.find((item) => item.id === channel) ?? channelMeta[0];
  const visibleMessages = messages.filter((item) => item.channel === channel && `${item.author} ${item.body}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="comms-layout">
      <aside className="camera-panel comms-rail">
        <PanelHeader label="TEAM RADIO" detail="NO MEMBERS" />
        <label className="channel-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this channel" aria-label="Search current channel" /></label>
        <p className="rail-label">CHANNELS</p>
        <div className="channel-list">
          {channelMeta.filter((item) => !item.direct).map((item) => <button type="button" key={item.id} className={channel === item.id ? "active" : ""} onClick={() => setChannel(item.id)}><i>{item.icon}</i><span><b>{item.label}</b><small>{item.detail}</small></span>{item.unread && <em>{item.unread}</em>}</button>)}
        </div>
        <button type="button" className="new-channel-button" onClick={() => { setChannel("dispatch"); setDraft("New channel request: "); }}>＋ Request a channel</button>
      </aside>

      <section className="camera-panel conversation-panel">
        <header className="conversation-head">
          <div><span>{activeChannel.icon}</span><div><h2>{activeChannel.label}</h2><p>{activeChannel.detail} · messages sync with dispatch</p></div></div>
          <button type="button" className={huddleActive ? "huddle-button live" : "huddle-button"} onClick={toggleHuddle}>{huddleActive ? "● Huddle live" : "◉ Join huddle"}</button>
        </header>
        {huddleActive && <div className="live-huddle"><span className="audio-bars"><i /><i /><i /><i /></span><b>Dispatch huddle in progress</b><small>Waiting for team members</small><button type="button" onClick={toggleHuddle}>Leave</button></div>}
        <div className="message-stream" aria-live="polite">
          {visibleMessages.length === 0 && <div className="empty-messages"><b>No messages match</b><span>Clear the search or start the conversation.</span><button type="button" onClick={() => setSearch("")}>Clear search</button></div>}
          {visibleMessages.map((item) => <article className={`team-message ${item.urgent ? "urgent" : ""}`} key={item.id}>
            <div className={`message-avatar ${item.author.includes("Assist") ? "assist" : ""}`}>{item.initials}</div>
            <div className="message-copy">
              <header><b>{item.author}</b><span>{item.role}</span><time>{item.time}</time>{item.pinned && <em>PINNED</em>}</header>
              <p>{item.body}</p>
              <footer><button type="button" onClick={() => reactToMessage(item.id)} aria-label={`React to ${item.author}'s message`}>♥ {item.reactions}</button><button type="button" onClick={() => pinMessage(item.id)}>{item.pinned ? "Unpin" : "Pin"}</button>{item.urgent && <span>Priority broadcast</span>}</footer>
            </div>
          </article>)}
        </div>
        <div className={`message-composer ${urgent ? "urgent" : ""}`}>
          {urgent && <div className="urgent-banner"><b>Priority broadcast</b><span>Everyone in this channel will be alerted.</span></div>}
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} placeholder={`Message ${activeChannel.label}…`} aria-label={`Message ${activeChannel.label}`} />
          <div className="composer-actions"><div><button type="button" onClick={attachRoute} title="Attach active route">⌖ <span>Route</span></button><button type="button" className={urgent ? "active" : ""} onClick={toggleUrgent} title="Toggle priority">! <span>Priority</span></button><button type="button" onClick={addVoiceNote} title="Add voice note">◖ <span>Voice</span></button></div><span>⌘ Enter to send</span><button type="button" className="send-button" onClick={() => sendMessage()} disabled={!draft.trim()}>Send ↗</button></div>
        </div>
      </section>

      <aside className="comms-context">
        <section className="camera-panel linked-operation"><PanelHeader label="LINKED OPERATION" detail="EMPTY" /><span className="operation-id">NONE</span><h3>No dispatch selected</h3><p>Create a dispatch to attach messages and team activity to operational work.</p><div><span><i /> Workspace ready</span><b>—</b></div><button type="button" className="primary-button" onClick={() => goTo("MAP")}>Open dispatch</button></section>
        <section className="camera-panel presence-card"><PanelHeader label="TEAM PRESENCE" detail="EMPTY" /><p className="queue-empty">No crew members have been added.</p></section>
        <section className="camera-panel handoff-card"><PanelHeader label="SMART HANDOFF" detail="EMPTY" /><div className="handoff-tape"><span>Auto brief</span><b>0 decisions</b><small>Handoffs will summarize your own jobs, crew state, and exceptions.</small></div><button type="button" className="secondary-button" onClick={createHandoff}>Start handoff</button></section>
      </aside>
    </div>
  );
}

function SettingsView({ tab, setTab, settings, updateSettings, toggleIntegration, openCustomizer }: { tab: SettingsTab; setTab: (tab: SettingsTab) => void; settings: AppSettings; updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void; toggleIntegration: (key: IntegrationKey) => void; openCustomizer: () => void }) {
  return (
    <div className="settings-layout camera-panel">
      <nav className="settings-nav" aria-label="Settings sections">{(["PROFILE", "FIELD OPS", "OUTREACH", "CONNECTIONS"] as SettingsTab[]).map((item, index) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}><i>0{index + 1}</i><span>{item}</span><b>›</b></button>)}</nav>
      <section className="settings-content">
        {tab === "PROFILE" && <><SettingsHeading title="Business profile" copy="Add the details for this owner's operation. New workspaces start empty." /><div className="field-pair"><label className="field"><span>Business name</span><input value={settings.businessName} onChange={(event) => updateSettings("businessName", event.target.value)} placeholder="Enter business name" /></label><label className="field"><span>Account type</span><select value={settings.accountType} onChange={(event) => updateSettings("accountType", event.target.value as AccountType)}>{(Object.keys(accountProfiles) as AccountType[]).map((type) => <option key={type} value={type}>{accountProfiles[type].label}</option>)}</select></label></div><div className="account-preview"><span>ACTIVE OPERATIONS PROFILE</span><b>{settings.businessName || "Not named yet"}</b><small>{accountProfiles[settings.accountType].people} · {accountProfiles[settings.accountType].work} · {accountProfiles[settings.accountType].exception}</small></div><div className="field-pair"><label className="field"><span>Home base</span><input value={settings.homeBase} onChange={(event) => updateSettings("homeBase", event.target.value)} placeholder="City, state or service area" /></label><label className="field"><span>Operating radius</span><select value={settings.serviceRadius} onChange={(event) => updateSettings("serviceRadius", Number(event.target.value))}><option value={0}>Not set</option><option value={12}>12 miles</option><option value={18}>18 miles</option><option value={25}>25 miles</option></select></label></div><button type="button" className="customize-row" onClick={openCustomizer}><span><i>◐</i><b>Appearance</b><small>{settings.theme} theme · {settings.compact ? "compact" : "comfortable"}</small></span><em>Customize ›</em></button></>}
        {tab === "FIELD OPS" && <><SettingsHeading title="Field operations" copy="Control dispatch behavior and the workday guardrails." /><div className="choice-grid"><button type="button" className={settings.dispatchMode === "Approval first" ? "active" : ""} onClick={() => updateSettings("dispatchMode", "Approval first")}><i>✓</i><b>Approval first</b><small>A dispatcher approves route changes.</small></button><button type="button" className={settings.dispatchMode === "Auto-dispatch" ? "active" : ""} onClick={() => updateSettings("dispatchMode", "Auto-dispatch")}><i>⚡</i><b>Auto-dispatch</b><small>Qualified gaps can be filled automatically.</small></button></div><div className="field-pair"><label className="field"><span>Day starts</span><input type="time" value={settings.startHour} onChange={(event) => updateSettings("startHour", event.target.value)} /></label><label className="field"><span>Day ends</span><input type="time" value={settings.endHour} onChange={(event) => updateSettings("endHour", event.target.value)} /></label></div><div className="info-note"><i>i</i><span><b>{settings.homeBase || "Operating area not set"}</b><small>{settings.serviceRadius ? `${settings.serviceRadius}-mile service radius.` : "Add a home base and operating radius in Business profile."}</small></span></div></>}
        {tab === "OUTREACH" && <><SettingsHeading title="Customer outreach" copy="Choose how suggested messages are handled." /><ToggleRow label="Enable gap-fill outreach" copy="Show eligible customers when a route opening appears." value={settings.outreachEnabled} toggle={() => updateSettings("outreachEnabled", !settings.outreachEnabled)} /><div className="message-template"><span>EARLIER APPOINTMENT TEMPLATE</span><p>Hi {'{first name}'} — we have an earlier opening today at {'{time}'}. Would you like us to move up your {'{service}'}? Reply YES to accept.</p><small>Variables are filled automatically. Every message remains editable before sending.</small></div></>}
        {tab === "CONNECTIONS" && <><SettingsHeading title="Connections" copy="Maps are built into every secure workspace. Connect calendars and accounting when you are ready." /><div className="integration-grid"><BuiltInMapCard homeBase={settings.homeBase} /><IntegrationCard id="calendar" name="Google Calendar" category="Jobs & availability" connected={settings.integrations.calendar} toggle={() => toggleIntegration("calendar")} /><IntegrationCard id="stripe" name="Stripe" category="Not enabled in this workspace" connected={false} toggle={() => toggleIntegration("stripe")} /><IntegrationCard id="quickbooks" name="QuickBooks" category="Invoices & accounting" connected={settings.integrations.quickbooks} toggle={() => toggleIntegration("quickbooks")} /></div><p className="integration-note">Each workspace has its own map and operational records. Calendar and accounting connections are optional and secured server-side.</p></>}
      </section>
    </div>
  );
}

function IntegrationCard({ id, name, category, connected, toggle }: { id: IntegrationKey; name: string; category: string; connected: boolean; toggle: () => void }) {
  const marks: Record<IntegrationKey, string> = { stripe: "S", quickbooks: "qb", calendar: "31" };
  return <article className={connected ? "integration-card connected" : "integration-card"}><div className={`integration-mark ${id}`}>{marks[id]}</div><div><b>{name}</b><small>{category}</small></div><span><i /> {connected ? "Connected" : "Not connected"}</span><button type="button" onClick={toggle}>{connected ? "View status" : id === "stripe" ? "Learn more" : "Connect"}</button></article>;
}

function BuiltInMapCard({ homeBase }: { homeBase: string }) {
  return <article className="integration-card connected built-in-map-card"><div className="integration-mark map">⌖</div><div><b>Naviwork Maps</b><small>{homeBase ? `Scoped to ${homeBase}` : "Set a home base to calibrate"}</small></div><span><i /> Always on</span><em>Built in</em></article>;
}

function PanelHeader({ label, detail }: { label: string; detail: string }) {
  return <header className="panel-header"><span>{label}</span><b>{detail}</b><i><em /><em /><em /></i></header>;
}

function SettingsHeading({ title, copy }: { title: string; copy: string }) {
  return <div className="settings-heading"><span>CONFIGURATION BANK</span><h2>{title}</h2><p>{copy}</p></div>;
}

function ToggleRow({ label, copy, value, toggle }: { label: string; copy: string; value: boolean; toggle: () => void }) {
  return <button type="button" className="toggle-row" onClick={toggle} aria-pressed={value}><span><b>{label}</b><small>{copy}</small></span><i className={value ? "on" : ""}><em /></i></button>;
}

function AlertsPanel({ close, goTo }: { close: () => void; goTo: (view: View) => void }) {
  return <aside className="floating-panel alerts-panel"><header><div><span>ACTIVITY CHANNEL</span><h2>What needs attention</h2></div><button type="button" onClick={close} aria-label="Close alerts">×</button></header>{alerts.map((alert) => <button type="button" key={alert.time} onClick={() => goTo(alert.title.includes("Invoice") ? "REVENUE" : alert.title.includes("Crew") ? "CREWS" : "GAPS")}><time>{alert.time}</time><span><b>{alert.title}</b><small>{alert.text}</small></span><i>›</i></button>)}<footer><button type="button" onClick={() => goTo("COMMAND")}>View activity tape</button></footer></aside>;
}

function Customizer({ settings, updateSettings, close }: { settings: AppSettings; updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void; close: () => void }) {
  return <div className="drawer-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close customizer" /><aside className="customizer"><header><div><span>VIEWFINDER SETUP</span><h2>Make it yours</h2></div><button type="button" onClick={close} aria-label="Close customizer">×</button></header><section><p className="section-label">COLOR MODE</p><div className="theme-options">{(["silver", "daylight", "night"] as Theme[]).map((theme) => <button type="button" className={settings.theme === theme ? "active" : ""} onClick={() => updateSettings("theme", theme)} key={theme}><i className={theme} /><span><b>{theme === "silver" ? "Silver tape" : theme === "daylight" ? "Daylight" : "Night shot"}</b><small>{theme === "silver" ? "Classic camcorder" : theme === "daylight" ? "Bright & airy" : "Low-light console"}</small></span></button>)}</div></section><section><p className="section-label">LAYOUT & FEEDBACK</p><ToggleRow label="Compact controls" copy="Fit more information on screen." value={settings.compact} toggle={() => updateSettings("compact", !settings.compact)} /><ToggleRow label="Interface motion" copy="Animate view changes and live signals." value={settings.motion} toggle={() => updateSettings("motion", !settings.motion)} /><ToggleRow label="Interface sounds" copy="Use subtle cues for dispatch, radio, alerts, and sync." value={settings.sound} toggle={() => updateSettings("sound", !settings.sound)} /></section><footer><button type="button" className="primary-button" onClick={close}>Done</button></footer></aside></div>;
}

function CommandPalette({ items, goTo, close, syncNow, openCustomizer }: { items: Array<{ id: View; label: string; icon: string; hint: string }>; goTo: (view: View) => void; close: () => void; syncNow: () => void; openCustomizer: () => void }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  return <div className="modal-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close command menu" /><section className="command-palette"><header><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search views and actions…" aria-label="Search views and actions" /><kbd>ESC</kbd></header><div>{options.map((item) => <button type="button" key={item.id} onClick={() => goTo(item.id)}><i>{item.icon}</i><span><b>{item.label}</b><small>{item.hint}</small></span><em>↵</em></button>)}{query.length === 0 && <><button type="button" onClick={() => { syncNow(); close(); }}><i>↻</i><span><b>Sync workspace</b><small>Refresh calendars, payments, and routes</small></span><em>↵</em></button><button type="button" onClick={openCustomizer}><i>◐</i><span><b>Customize appearance</b><small>Theme, density, and motion</small></span><em>↵</em></button></>}</div></section></div>;
}

function OutreachModal({ customer, message, setMessage, close, queue }: { customer: string; message: string; setMessage: (value: string) => void; close: () => void; queue: () => void }) {
  return <ModalShell eyebrow="CUSTOMER OUTREACH" title="Review message" close={close}><p>Review the recipient and message before it enters the approval queue.</p><label className="field"><span>Recipient</span><input value={customer} readOnly /></label><label className="field"><span>Message</span><textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={queue} disabled={!customer || !message.trim()}>Queue for approval</button></div></ModalShell>;
}

function InvoiceModal({ invoice, close, sendReminder, markPaid }: { invoice: Invoice; close: () => void; sendReminder: () => void; markPaid: () => void }) {
  return <ModalShell eyebrow={`INVOICE #${invoice.id}`} title={invoice.customer} close={close}><div className="invoice-detail"><div><span>Service</span><b>{invoice.job}</b></div><div><span>Balance</span><b>${invoice.amount.toLocaleString()}</b></div><div><span>Status</span><b>{invoice.state}</b></div></div><p>Payment reminders are sent through the active outreach channel.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={markPaid} disabled={invoice.state === "Paid"}>Mark paid</button><button type="button" className="primary-button" onClick={sendReminder} disabled={invoice.state === "Paid" || invoice.state === "Reminder sent"}>{invoice.state === "Reminder sent" ? "Reminder sent" : "Send reminder"}</button></div></ModalShell>;
}

function CrewModal({ crew, close, openMap, message }: { crew: Crew; close: () => void; openMap: () => void; message: () => void }) {
  return <ModalShell eyebrow={`${crew.vehicle.toUpperCase()} · ${crew.status.toUpperCase()}`} title={crew.name} close={close}><div className="crew-modal-head"><span>{crew.id}</span><div><b>{crew.neighborhood}</b><small>{crew.assignment}</small></div></div><div className="route-timeline"><div className="current"><time>Now</time><span><b>{crew.assignment}</b><small>{crew.status}</small></span></div><div><time>Next</time><span><b>Upcoming work</b><small>{crew.next}</small></span></div></div><div className="modal-actions"><button type="button" className="text-button" onClick={message}>Send message</button><button type="button" className="secondary-button" onClick={openMap}>Locate on map</button><button type="button" className="primary-button" onClick={close}>Done</button></div></ModalShell>;
}

function MessageModal({ crew, value, setValue, close, send }: { crew: Crew; value: string; setValue: (value: string) => void; close: () => void; send: () => void }) {
  return <ModalShell eyebrow="CREW CHANNEL" title={`Message ${crew.name}`} close={close}><label className="field"><span>Message</span><textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Share an update with the crew…" /></label><p>Messages are recorded in the dispatch activity feed for your workspace.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={send} disabled={!value.trim()}>Send message</button></div></ModalShell>;
}

function AccountModal({ user, settings, saveState, authState, workspaceName, configured, close, openSettings, signInWithGoogle, sendMagicLink }: { user: CurrentUser | null; settings: AppSettings; saveState: "saved" | "saving" | "local"; authState: string; workspaceName: string; configured: boolean; close: () => void; openSettings: () => void; signInWithGoogle: () => void; sendMagicLink: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const membershipIssue = authState === "membership_required";
  return <ModalShell eyebrow="NAVIWORK ACCESS" title={user ? "Account & workspace" : "Enter your command center"} close={close}>{user ? <><div className="account-identity"><span>{user.displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div><b>{user.displayName}</b><small>{user.email}</small></div><em><i /> Signed in</em></div><div className="account-details"><div><span>Workspace</span><b>{workspaceName}</b></div><div><span>Operations type</span><b>{accountProfiles[settings.accountType].label}</b></div><div><span>Cloud state</span><b>{saveState === "saved" ? "Synced" : saveState === "saving" ? "Syncing…" : "Waiting to sync"}</b></div></div><p>Your role controls the views, records, and outreach actions available to you.</p><div className="modal-actions"><button type="button" className="signout-button" onClick={() => { void getSupabaseBrowser()?.auth.signOut(); close(); }}>Sign out</button><button type="button" className="primary-button" onClick={openSettings}>Workspace settings</button></div></> : <div className="access-console"><div className="access-signal"><span>●</span><p>{membershipIssue ? "ACCESS NEEDS APPROVAL" : configured ? "SECURE WORKSPACE ACCESS" : "CONNECTION REQUIRED"}</p></div><div className="access-hero"><i>⌁</i><div><b>{membershipIssue ? "Your account needs workspace access" : "Sign in and pick up where the field left off."}</b><p>{membershipIssue ? "Google verified your identity, but it is not attached to an active Naviwork workspace yet." : configured ? "Use your company Google account. Your dispatch role and workspace load automatically." : "Naviwork cannot reach its authentication service yet."}</p></div></div>{configured && <button type="button" className="google-access-button" onClick={signInWithGoogle}><span>G</span><b>Continue with Google</b><em>→</em></button>}{membershipIssue && <div className="access-help"><b>Need access?</b><span>Ask a workspace owner to invite this email, then continue with Google again.</span></div>}{configured && <div className="access-divider"><span />or use a work email<span /></div>}{configured && !emailOpen && <button type="button" className="email-reveal" onClick={() => setEmailOpen(true)}>Send me a secure email link</button>}{configured && emailOpen && <div className="email-access"><label className="field"><span>WORK EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label><button type="button" className="secondary-button" onClick={() => sendMagicLink(email)} disabled={!email.includes("@")}>Send secure link</button></div>}<p className="access-footer">Protected by Supabase Auth · No passwords stored by Naviwork</p></div>}</ModalShell>;
}

function DispatchModal({ title, setTitle, neighborhood, setNeighborhood, close, create }: { title: string; setTitle: (value: string) => void; neighborhood: string; setNeighborhood: (value: string) => void; close: () => void; create: () => void }) {
  return <ModalShell eyebrow="NEW DISPATCH" title="Open an assignment" close={close}><p>Create an operational record before it enters the open queue. A signed-in workspace is required so the assignment is visible to the whole team.</p><label className="field"><span>Dispatch title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Priority service call" /></label><label className="field"><span>Area</span><input value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} placeholder="Enter service area" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={create} disabled={!title.trim() || !neighborhood.trim()}>Create dispatch</button></div></ModalShell>;
}

function ModalShell({ eyebrow, title, close, children }: { eyebrow: string; title: string; close: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
    const first = focusable()[0];
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable(); if (!elements.length) return;
      const firstElement = elements[0]; const lastElement = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) { event.preventDefault(); lastElement.focus(); }
      if (!event.shiftKey && document.activeElement === lastElement) { event.preventDefault(); firstElement.focus(); }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => { dialog?.removeEventListener("keydown", onKeyDown); returnFocus.current?.focus(); };
  }, []);
  return <div className="modal-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close dialog" /><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={close} aria-label="Close dialog">×</button></header>{children}</section></div>;
}
