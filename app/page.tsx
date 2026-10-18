"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "COMMAND" | "MAP" | "GAPS" | "REVENUE" | "CREWS" | "SETTINGS";
type MapLayer = "CREWS" | "JOBS" | "GAPS";
type SettingsTab = "PROFILE" | "FIELD OPS" | "OUTREACH" | "CONNECTIONS";
type Theme = "silver" | "daylight" | "night";
type AccountType = "field_service" | "last_mile" | "freight" | "public_works";
type Modal = "outreach" | "invoice" | "crew" | "message" | null;

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

type IntegrationKey = "mapbox" | "stripe" | "quickbooks" | "calendar";

type AppSettings = {
  businessName: string;
  accountType: AccountType;
  serviceRadius: number;
  dispatchMode: "Approval first" | "Auto-dispatch";
  startHour: string;
  endHour: string;
  outreachEnabled: boolean;
  theme: Theme;
  compact: boolean;
  motion: boolean;
  integrations: Record<IntegrationKey, boolean>;
};

const defaultSettings: AppSettings = {
  businessName: "Bay Breeze Mechanical",
  accountType: "field_service",
  serviceRadius: 18,
  dispatchMode: "Approval first",
  startHour: "07:00",
  endHour: "18:00",
  outreachEnabled: true,
  theme: "silver",
  compact: false,
  motion: true,
  integrations: { mapbox: true, stripe: false, quickbooks: false, calendar: true },
};

const navItems: Array<{ id: View; label: string; icon: string; hint: string }> = [
  { id: "MAP", label: "Dispatch", icon: "⌖", hint: "Live operations board" },
  { id: "COMMAND", label: "Overview", icon: "◉", hint: "Performance & pulse" },
  { id: "GAPS", label: "Route gaps", icon: "✦", hint: "2 opportunities" },
  { id: "REVENUE", label: "Revenue", icon: "$", hint: "Invoices & payments" },
  { id: "CREWS", label: "Crews", icon: "◎", hint: "4 active teams" },
  { id: "SETTINGS", label: "Setup", icon: "⚙", hint: "Rules & connections" },
];

const accountProfiles: Record<AccountType, { label: string; people: string; work: string; exception: string }> = {
  field_service: { label: "Field service", people: "Crews", work: "Jobs", exception: "Route gaps" },
  last_mile: { label: "Last-mile delivery", people: "Drivers", work: "Stops", exception: "Exceptions" },
  freight: { label: "Freight & fleet", people: "Units", work: "Loads", exception: "Delays" },
  public_works: { label: "Public works", people: "Field units", work: "Work orders", exception: "Incidents" },
};

const dispatchFeeds: Record<AccountType, Array<{ id: string; priority: string; title: string; meta: string; crew: string }>> = {
  field_service: [
    { id: "D-2048", priority: "P1", title: "No-cool call · senior resident", meta: "Mission–Foothill · 9 min", crew: "RS" },
    { id: "D-2047", priority: "P2", title: "Commercial freezer alarm", meta: "Downtown · SLA 42 min", crew: "DK" },
    { id: "D-2046", priority: "P3", title: "Early finish capacity", meta: "Winton Grove · +$520", crew: "JM" },
  ],
  last_mile: [
    { id: "D-2048", priority: "P1", title: "Temperature-sensitive delivery", meta: "Mission–Foothill · due 10:55", crew: "RS" },
    { id: "D-2047", priority: "P2", title: "Access exception at stop 18", meta: "Downtown · customer waiting", crew: "DK" },
    { id: "D-2046", priority: "P3", title: "Driver capacity recovered", meta: "Winton Grove · 6 stops", crew: "JM" },
  ],
  freight: [
    { id: "D-2048", priority: "P1", title: "High-value load off route", meta: "I-880 corridor · 7 min", crew: "RS" },
    { id: "D-2047", priority: "P2", title: "Dock window at risk", meta: "Hayward terminal · 42 min", crew: "DK" },
    { id: "D-2046", priority: "P3", title: "Backhaul capacity open", meta: "Winton Grove · 3 pallets", crew: "JM" },
  ],
  public_works: [
    { id: "D-2048", priority: "P1", title: "Signal cabinet offline", meta: "Mission Blvd · 9 min", crew: "RS" },
    { id: "D-2047", priority: "P2", title: "Water leak inspection", meta: "Downtown · reported 10:14", crew: "DK" },
    { id: "D-2046", priority: "P3", title: "Unit available early", meta: "Winton Grove · 42 min", crew: "JM" },
  ],
};

const crews: Crew[] = [
  { id: "RS", name: "Rina Singh", vehicle: "Truck 07", neighborhood: "Downtown Hayward", assignment: "Open service window", status: "Available 10:45", next: "12 min · 3.1 mi", lngLat: [-122.0808, 37.6688], pin: { left: "48%", top: "39%" } },
  { id: "JM", name: "Jules Martinez", vehicle: "Van 14", neighborhood: "Mission–Foothill", assignment: "AC tune-up · Santos Residence", status: "On site", next: "38 min remaining", lngLat: [-122.0513, 37.6563], pin: { left: "67%", top: "55%" } },
  { id: "DK", name: "Dae Kim", vehicle: "Van 09", neighborhood: "Southgate", assignment: "Water heater install", status: "En route", next: "ETA 11:20", lngLat: [-122.097, 37.648], pin: { left: "39%", top: "68%" } },
  { id: "AB", name: "Alex Brown", vehicle: "Truck 11", neighborhood: "Winton Grove", assignment: "Panel upgrade", status: "Wraps 11:20", next: "23 min remaining", lngLat: [-122.113, 37.679], pin: { left: "29%", top: "29%" } },
];

