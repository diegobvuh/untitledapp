"use client";

import { useRef, useState } from "react";

const assignments = [
  { course: "AP Biology", title: "Cell respiration lab report", due: "Tonight · 11:59 PM", time: "80 min", color: "mint", progress: 72 },
  { course: "Precalculus", title: "Section 3.4 problem set", due: "Tomorrow · 8:00 AM", time: "45 min", color: "lilac", progress: 35 },
  { course: "World History", title: "Industrial Revolution notes", due: "Friday · 1:30 PM", time: "35 min", color: "peach", progress: 0 },
];

const week = [
  ["MON", "12", ""], ["TUE", "13", "Math · 4:00"], ["WED", "14", "Bio · 3:30"],
  ["THU", "15", "History · 5:00"], ["FRI", "16", "Read · 4:30"], ["SAT", "17", ""], ["SUN", "18", "Reset · 11:00"],
];

function downloadCalendar() {
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//untitled//School Planner//EN", "BEGIN:VEVENT", "UID:untitled-study@example.com", "DTSTAMP:20261015T150000Z", "DTSTART:20261015T233000Z", "DTEND:20261016T005000Z", "SUMMARY:AP Biology focus block", "DESCRIPTION:Finish analysis and conclusion.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = "untitled-study-session.ics"; a.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [position, setPosition] = useState({ x: -250, y: -160 });
  const [dragging, setDragging] = useState(false);
  const [complete, setComplete] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("I’m here when you’re ready. We can plan, explain, or practice together.");
  const drag = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const jump = (x: number, y: number) => setPosition({ x, y });
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input,.interactive")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };
    setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
  };
  const ask = (text = message) => {
    if (!text.trim()) return;
    setMessage(text);
    setReply("Let’s make this smaller. First, open the assignment and write the exact question at the top. Then spend 10 minutes on only the evidence. I can check your reasoning after that.");
  };

  return (
    <main className="viewport">
      <header className="ipad-bar">
        <div className="app-name"><i>u</i><span>untitled</span><small>STUDY CAM · 01</small></div>
        <div className="drag-hint"><span>● REC</span> DRAG TO NAVIGATE <b>SP</b><em>00:42:18</em></div>
        <div className="header-actions"><button aria-label="Notifications">♢<b /></button><div className="user-dot">DB</div></div>
      </header>

      <nav className="dock" aria-label="Workspace areas">
        <button onClick={() => jump(-250, -160)}><span>⌂</span><b>Home</b></button>
        <button onClick={() => jump(-960, -160)}><span>✓</span><b>Tasks</b></button>
        <button className="dock-main" onClick={() => ask("Build my best plan for today")}><span>✦</span></button>
        <button onClick={() => jump(-250, -720)}><span>▦</span><b>Plan</b></button>
        <button onClick={() => jump(-960, -720)}><span>◎</span><b>Focus</b></button>
      </nav>

      <div className="mini-map">
        <button className="map-home" onClick={() => jump(-250, -160)} aria-label="Go to home" />
        <button className="map-tasks" onClick={() => jump(-960, -160)} aria-label="Go to tasks" />
        <button className="map-plan" onClick={() => jump(-250, -720)} aria-label="Go to plan" />
        <button className="map-focus" onClick={() => jump(-960, -720)} aria-label="Go to focus" />
        <i style={{ transform: `translate(${Math.min(45, Math.max(0, -position.x / 24))}px, ${Math.min(29, Math.max(0, -position.y / 29))}px)` }} />
      </div>

      <section className={`canvas ${dragging ? "dragging" : ""}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
        <div className="zone home-zone">
          <div className="zone-kicker"><span /> STANDBY · OCT 15 2026</div>
          <h1>Everything you need,<br/><em>in one frame.</em></h1>
          <p className="intro">You have one important deadline tonight. We already made room for it.</p>
          <article className="now-card mint-card">
            <div className="live-pill"><i /> REC · NOW</div>
            <div className="now-copy"><span>YOUR NEXT STEP</span><h2>Finish your Bio lab report</h2><p>Analysis + conclusion · about 80 minutes</p><div className="now-buttons"><button onClick={() => setReply("Focus mode is ready: 25 minutes of writing, a 5-minute reset, then one final 25-minute block.")}>Start focus</button><button onClick={() => ask("Help me plan my biology lab report")}>Plan with AI</button></div></div>
            <div className="progress-orb"><div><strong>72%</strong><span>ready</span></div></div>
          </article>
          <div className="small-stats">
            <div><span>Today</span><strong>3</strong><p>things to finish</p></div>
            <div><span>Focus</span><strong>4h 20m</strong><p>this week · nice work</p></div>
            <div><span>Streak</span><strong>6 days</strong><p>showing up matters</p></div>
          </div>
        </div>

        <div className="zone tasks-zone">
          <div className="zone-title"><div><span>MEMORY · ASSIGNMENT LOG</span><h2>Assignment index</h2><p>Tap a circle when something is finished.</p></div><button className="round-add">＋</button></div>
          <div className="task-stack">
            {assignments.map((item, index) => <article className={`task-card ${item.color} ${complete.includes(index) ? "finished" : ""}`} key={item.title}>
              <button className="task-check" onClick={() => setComplete((v) => v.includes(index) ? v.filter((n) => n !== index) : [...v,index])}>{complete.includes(index) ? "✓" : ""}</button>
              <div><span>{item.course}</span><h3>{item.title}</h3><p>{item.due} <i /> {item.time}</p><div className="task-progress"><b style={{ width: `${complete.includes(index) ? 100 : item.progress}%` }} /></div></div>
              <strong>{complete.includes(index) ? "done" : `${item.progress}%`}</strong>
            </article>)}
          </div>
          <div className="soft-note"><span>☁</span><div><strong>Nothing is overdue.</strong><p>You are catching things before they become stressful.</p></div></div>
        </div>

        <div className="zone plan-zone">
          <div className="zone-title"><div><span>PROGRAM AE · SCHEDULE</span><h2>Your week</h2><p>A realistic plan with breathing room.</p></div><button onClick={downloadCalendar} className="calendar-connect">⌁ Apple Calendar</button></div>
          <div className="week-row">
            {week.map(([day,date,event]) => <div className={day === "THU" ? "week-day today" : "week-day"} key={day}><span>{day}</span><b>{date}</b>{event && <div><i />{event}</div>}</div>)}
          </div>
          <div className="plan-bottom">
            <article><span>AFTER SCHOOL</span><h3>One protected focus block</h3><p>3:30–4:50 PM · AP Biology</p><button onClick={downloadCalendar}>Add to my calendar →</button></article>
            <article><span>TONIGHT</span><h3>A soft landing</h3><p>Pack your bag, check tomorrow, then stop.</p><button onClick={() => setReply("Tonight’s reset: pack your bag, charge your iPad, check tomorrow’s first class, then you’re done.")}>Make a 10-min reset →</button></article>
          </div>
        </div>

        <div className="zone focus-zone">
          <div className="focus-room">
            <span className="zone-kicker"><i /> FOCUS MODE · MANUAL</span>
            <div className="timer-ring"><div><strong>25:00</strong><span>focus</span></div></div>
            <h2>One thing at a time.</h2><p>Your notifications are tucked away. Stay with the next paragraph.</p>
            <div className="focus-controls"><button>Ⅱ</button><button>＋ 5 min</button><button>End</button></div>
          </div>
          <div className="ai-bubble interactive">
            <div className="ai-top"><div>✦</div><p><span>UNTITLED AI</span><strong>Your study helper</strong></p><i /></div>
            <div className="ai-reply">{reply}</div>
            <div className="chips"><button onClick={() => ask("Quiz me")}>Quiz me</button><button onClick={() => ask("Explain this")}>Explain this</button><button onClick={() => ask("What next?")}>What next?</button></div>
            <div className="ask-row"><input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask anything about school…"/><button onClick={() => ask()}>↑</button></div>
            <small>Use AI to learn and plan. Double-check facts and submit your own work.</small>
          </div>
        </div>
      </section>
    </main>
  );
}
