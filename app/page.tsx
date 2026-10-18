"use client";

import { useEffect, useState } from "react";

type Tab = "Command" | "Schedule" | "Crews" | "Customers" | "Revenue";

const crewData = [
  { initials: "JM", name: "J. Martinez", vehicle: "Van 14", status: "On site", place: "Westlake · AC tune-up", color: "cyan", x: 42, y: 55 },
  { initials: "RS", name: "R. Singh", vehicle: "Truck 07", status: "Available 10:45", place: "Ridgeview · 12 min away", color: "lime", x: 68, y: 30 },
  { initials: "DK", name: "D. Kim", vehicle: "Van 09", status: "En route", place: "Downtown · Water heater", color: "orange", x: 25, y: 70 },
  { initials: "AB", name: "A. Brown", vehicle: "Truck 11", status: "Wraps at 11:20", place: "North Loop · Panel upgrade", color: "violet", x: 76, y: 74 },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Command");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date()));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => window.clearTimeout(timer); }, [toast]);
  const announce = (message: string) => setToast(message);

  return (
    <main className="navi-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("Command")} aria-label="Naviwork command center">
          <span className="brand-orb"><i /></span><span><b>NAVIWORK</b><small>FIELD OPERATIONS</small></span>
        </button>
        <div className="live-pill"><span className="pulse" /> LIVE OPERATIONS <b>·</b> {clock || "--:--"}</div>
        <div className="top-actions"><button className="help">?</button><button className="avatar" onClick={() => setSettingsOpen(true)}>MG</button></div>
      </header>

      <nav className="navrail" aria-label="Main navigation">
        <span className="rail-label">OPERATIONS</span>
        {(["Command", "Schedule", "Crews", "Customers", "Revenue"] as Tab[]).map((item, index) => <button key={item} onClick={() => setActiveTab(item)} className={activeTab === item ? "selected" : ""}><i>{["◉", "▦", "◌", "◎", "◇"][index]}</i>{item}</button>)}
        <span className="rail-label bottom">WORKSPACE</span>
        <button onClick={() => setSettingsOpen(true)}><i>⚙</i>Settings</button>
      </nav>

      <section className="workspace">
        <div className="page-heading">
          <div><p>GOOD MORNING, MORGAN</p><h1>{activeTab === "Command" ? "Dispatch command center" : activeTab}</h1><span>Thursday, October 17 · Austin service territory</span></div>
          <div className="heading-actions"><button className="subtle-button" onClick={() => announce("Today’s dispatch brief is ready.")}>⌁ DAILY BRIEF</button><button className="aero-button" onClick={() => setSettingsOpen(true)}>⌘ CONFIGURE WORKSPACE</button></div>
        </div>

        {activeTab !== "Command" ? <div className="coming-panel"><span>◈</span><h2>{activeTab} view</h2><p>This workspace module is ready for your live data connection. Return to Command for the operational overview.</p><button className="aero-button" onClick={() => setActiveTab("Command")}>OPEN COMMAND CENTER</button></div> : <>
          <section className="metrics-grid">
            <article><span className="metric-icon revenue">$</span><div><small>REVENUE ON DECK</small><strong>$12,840</strong><em>↑ 18% vs. last Thursday</em></div><button onClick={() => setActiveTab("Revenue")}>VIEW ›</button></article>
            <article><span className="metric-icon open">↗</span><div><small>OPEN CAPACITY</small><strong>3h 25m</strong><em>Across 4 field crews</em></div><button onClick={() => announce("Opening schedule gaps.")}>ROUTE ›</button></article>
            <article><span className="metric-icon invoice">▤</span><div><small>OUTSTANDING</small><strong>$4,260</strong><em>6 invoices need attention</em></div><button onClick={() => setActiveTab("Revenue")}>COLLECT ›</button></article>
            <article><span className="metric-icon jobs">✓</span><div><small>JOBS COMPLETE</small><strong>7 / 16</strong><em>On pace for today</em></div><button onClick={() => announce("7 completed jobs reconciled.")}>DETAILS ›</button></article>
          </section>

          <section className="dashboard-grid">
            <article className="map-card glass-card">
              <header><div><span className="eyebrow">LIVE FIELD MAP</span><h2>Crew coverage</h2></div><div className="map-tools"><button>−</button><button>+</button><button>⌖</button></div></header>
              <div className="map-stage" aria-label="Map of Austin service territory">
                <div className="map-water water-one" /><div className="map-water water-two" />
                <div className="road road-a" /><div className="road road-b" /><div className="road road-c" /><div className="road road-d" />
                <span className="map-name north">NORTH LOOP</span><span className="map-name downtown">DOWNTOWN</span><span className="map-name west">WESTLAKE</span><span className="map-name east">EAST AUSTIN</span>
                {crewData.map((crew) => <button className={`crew-pin ${crew.color}`} key={crew.name} style={{ left: `${crew.x}%`, top: `${crew.y}%` }} onClick={() => announce(`${crew.name} · ${crew.status} · ${crew.place}`)}><b>{crew.initials}</b><span className="ping" /></button>)}
                <div className="coverage-ring"><span>12 MIN</span></div><div className="map-legend"><i className="legend-dot cyan" /> Active crew <i className="legend-dot lime" /> Available soon</div>
              </div>
              <footer><span><i className="pulse" /> GPS UPDATING</span><small>Last sync: just now</small></footer>
            </article>

            <article className="opportunities glass-card">
              <header><div><span className="eyebrow">AI DISPATCH DESK</span><h2>Opportunity alerts</h2></div><span className="counter">02 READY</span></header>
              {alertOpen ? <div className="opportunity highlight"><div className="spark">✦</div><div className="opp-copy"><span>HIGH-CONFIDENCE ROUTE GAP</span><h3>Fill R. Singh’s 10:45 window</h3><p>Two eligible customers are within 8 minutes of Ridgeview. Estimated recovered revenue: <b>$320–$520</b>.</p><div className="customer-chips"><button onClick={() => announce("S. Patel’s contact card opened.")}>S. Patel · AC diagnostic</button><button onClick={() => announce("M. Lopez’s contact card opened.")}>M. Lopez · Maintenance</button></div></div><div className="opp-actions"><button className="aero-button" onClick={() => announce("Outreach draft queued for your approval.")}>REVIEW OUTREACH</button><button className="icon-button" onClick={() => setAlertOpen(false)}>×</button></div></div> : <div className="dismissed"><span>✓</span> Opportunity handled. Naviwork is watching the next route gap.</div>}
              <div className="opportunity"><div className="spark muted">◌</div><div className="opp-copy"><span>CREW FINISHING EARLY</span><h3>J. Martinez may free up 42 min</h3><p>Current tune-up is tracking ahead of plan. Watchlist has 3 consented customers nearby.</p></div><button className="outline-button" onClick={() => announce("This alert is now being monitored.")}>WATCH</button></div>
              <footer><button onClick={() => announce("AI recommendations use customer consent, call-hours, and your workspace rules.")}>How recommendations work →</button></footer>
            </article>

            <article className="schedule-card glass-card"><header><div><span className="eyebrow">TODAY’S FIELD BOARD</span><h2>Open windows & next jobs</h2></div><button className="calendar-btn" onClick={() => setActiveTab("Schedule")}>▦ OCT 17</button></header><div className="schedule-list"><div className="slot active"><time>10:45<small>OPEN</small></time><span className="timeline-dot" /><div><b>R. Singh · Truck 07</b><p>Ridgeview area · 1h 15m window</p></div><button onClick={() => announce("Route gap workflow opened.")}>FILL WINDOW</button></div><div className="slot"><time>11:20<small>NEXT</small></time><span className="timeline-dot" /><div><b>D. Kim · Water heater installation</b><p>224 South Congress · Paid deposit</p></div><span className="job-state">EN ROUTE</span></div><div className="slot"><time>12:15<small>OPEN</small></time><span className="timeline-dot" /><div><b>A. Brown · Truck 11</b><p>North Loop area · 45m window</p></div><button onClick={() => announce("Route gap workflow opened.")}>FILL WINDOW</button></div><div className="slot"><time>1:00<small>NEXT</small></time><span className="timeline-dot" /><div><b>J. Martinez · AC replacement consult</b><p>Westlake · Invoice due at completion</p></div><span className="job-state">CONFIRMED</span></div></div></article>

            <article className="crew-card glass-card"><header><div><span className="eyebrow">FLEET STATUS</span><h2>4 crews in the field</h2></div><button className="text-link" onClick={() => setActiveTab("Crews")}>VIEW CREWS →</button></header><div className="crew-list">{crewData.map(crew => <button className="crew-row" onClick={() => announce(`${crew.name}: ${crew.status}`)} key={crew.name}><span className={`avatar large ${crew.color}`}>{crew.initials}</span><span><b>{crew.name}</b><small>{crew.vehicle} · {crew.place}</small></span><em className={crew.color}>{crew.status}</em></button>)}</div></article>
          </section>
        </>}
      </section>

      {settingsOpen && <div className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title"><section className="setup-panel"><header><div><span className="eyebrow">NAVIWORK WORKSPACE SETUP</span><h2 id="setup-title">Configure your control room</h2><p>These settings stay available anytime from the command center.</p></div><button className="close" onClick={() => setSettingsOpen(false)}>×</button></header><div className="setup-progress"><b>1</b><span /><b>2</b><span /><b>3</b><span /><b>4</b><span /><b>5</b></div><div className="setup-grid"><button onClick={() => announce("Business profile settings ready to edit.")}><i>⌂</i><b>Business profile</b><small>Evergreen Mechanical · HVAC · 25 mi radius</small><em>EDIT →</em></button><button onClick={() => announce("Field operation rules ready to edit.")}><i>◉</i><b>Field operations</b><small>4 active crews · 7:00 AM–6:00 PM</small><em>EDIT →</em></button><button onClick={() => announce("Outreach controls ready to edit.")}><i>◌</i><b>Customer outreach</b><small>Approval-first · SMS enabled</small><em>EDIT →</em></button><button onClick={() => announce("Connections panel opened.")}><i>⌁</i><b>Connections</b><small>Maps connected · Add Stripe or Jobber</small><em>MANAGE →</em></button></div><footer><div><span className="ready-dot" /> 4 of 5 areas configured</div><button className="aero-button" onClick={() => { setSettingsOpen(false); announce("Workspace saved. Your command center is ready."); }}>SAVE & RETURN TO COMMAND</button></footer></section></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