const jobs = [
  { id: "AC", label: "AC diagnostic", lngLat: [-122.073, 37.662] as [number, number], pin: { left: "54%", top: "51%" } },
  { id: "WH", label: "Water heater", lngLat: [-122.103, 37.646] as [number, number], pin: { left: "34%", top: "72%" } },
  { id: "EL", label: "Electrical", lngLat: [-122.064, 37.6805] as [number, number], pin: { left: "59%", top: "28%" } },
];

const alerts = [
  { time: "10:28", title: "Route gap detected", text: "Rina has a 52-minute window near Downtown Hayward." },
  { time: "10:14", title: "Invoice viewed", text: "Acme Dental opened invoice #1048." },
  { time: "09:46", title: "Crew ahead of plan", text: "Jules is tracking 38 minutes early." },
];

const initialInvoices: Invoice[] = [
  { id: "1047", customer: "W. Chen", job: "Heat pump replacement", amount: 4880, state: "Paid" },
  { id: "1048", customer: "Acme Dental Hayward", job: "Electrical service", amount: 1460, state: "Due today" },
  { id: "1049", customer: "S. Patel", job: "AC diagnostic", amount: 320, state: "Draft" },
];

const viewTitles: Record<View, { eyebrow: string; title: string; copy: string }> = {
  COMMAND: { eyebrow: "TAPE 01 · SATURDAY OCT 17", title: "Good morning, Morgan.", copy: "Your Hayward field operation is on pace. Two openings can still become revenue." },
  MAP: { eyebrow: "DISPATCH CHANNEL 01 · HAYWARD CA", title: "Live dispatch control", copy: "See the field, triage new work, and move the right unit with confidence." },
  GAPS: { eyebrow: "OPPORTUNITY SCAN", title: "Route gaps", copy: "Review suggested work before anything reaches a customer." },
  REVENUE: { eyebrow: "MONEY FEED", title: "Revenue & collections", copy: "Track today’s value and turn outstanding work into collected revenue." },
  CREWS: { eyebrow: "FIELD CHANNEL", title: "Crews", copy: "See who is moving, who is free, and what each team needs next." },
  SETTINGS: { eyebrow: "CONTROL SETUP", title: "Workspace settings", copy: "Make Naviwork match the way your team runs the day." },
};

export default function Home() {
  const [active, setActive] = useState<View>("MAP");
  const [mapLayer, setMapLayer] = useState<MapLayer>("CREWS");
  const [selectedCrewId, setSelectedCrewId] = useState("RS");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("PROFILE");
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === "undefined") return defaultSettings;
    const stored = window.localStorage.getItem("naviwork-settings");
    if (!stored) return defaultSettings;
    try {
      return { ...defaultSettings, ...JSON.parse(stored) };
    } catch {
      window.localStorage.removeItem("naviwork-settings");
      return defaultSettings;
    }
  });
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("1048");
  const [selectedCustomer, setSelectedCustomer] = useState("S. Patel");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tracking, setTracking] = useState(true);
  const [gapWatched, setGapWatched] = useState(false);
  const [outreachQueued, setOutreachQueued] = useState(false);
  const [message, setMessage] = useState("Hi S. — we have an earlier opening today at 10:45 AM. Would you like us to move up your AC diagnostic? Reply YES to accept.");
  const [crewMessage, setCrewMessage] = useState("");
  const [mapZoom, setMapZoom] = useState(1);
  const [recenterKey, setRecenterKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "local">("local");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedDispatchId, setSelectedDispatchId] = useState("D-2048");
  const [assignedDispatches, setAssignedDispatches] = useState<string[]>([]);
  const [createdDispatch, setCreatedDispatch] = useState(false);

  const selectedCrew = crews.find((crew) => crew.id === selectedCrewId) ?? crews[0];
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0];

  const showNotice = useCallback((text: string) => {
    setNotice(text);
  }, []);

  const goTo = useCallback((view: View) => {
    setActive(view);
    setAlertsOpen(false);
    setCommandOpen(false);
  }, []);

  useEffect(() => {
    fetch("/api/state")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.state?.settings) {
          setSettings((current) => ({ ...current, ...data.state.settings }));
          setSaveState("saved");
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("naviwork-settings", JSON.stringify(settings));
  }, [settings]);

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

  const saveWorkspace = async () => {
    setSaveState("saving");
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) throw new Error("local preview");
      setSaveState("saved");
      showNotice("Workspace settings saved to your account.");
    } catch {
      setSaveState("local");
      showNotice("Saved on this device. Sign in on the published app to sync your workspace.");
    }
  };

  const toggleIntegration = (key: IntegrationKey) => {
    const next = !settings.integrations[key];
    setSaveState("local");
    setSettings((current) => ({
      ...current,
      integrations: { ...current.integrations, [key]: next },
    }));
    showNotice(`${integrationLabels[key]} ${next ? "connected for this demo" : "disconnected"}.`);
  };

  const syncNow = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      showNotice("Routes, invoices, and calendars are up to date.");
    }, 900);
  };

  const openCrew = (crewId: string) => {
    setSelectedCrewId(crewId);
    setModal("crew");
  };

  const openInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setModal("invoice");
  };

  const queueOutreach = () => {
    setOutreachQueued(true);
    setModal(null);
    showNotice(`Outreach to ${selectedCustomer} queued for dispatcher approval.`);
  };

  const sendReminder = () => {
    setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoice.id ? { ...invoice, state: "Reminder sent" } : invoice));
    setModal(null);
    showNotice(`Payment reminder sent to ${selectedInvoice.customer}.`);
  };

  const pageTitle = viewTitles[active];

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
          <em>HAYWARD, CA · 4 CREWS</em>
        </button>
        <div className="top-actions">
          <button type="button" className="search-button" onClick={() => setCommandOpen(true)}><span>Jump to…</span><kbd>⌘ K</kbd></button>
          <button type="button" className={alertsOpen ? "icon-button active" : "icon-button"} onClick={() => setAlertsOpen((open) => !open)} aria-label="Open activity alerts"><span>3</span>⌁</button>
          <button type="button" className="icon-button" onClick={() => setCustomizerOpen(true)} aria-label="Customize appearance">◐</button>
          <button type="button" className="profile-button" onClick={() => goTo("SETTINGS")} aria-label="Open settings">MG</button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button type="button" key={item.id} className={active === item.id ? "active" : ""} onClick={() => goTo(item.id)}>
              <i>{item.icon}</i><span><b>{item.label}</b><small>{item.hint}</small></span>{item.id === "GAPS" && <em>2</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="storage-bar"><span><i /> {saveState === "saved" ? "Workspace synced" : "Saved on device"}</span></div>
          <button type="button" onClick={syncNow} className={syncing ? "syncing" : ""}><i>↻</i><span><b>{syncing ? "Syncing…" : "Sync now"}</b><small>Last sync · just now</small></span></button>
        </div>
      </aside>

      <section className={`workspace ${active === "MAP" ? "dispatch-workspace" : ""}`}>
        <div className="page-heading">
          <div><span>{pageTitle.eyebrow}</span><h1>{pageTitle.title}</h1><p>{pageTitle.copy}</p></div>
          <div className="heading-actions">
            {active === "MAP" && <><button type="button" className="secondary-button" onClick={() => { setRecenterKey((key) => key + 1); showNotice("Map recentered on Hayward."); }}>⌖ Recenter</button><button type="button" className="primary-button" onClick={() => { setMapLayer("GAPS"); goTo("GAPS"); }}>Review openings</button></>}
            {active === "COMMAND" && <><button type="button" className="secondary-button" onClick={() => goTo("MAP")}>Open map</button><button type="button" className="primary-button" onClick={() => goTo("GAPS")}>Review 2 openings</button></>}
            {active === "REVENUE" && <button type="button" className="primary-button" onClick={() => { setSettingsTab("CONNECTIONS"); goTo("SETTINGS"); }}>Payment settings</button>}
            {active === "CREWS" && <button type="button" className="primary-button" onClick={() => { setSettingsTab("FIELD OPS"); goTo("SETTINGS"); }}>Edit crew rules</button>}
            {active === "SETTINGS" && <button type="button" className="primary-button" onClick={saveWorkspace}>{saveState === "saving" ? "Saving…" : "Save workspace"}</button>}
          </div>
        </div>

        <div className="view-stage" key={active}>
          {active === "COMMAND" && <CommandView goTo={goTo} openCrew={openCrew} openInvoice={openInvoice} />}
          {active === "MAP" && (
            <MapView
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
              assignDispatch={(id) => { setAssignedDispatches((current) => current.includes(id) ? current : [...current, id]); showNotice(`${id} assigned to ${selectedCrew.name}.`); }}
              createdDispatch={createdDispatch}
              createDispatch={() => { setCreatedDispatch(true); setSelectedDispatchId("D-2049"); setMapLayer("JOBS"); showNotice("New dispatch D-2049 added to the board."); }}
              openMessage={() => setModal("message")}
            />
          )}
          {active === "GAPS" && (
            <GapsView
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              watched={gapWatched}
              toggleWatch={() => setGapWatched((current) => !current)}
              queued={outreachQueued}
              openOutreach={() => setModal("outreach")}
              openMap={() => { setSelectedCrewId("RS"); goTo("MAP"); }}
            />
          )}
          {active === "REVENUE" && <RevenueView invoices={invoices} openInvoice={openInvoice} goTo={goTo} />}
          {active === "CREWS" && <CrewsView selectedCrewId={selectedCrewId} selectCrew={setSelectedCrewId} openCrew={openCrew} goTo={goTo} openMessage={() => setModal("message")} />}
          {active === "SETTINGS" && <SettingsView tab={settingsTab} setTab={setSettingsTab} settings={settings} updateSettings={updateSettings} toggleIntegration={toggleIntegration} openCustomizer={() => setCustomizerOpen(true)} />}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => <button type="button" key={item.id} className={active === item.id ? "active" : ""} onClick={() => goTo(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}
      </nav>

      {alertsOpen && <AlertsPanel close={() => setAlertsOpen(false)} goTo={goTo} />}
      {customizerOpen && <Customizer settings={settings} updateSettings={updateSettings} close={() => setCustomizerOpen(false)} />}
      {commandOpen && <CommandPalette goTo={goTo} close={() => setCommandOpen(false)} syncNow={syncNow} openCustomizer={() => { setCommandOpen(false); setCustomizerOpen(true); }} />}
      {modal === "outreach" && <OutreachModal customer={selectedCustomer} message={message} setMessage={setMessage} close={() => setModal(null)} queue={queueOutreach} />}
      {modal === "invoice" && <InvoiceModal invoice={selectedInvoice} close={() => setModal(null)} sendReminder={sendReminder} markPaid={() => { setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoice.id ? { ...invoice, state: "Paid" } : invoice)); setModal(null); showNotice(`Invoice #${selectedInvoice.id} marked paid.`); }} />}
      {modal === "crew" && <CrewModal crew={selectedCrew} close={() => setModal(null)} openMap={() => { setModal(null); goTo("MAP"); }} message={() => { setModal("message"); }} />}
      {modal === "message" && <MessageModal crew={selectedCrew} value={crewMessage} setValue={setCrewMessage} close={() => setModal(null)} send={() => { setCrewMessage(""); setModal(null); showNotice(`Message sent to ${selectedCrew.name}.`); }} />}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </main>
  );
}

function CommandView({ goTo, openCrew, openInvoice }: { goTo: (view: View) => void; openCrew: (id: string) => void; openInvoice: (id: string) => void }) {
  return (
    <div className="command-grid">
      <section className="camera-panel hero-panel">
        <PanelHeader label="FIELD PULSE" detail="CH 01 · LIVE" />
        <div className="hero-content">
          <div className="status-pill"><i /> ALL SYSTEMS NOMINAL</div>
          <h2>Every crew, route gap, and next move—<em>in sight.</em></h2>
          <p>Seven of sixteen jobs are complete. Your crews are currently tracking 24 minutes ahead of plan.</p>
          <div className="button-row"><button type="button" className="primary-button" onClick={() => goTo("GAPS")}>Fill today’s gaps</button><button type="button" className="secondary-button" onClick={() => goTo("MAP")}>See crews live</button></div>
        </div>
        <div className="tape-stamp">SP 10:32:18<br />OCT.17.2026</div>
      </section>
      <section className="metric-strip">
        <Metric label="Revenue on deck" value="$12,840" detail="↑ 18% vs last Saturday" action={() => goTo("REVENUE")} />
        <Metric label="Open capacity" value="3h 25m" detail="Across 4 field crews" action={() => goTo("GAPS")} />
        <Metric label="Outstanding" value="$4,260" detail="6 invoices need attention" action={() => openInvoice("1048")} />
      </section>
      <section className="camera-panel priority-panel">
        <PanelHeader label="NEXT BEST MOVES" detail="2 NEED REVIEW" />
        <button type="button" className="priority-card hot" onClick={() => goTo("GAPS")}><span>01</span><div><b>Fill Rina’s 10:45 window</b><small>2 eligible customers · $320–$520</small></div><i>›</i></button>
        <button type="button" className="priority-card" onClick={() => openInvoice("1048")}><span>02</span><div><b>Follow up with Acme Dental</b><small>$1,460 due today · viewed 18 min ago</small></div><i>›</i></button>
        <button type="button" className="priority-card" onClick={() => openCrew("JM")}><span>03</span><div><b>Use Jules’ early finish</b><small>38 minutes ahead in Mission–Foothill</small></div><i>›</i></button>
      </section>
      <section className="camera-panel activity-panel">
        <PanelHeader label="ACTIVITY TAPE" detail="AUTO-ROLL" />
        {alerts.map((alert) => <button type="button" key={alert.time} onClick={() => alert.title.includes("Invoice") ? openInvoice("1048") : alert.title.includes("Crew") ? openCrew("JM") : goTo("GAPS")}><time>{alert.time}</time><span><b>{alert.title}</b><small>{alert.text}</small></span><i>›</i></button>)}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, action }: { label: string; value: string; detail: string; action: () => void }) {
  return <button type="button" className="metric-card" onClick={action}><span>{label}</span><strong>{value}</strong><small>{detail}</small><i>↗</i></button>;
}

function MapView({ layer, setLayer, selectedCrew, selectCrew, openCrew, zoom, setZoom, recenterKey, showNotice, accountType, selectedDispatchId, selectDispatch, assignedDispatches, assignDispatch, createdDispatch, createDispatch, openMessage }: { layer: MapLayer; setLayer: (layer: MapLayer) => void; selectedCrew: Crew; selectCrew: (id: string) => void; openCrew: () => void; zoom: number; setZoom: (zoom: number) => void; recenterKey: number; showNotice: (text: string) => void; accountType: AccountType; selectedDispatchId: string; selectDispatch: (id: string, crewId: string) => void; assignedDispatches: string[]; assignDispatch: (id: string) => void; createdDispatch: boolean; createDispatch: () => void; openMessage: () => void }) {
  const [routeAssist, setRouteAssist] = useState(true);
  const profile = accountProfiles[accountType];
  const feed = createdDispatch ? [...dispatchFeeds[accountType], { id: "D-2049", priority: "NEW", title: "Unassigned dispatch draft", meta: "Hayward · awaiting details", crew: selectedCrew.id }] : dispatchFeeds[accountType];
  const activeDispatch = feed.find((item) => item.id === selectedDispatchId) ?? feed[0];
  const layerLabels: Record<MapLayer, string> = { CREWS: profile.people, JOBS: profile.work, GAPS: profile.exception };
  return (
    <div className="dispatch-board">
      <section className="instrument-rack" aria-label="Live operation status">
        <div><span>ACTIVE</span><b>04</b><small>{profile.people}</small></div><div><span>OPEN</span><b>09</b><small>{profile.work}</small></div><div className="warn"><span>PRIORITY</span><b>02</b><small>Need dispatch</small></div><div><span>ON TIME</span><b>92%</b><small>Network wide</small></div><div className="signal"><i /><span>RADIO + GPS</span><b>ONLINE</b></div>
      </section>

      <aside className="camera-panel dispatch-queue">
        <PanelHeader label="INCOMING DISPATCH" detail={`${feed.length} OPEN`} />
        <div className="queue-tabs"><button type="button" className="active" onClick={() => showNotice("Showing all open dispatches.")}>OPEN</button><button type="button" onClick={() => showNotice(`${assignedDispatches.length} dispatches are assigned.`)}>ASSIGNED</button></div>
        <div className="queue-list">
          {feed.map((item) => <button type="button" key={item.id} className={selectedDispatchId === item.id ? "active" : ""} onClick={() => selectDispatch(item.id, item.crew)}><em className={`priority-${item.priority.toLowerCase()}`}>{item.priority}</em><span><b>{item.title}</b><small>{item.id} · {item.meta}</small></span><i>{assignedDispatches.includes(item.id) ? "✓" : "›"}</i></button>)}
        </div>
        <button type="button" className="new-dispatch-button" onClick={createDispatch} disabled={createdDispatch}><span>＋</span>{createdDispatch ? "Draft added" : "Create dispatch"}</button>
      </aside>

      <section className="camera-panel map-panel pilot-map">
        <div className="map-toolbar">
          <div className="segmented">{(["CREWS", "JOBS", "GAPS"] as MapLayer[]).map((item) => <button type="button" key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>{layerLabels[item].toUpperCase()}</button>)}</div>
          <div className="map-readout-pilot"><span>LAT 37.6688</span><span>LON −122.0808</span><b>10:32:18</b></div>
          <div className="map-tools"><button type="button" onClick={() => setZoom(Math.min(1.35, zoom + 0.1))} aria-label="Zoom in">＋</button><button type="button" onClick={() => setZoom(Math.max(.8, zoom - 0.1))} aria-label="Zoom out">−</button><button type="button" onClick={() => { setZoom(1); showNotice("Map fit to the full Hayward operating area."); }} aria-label="Fit map">⌖</button></div>
        </div>
        <div className="map-frame"><MapViewport layer={layer} selectedCrewId={selectedCrew.id} onSelectCrew={selectCrew} zoom={zoom} recenterKey={recenterKey} /><div className="map-reticle" aria-hidden="true"><i /><i /></div><div className="north-indicator">N<br />↑</div><div className="dispatch-tag"><span>{activeDispatch.priority}</span><b>{activeDispatch.id}</b><small>{activeDispatch.title}</small></div></div>
        <div className="map-status"><span><i /> GPS SYNCED · 4/4 REPORTING</span><b>HAYWARD · SAN LEANDRO · UNION CITY</b></div>
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
        <button type="button" className="cockpit-button" onClick={() => { setZoom(1); showNotice("Tactical map recentered."); }}><i>⌖</i><span><b>RECENTER</b><small>Hayward base</small></span></button>
        <button type="button" className="launch-button" onClick={createDispatch} disabled={createdDispatch}><i>＋</i><span><b>NEW DISPATCH</b><small>{createdDispatch ? "Draft on board" : "Open assignment"}</small></span></button>
      </section>
    </div>
  );
}

function MapViewport({ layer, selectedCrewId, onSelectCrew, zoom, recenterKey }: { layer: MapLayer; selectedCrewId: string; onSelectCrew: (id: string) => void; zoom: number; recenterKey: number }) {
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
      center: [-122.0808, 37.6688],
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
    if (layer === "GAPS") [crews[0].lngLat, jobs[0].lngLat].forEach((point, index) => addMarker("map-gap-marker", index === 0 ? "$520" : "$320", point));
  }, [layer, selectedCrewId, onSelectCrew, token]);

  useEffect(() => {
    if (!map.current) return;
    const target = crews.find((crew) => crew.id === selectedCrewId) ?? crews[0];
    map.current.easeTo({ center: target.lngLat, zoom: 11.8 + zoom, duration: 650 });
  }, [selectedCrewId, zoom, recenterKey]);

  if (token) return <div className="live-map" ref={element} onPointerDown={(event) => event.stopPropagation()} />;

  return (
    <div className="fallback-map" style={{ "--map-zoom": zoom } as React.CSSProperties}>
      <div className="map-paper">
        <div className="water"><span>SAN FRANCISCO BAY</span></div>
        <i className="road r-a" /><i className="road r-b" /><i className="road r-c" /><i className="road r-d" />
        <span className="map-label l-downtown">DOWNTOWN<br />HAYWARD</span><span className="map-label l-foothill">MISSION–FOOTHILL</span><span className="map-label l-southgate">SOUTHGATE</span><span className="map-label l-winton">WINTON GROVE</span><span className="map-label l-sanlorenzo">SAN LORENZO</span>
        {layer === "CREWS" && crews.map((crew) => <button type="button" key={crew.id} className={`fallback-pin crew ${selectedCrewId === crew.id ? "selected" : ""}`} style={crew.pin} onClick={() => onSelectCrew(crew.id)} aria-label={`Select ${crew.name}`}><b>{crew.id}</b><small>{crew.status}</small></button>)}
        {layer === "JOBS" && jobs.map((job) => <div key={job.id} className="fallback-pin job" style={job.pin}><b>{job.id}</b><small>{job.label}</small></div>)}
        {layer === "GAPS" && <><div className="gap-bubble gap-one"><b>$520</b><small>10:45 opening</small></div><div className="gap-bubble gap-two"><b>$320</b><small>12:20 opening</small></div></>}
      </div>
      <div className="fallback-note">DEMO MAP · CONNECT MAPBOX IN SETTINGS FOR LIVE STREETS</div>
    </div>
  );
}

function GapsView({ selectedCustomer, setSelectedCustomer, watched, toggleWatch, queued, openOutreach, openMap }: { selectedCustomer: string; setSelectedCustomer: (name: string) => void; watched: boolean; toggleWatch: () => void; queued: boolean; openOutreach: () => void; openMap: () => void }) {
  return (
    <div className="gaps-layout">
      <section className="camera-panel opportunity-feature">
        <div className="opportunity-top"><span>HIGH CONFIDENCE</span><b>+$320–$520</b></div>
        <h2>Fill Rina’s 10:45 window</h2>
        <p>Two consented customers are within eight minutes of Downtown Hayward and match Rina’s certification.</p>
        <div className="customer-choice">
          {[{ name: "S. Patel", job: "AC diagnostic", distance: "6 min", value: "$320" }, { name: "M. Lopez", job: "Seasonal maintenance", distance: "8 min", value: "$520" }].map((customer) => <button type="button" key={customer.name} className={selectedCustomer === customer.name ? "active" : ""} onClick={() => setSelectedCustomer(customer.name)}><i>{selectedCustomer === customer.name ? "●" : "○"}</i><span><b>{customer.name}</b><small>{customer.job} · {customer.distance}</small></span><strong>{customer.value}</strong></button>)}
        </div>
        <div className="opportunity-actions"><button type="button" className="secondary-button" onClick={openMap}>See on map</button><button type="button" className="primary-button" onClick={openOutreach} disabled={queued}>{queued ? "Queued for approval" : `Review message to ${selectedCustomer}`}</button></div>
      </section>
      <aside className="gap-aside">
        <section className="camera-panel confidence-card"><PanelHeader label="WHY THIS MATCH" detail="AI ASSISTED" /><ul><li><i>✓</i><span><b>Skills match</b><small>Rina is certified for both jobs.</small></span></li><li><i>✓</i><span><b>Short detour</b><small>Under eight minutes from her route.</small></span></li><li><i>✓</i><span><b>Contact allowed</b><small>Both customers opted into updates.</small></span></li></ul></section>
        <section className="camera-panel watch-card"><PanelHeader label="EARLY FINISH WATCH" detail={watched ? "WATCHING" : "42 MIN"} /><h3>Jules may free up early</h3><p>Three eligible customers are nearby in Mission–Foothill.</p><button type="button" className={watched ? "secondary-button active" : "secondary-button"} onClick={toggleWatch}>{watched ? "✓ Watching this route" : "Watch this route"}</button></section>
      </aside>
    </div>
  );
}

function RevenueView({ invoices, openInvoice, goTo }: { invoices: Invoice[]; openInvoice: (id: string) => void; goTo: (view: View) => void }) {
  const collected = invoices.filter((invoice) => invoice.state === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0);
  return (
    <div className="revenue-layout">
      <section className="revenue-metrics"><article><span>Scheduled value</span><b>$12,840</b><small>16 jobs today</small></article><article><span>Collected</span><b>${collected.toLocaleString()}</b><small>74% of billed work</small></article><article><span>Needs attention</span><b>6</b><small>$4,260 outstanding</small></article></section>
      <section className="camera-panel invoice-panel"><PanelHeader label="INVOICE TAPE" detail="TODAY" /><div className="invoice-head"><span>Customer & job</span><span>Status</span><span>Amount</span><span /></div>{invoices.map((invoice) => <button type="button" className="invoice-row" key={invoice.id} onClick={() => openInvoice(invoice.id)}><span><b>{invoice.customer}</b><small>#{invoice.id} · {invoice.job}</small></span><em className={`state-${invoice.state.toLowerCase().replace(" ", "-")}`}>{invoice.state}</em><strong>${invoice.amount.toLocaleString()}</strong><i>›</i></button>)}</section>
      <section className="camera-panel collection-card"><PanelHeader label="COLLECTION HEALTH" detail="7 DAY VIEW" /><div className="collection-ring"><div><b>74%</b><span>paid</span></div></div><p>Payments are 6% ahead of last week. Connect Stripe or QuickBooks to reconcile automatically.</p><button type="button" className="secondary-button" onClick={() => goTo("SETTINGS")}>Manage connections</button></section>
    </div>
  );
}

function CrewsView({ selectedCrewId, selectCrew, openCrew, goTo, openMessage }: { selectedCrewId: string; selectCrew: (id: string) => void; openCrew: (id: string) => void; goTo: (view: View) => void; openMessage: () => void }) {
  const crew = crews.find((item) => item.id === selectedCrewId) ?? crews[0];
  return (
    <div className="crews-layout">
      <section className="camera-panel roster-panel"><PanelHeader label="ACTIVE ROSTER" detail="4/4 ONLINE" />{crews.map((item) => <button type="button" className={`roster-row ${crew.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectCrew(item.id)}><span>{item.id}</span><div><b>{item.name}<em>{item.vehicle}</em></b><small>{item.assignment}</small></div><strong>{item.status}</strong><i>›</i></button>)}</section>
      <aside className="camera-panel crew-detail"><PanelHeader label="CREW DETAIL" detail={crew.vehicle.toUpperCase()} /><div className="crew-portrait">{crew.id}</div><h2>{crew.name}</h2><p>{crew.neighborhood}</p><div className="schedule-list"><div><time>NOW</time><span><b>{crew.assignment}</b><small>{crew.status}</small></span></div><div><time>11:45</time><span><b>Buffer & travel</b><small>{crew.next}</small></span></div><div><time>12:20</time><span><b>Open capacity</b><small>Eligible for nearby work</small></span></div></div><div className="stacked-actions"><button type="button" className="primary-button" onClick={() => openCrew(crew.id)}>Open full schedule</button><button type="button" className="secondary-button" onClick={() => goTo("MAP")}>Locate on map</button><button type="button" className="text-button" onClick={openMessage}>Send crew message →</button></div></aside>
    </div>
  );
}

function SettingsView({ tab, setTab, settings, updateSettings, toggleIntegration, openCustomizer }: { tab: SettingsTab; setTab: (tab: SettingsTab) => void; settings: AppSettings; updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void; toggleIntegration: (key: IntegrationKey) => void; openCustomizer: () => void }) {
  return (
    <div className="settings-layout camera-panel">
      <nav className="settings-nav" aria-label="Settings sections">{(["PROFILE", "FIELD OPS", "OUTREACH", "CONNECTIONS"] as SettingsTab[]).map((item, index) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}><i>0{index + 1}</i><span>{item}</span><b>›</b></button>)}</nav>
      <section className="settings-content">
        {tab === "PROFILE" && <><SettingsHeading title="Business profile" copy="Choose your operation type to adapt dispatch language and workflows across the app." /><div className="field-pair"><label className="field"><span>Business name</span><input value={settings.businessName} onChange={(event) => updateSettings("businessName", event.target.value)} /></label><label className="field"><span>Account type</span><select value={settings.accountType} onChange={(event) => updateSettings("accountType", event.target.value as AccountType)}>{(Object.keys(accountProfiles) as AccountType[]).map((type) => <option key={type} value={type}>{accountProfiles[type].label}</option>)}</select></label></div><div className="account-preview"><span>ACTIVE OPERATIONS PROFILE</span><b>{accountProfiles[settings.accountType].label}</b><small>{accountProfiles[settings.accountType].people} · {accountProfiles[settings.accountType].work} · {accountProfiles[settings.accountType].exception}</small></div><div className="field-pair"><label className="field"><span>Home base</span><input value="Hayward, California" readOnly /></label><label className="field"><span>Operating radius</span><select value={settings.serviceRadius} onChange={(event) => updateSettings("serviceRadius", Number(event.target.value))}><option value={12}>12 miles</option><option value={18}>18 miles</option><option value={25}>25 miles</option></select></label></div><button type="button" className="customize-row" onClick={openCustomizer}><span><i>◐</i><b>Appearance</b><small>{settings.theme} theme · {settings.compact ? "compact" : "comfortable"}</small></span><em>Customize ›</em></button></>}
        {tab === "FIELD OPS" && <><SettingsHeading title="Field operations" copy="Control dispatch behavior and the workday guardrails." /><div className="choice-grid"><button type="button" className={settings.dispatchMode === "Approval first" ? "active" : ""} onClick={() => updateSettings("dispatchMode", "Approval first")}><i>✓</i><b>Approval first</b><small>A dispatcher approves route changes.</small></button><button type="button" className={settings.dispatchMode === "Auto-dispatch" ? "active" : ""} onClick={() => updateSettings("dispatchMode", "Auto-dispatch")}><i>⚡</i><b>Auto-dispatch</b><small>Qualified gaps can be filled automatically.</small></button></div><div className="field-pair"><label className="field"><span>Day starts</span><input type="time" value={settings.startHour} onChange={(event) => updateSettings("startHour", event.target.value)} /></label><label className="field"><span>Day ends</span><input type="time" value={settings.endHour} onChange={(event) => updateSettings("endHour", event.target.value)} /></label></div><div className="info-note"><i>i</i><span><b>Hayward operating area</b><small>{settings.serviceRadius}-mile service radius centered on Downtown Hayward.</small></span></div></>}
        {tab === "OUTREACH" && <><SettingsHeading title="Customer outreach" copy="Choose how suggested messages are handled." /><ToggleRow label="Enable gap-fill outreach" copy="Show eligible customers when a route opening appears." value={settings.outreachEnabled} toggle={() => updateSettings("outreachEnabled", !settings.outreachEnabled)} /><div className="message-template"><span>EARLIER APPOINTMENT TEMPLATE</span><p>Hi {'{first name}'} — we have an earlier opening today at {'{time}'}. Would you like us to move up your {'{service}'}? Reply YES to accept.</p><small>Variables are filled automatically. Every message remains editable before sending.</small></div></>}
        {tab === "CONNECTIONS" && <><SettingsHeading title="Connections" copy="Bring schedules, payments, and customer records into one view." /><div className="integration-grid"><IntegrationCard id="mapbox" name="Mapbox" category="Live maps & routing" connected={settings.integrations.mapbox} toggle={() => toggleIntegration("mapbox")} /><IntegrationCard id="calendar" name="Google Calendar" category="Jobs & availability" connected={settings.integrations.calendar} toggle={() => toggleIntegration("calendar")} /><IntegrationCard id="stripe" name="Stripe" category="Payments & deposits" connected={settings.integrations.stripe} toggle={() => toggleIntegration("stripe")} /><IntegrationCard id="quickbooks" name="QuickBooks" category="Invoices & accounting" connected={settings.integrations.quickbooks} toggle={() => toggleIntegration("quickbooks")} /></div><p className="integration-note">Demo connections save their state now. Production OAuth credentials can be added during deployment.</p></>}
      </section>
    </div>
  );
}

const integrationLabels: Record<IntegrationKey, string> = { mapbox: "Mapbox", stripe: "Stripe", quickbooks: "QuickBooks", calendar: "Google Calendar" };

function IntegrationCard({ id, name, category, connected, toggle }: { id: IntegrationKey; name: string; category: string; connected: boolean; toggle: () => void }) {
  const marks: Record<IntegrationKey, string> = { mapbox: "M", stripe: "S", quickbooks: "qb", calendar: "31" };
  return <article className={connected ? "integration-card connected" : "integration-card"}><div className={`integration-mark ${id}`}>{marks[id]}</div><div><b>{name}</b><small>{category}</small></div><span><i /> {connected ? "Connected" : "Not connected"}</span><button type="button" onClick={toggle}>{connected ? "Disconnect" : "Connect demo"}</button></article>;
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
  return <div className="drawer-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close customizer" /><aside className="customizer"><header><div><span>VIEWFINDER SETUP</span><h2>Make it yours</h2></div><button type="button" onClick={close} aria-label="Close customizer">×</button></header><section><p className="section-label">COLOR MODE</p><div className="theme-options">{(["silver", "daylight", "night"] as Theme[]).map((theme) => <button type="button" className={settings.theme === theme ? "active" : ""} onClick={() => updateSettings("theme", theme)} key={theme}><i className={theme} /><span><b>{theme === "silver" ? "Silver tape" : theme === "daylight" ? "Daylight" : "Night shot"}</b><small>{theme === "silver" ? "Classic camcorder" : theme === "daylight" ? "Bright & airy" : "Low-light console"}</small></span></button>)}</div></section><section><p className="section-label">LAYOUT</p><ToggleRow label="Compact controls" copy="Fit more information on screen." value={settings.compact} toggle={() => updateSettings("compact", !settings.compact)} /><ToggleRow label="Interface motion" copy="Animate view changes and live signals." value={settings.motion} toggle={() => updateSettings("motion", !settings.motion)} /></section><footer><button type="button" className="primary-button" onClick={close}>Done</button></footer></aside></div>;
}

function CommandPalette({ goTo, close, syncNow, openCustomizer }: { goTo: (view: View) => void; close: () => void; syncNow: () => void; openCustomizer: () => void }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => navItems.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div className="modal-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close command menu" /><section className="command-palette"><header><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search views and actions…" aria-label="Search views and actions" /><kbd>ESC</kbd></header><div>{options.map((item) => <button type="button" key={item.id} onClick={() => goTo(item.id)}><i>{item.icon}</i><span><b>{item.label}</b><small>{item.hint}</small></span><em>↵</em></button>)}{query.length === 0 && <><button type="button" onClick={() => { syncNow(); close(); }}><i>↻</i><span><b>Sync workspace</b><small>Refresh calendars, payments, and routes</small></span><em>↵</em></button><button type="button" onClick={openCustomizer}><i>◐</i><span><b>Customize appearance</b><small>Theme, density, and motion</small></span><em>↵</em></button></>}</div></section></div>;
}

function OutreachModal({ customer, message, setMessage, close, queue }: { customer: string; message: string; setMessage: (value: string) => void; close: () => void; queue: () => void }) {
  return <ModalShell eyebrow="AI-ASSISTED OUTREACH" title="Offer an earlier appointment?" close={close}><p>Rina is available at 10:45 near Downtown Hayward. Review the message before it enters the approval queue.</p><label className="field"><span>Recipient</span><input value={`${customer} · SMS consent on file`} readOnly /></label><label className="field"><span>Message</span><textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={queue} disabled={!message.trim()}>Queue for approval</button></div></ModalShell>;
}

function InvoiceModal({ invoice, close, sendReminder, markPaid }: { invoice: Invoice; close: () => void; sendReminder: () => void; markPaid: () => void }) {
  return <ModalShell eyebrow={`INVOICE #${invoice.id}`} title={invoice.customer} close={close}><div className="invoice-detail"><div><span>Service</span><b>{invoice.job}</b></div><div><span>Balance</span><b>${invoice.amount.toLocaleString()}</b></div><div><span>Status</span><b>{invoice.state}</b></div><div><span>Due</span><b>Today · 5:00 PM</b></div></div><p>Customer viewed this invoice 18 minutes ago. Payment reminders are sent through the active outreach channel.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={markPaid} disabled={invoice.state === "Paid"}>Mark paid</button><button type="button" className="primary-button" onClick={sendReminder} disabled={invoice.state === "Paid" || invoice.state === "Reminder sent"}>{invoice.state === "Reminder sent" ? "Reminder sent" : "Send reminder"}</button></div></ModalShell>;
}

function CrewModal({ crew, close, openMap, message }: { crew: Crew; close: () => void; openMap: () => void; message: () => void }) {
  return <ModalShell eyebrow={`${crew.vehicle.toUpperCase()} · ${crew.status.toUpperCase()}`} title={crew.name} close={close}><div className="crew-modal-head"><span>{crew.id}</span><div><b>{crew.neighborhood}</b><small>{crew.assignment}</small></div></div><div className="route-timeline"><div><time>9:00</time><span><b>First call complete</b><small>Furnace safety inspection</small></span></div><div className="current"><time>Now</time><span><b>{crew.assignment}</b><small>{crew.status}</small></span></div><div><time>12:20</time><span><b>Open capacity</b><small>Eligible for nearby work</small></span></div></div><div className="modal-actions"><button type="button" className="text-button" onClick={message}>Send message</button><button type="button" className="secondary-button" onClick={openMap}>Locate on map</button><button type="button" className="primary-button" onClick={close}>Done</button></div></ModalShell>;
}

function MessageModal({ crew, value, setValue, close, send }: { crew: Crew; value: string; setValue: (value: string) => void; close: () => void; send: () => void }) {
  return <ModalShell eyebrow="CREW CHANNEL" title={`Message ${crew.name}`} close={close}><label className="field"><span>Message</span><textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Share an update with the crew…" /></label><p>This demo keeps messages inside the dispatch activity feed.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={send} disabled={!value.trim()}>Send message</button></div></ModalShell>;
}

function ModalShell({ eyebrow, title, close, children }: { eyebrow: string; title: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-scrim"><button type="button" className="scrim-close" onClick={close} aria-label="Close dialog" /><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={close} aria-label="Close dialog">×</button></header>{children}</section></div>;
}
