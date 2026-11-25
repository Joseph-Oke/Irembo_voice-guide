import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN = process.env.ADMIN_PASSCODE || "irembo-admin";
const ENFORCE = process.env.ENFORCE_NATIVE_APPROVAL === "true";
const STUCK_LIMIT = 2, RESUME_DAYS = 7, MAX_AUDIO_KB = 200, DAY = 864e5;
const DB_FILE = path.join(here, "data", "db.json");
const UP_DIR = path.join(here, "public", "uploads");
const DISTRICTS = ["Gasabo","Kicukiro","Nyarugenge","Gisagara","Huye","Kamonyi","Muhanga","Nyamagabe","Nyanza","Nyaruguru","Ruhango","Karongi","Ngororero","Nyabihu","Nyamasheke","Rubavu","Rusizi","Rutsiro","Burera","Gakenke","Gicumbi","Musanze","Rulindo","Bugesera","Gatsibo","Kayonza","Kirehe","Ngoma","Nyagatare","Rwamagana"];

// SAMPLE steps based on Irembo's public help pages. Re-check against the live process
// and have a native Kinyarwanda speaker supply and approve the Kinyarwanda text (SRS 2.5).
const STEPS = [
  "Before you start, have your national ID number or citizen application number, and a phone number or email.",
  "Open www.irembo.gov.rw or the IremboGov app and log in. No account? Visit your nearest Irembo agent.",
  "Under Family, tap Birth Services.",
  "Choose Birth Certificate.",
  "Fill in the details on the form and choose the sector for your application.",
  "Pay the fee shown on screen (the Irembo help page lists RWF 500).",
  "Wait for processing, then download your e-certificate on IremboGov using your application number or billing number."
];
const seed = () => ({
  users: {}, sessions: [], escalations: [],
  agents: [
    { agentId: "a1", name: "Sample Agent One", phone: "+250 7XX 000 001", district: "Huye", verified: true },
    { agentId: "a2", name: "Sample Agent Two", phone: "+250 7XX 000 002", district: "Gasabo", verified: true }
  ],
  guide: { guideId: "birth-certificate", serviceName: "Birth certificate", version: "0.1-sample",
    steps: STEPS.map((t, i) => ({ stepNo: i + 1, textEn: t, textRw: "", audioUrl: "", audioSizeKB: 0, nativeApproved: false })) }
});
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : seed();
const save = () => { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); };
const id = () => crypto.randomBytes(4).toString("hex");

// ---------- BotController (FR 1 to 4) ----------
const normPhone = (p) => { const m = String(p || "").replace(/\D/g, "").match(/^(?:250|0)?(7\d{8})$/); return m ? "+250" + m[1] : null; };
const total = () => db.guide.steps.length;
const stepMsg = (s) => (ENFORCE && !s.nativeApproved)
  ? { kind: "info", text: "This step is not available yet. It is waiting for a native speaker to approve it." }
  : { kind: "step", stepNo: s.stepNo, total: total(), text: s.textRw || s.textEn, rw: !!s.textRw, audioUrl: s.audioUrl, approved: s.nativeApproved };
const B = { yes: { id: "yes", label: "Yes" }, done: { id: "done", label: "Done" }, repeat: { id: "repeat", label: "Repeat" },
  stuck: { id: "stuck", label: "I'm stuck" }, hi: { id: "hi", label: "Hi" }, again: { id: "hi", label: "Start again" }, back: { id: "hi", label: "Back to my step" } };
const STEP_BTNS = [B.done, B.repeat, B.stuck];

function nearestAgent(district) {
  const ok = db.agents.filter(a => a.verified);
  return ok.find(a => a.district === district) || ok[0] || null;
}
function handle({ phone: raw, role, input, district }) {
  const phone = normPhone(raw);
  if (!phone) return { error: "Enter a Rwandan mobile number, for example 0788 000 000." };
  const now = Date.now();
  // Only phone number, language and role are stored about a user (NFR 2, NFR 3)
  const user = db.users[phone] || (db.users[phone] = { phone, language: "rw", role: "primary" });
  user.role = role === "secondary" ? "secondary" : "primary";
  const cmd = String(input || "").trim().toLowerCase();
  const out = []; let buttons = [];
  let s = db.sessions.filter(x => x.phone === phone).sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
  const resumable = s && s.status !== "COMPLETED" && now - s.lastActiveAt <= RESUME_DAYS * DAY;
  const greet = ["", "hi", "hello", "start", "muraho"].includes(cmd);
  const send = (n) => { const st = db.guide.steps.find(x => x.stepNo === n); out.push(stepMsg(st)); buttons = STEP_BTNS; };

  if (greet || !s) {
    if (resumable) {                                             // FR 4.2 auto-resume within 7 days
      s.status = "ACTIVE"; s.stuckCount = 0;
      if (s.currentStepNo >= 1) { out.push({ kind: "info", text: `Welcome back. Continuing at step ${s.currentStepNo} of ${total()}.` }); send(s.currentStepNo); }
      else { out.push({ kind: "info", text: "Welcome back. Do you want to start the birth certificate guide?" }); buttons = [B.yes]; }
    } else {                                                     // FR 1.1 greet and confirm
      s = { sessionId: id(), phone, currentStepNo: 0, stuckCount: 0, status: "ACTIVE", startedAt: now, lastActiveAt: now };
      db.sessions.push(s);
      out.push({ kind: "info", text: "Hello. I am the Irembo Voice Guide. I will help you apply for a birth certificate on Irembo, one step at a time. I do not replace Irembo and I never ask for your ID number. Do you want to start?" });
      buttons = [B.yes];
    }
  } else if (s.status === "COMPLETED" || !resumable) {
    out.push({ kind: "info", text: "Send Hi to start again." }); buttons = [B.again];
  } else if (cmd === "yes" && s.currentStepNo === 0) {          // FR 1.2 first step
    s.currentStepNo = 1; send(1);
  } else if (s.currentStepNo === 0) {
    out.push({ kind: "info", text: "Please tap Yes to start." }); buttons = [B.yes];
  } else if (["done", "next", "next step", "1"].includes(cmd)) { // FR 2.1 advance, FR 4.1 save
    s.stuckCount = 0;
    if (s.currentStepNo >= total()) {
      s.status = "COMPLETED"; s.completedAt = now;
      out.push({ kind: "info", text: "That was the last step. Did your application go through? If not, send Hi to go through the steps again." }); buttons = [B.again];
    } else { s.currentStepNo += 1; s.status = "ACTIVE"; send(s.currentStepNo); }
  } else if (["repeat", "2"].includes(cmd)) {                    // FR 2.2 repeat (does not add to stuck count)
    send(s.currentStepNo);
  } else if (["stuck", "i'm stuck", "3"].includes(cmd)) {        // FR 3.1 detect two stuck taps
    s.stuckCount += 1;
    if (s.stuckCount >= STUCK_LIMIT) {                           // FR 3.2 hand off to a verified agent
      s.status = "ESCALATED";
      const a = nearestAgent(district);
      db.escalations.push({ escalationId: id(), sessionId: s.sessionId, triggeredAt: now, status: a ? "CONTACT_SENT" : "OPEN", agentId: a ? a.agentId : null });
      out.push(a ? { kind: "agent", text: `Please contact a verified Irembo agent: ${a.name}, ${a.phone}, ${a.district}.${a.district === district ? "" : " No agent is listed in your district, so this is the nearest available."}` }
                 : { kind: "info", text: "No verified agent is listed yet. Your request has been recorded." });
      buttons = [B.back];
    } else { out.push({ kind: "info", text: "No problem. Let me say that step again." }); send(s.currentStepNo); }
  } else { out.push({ kind: "info", text: "Please tap a button, or type 1 (Done), 2 (Repeat) or 3 (I'm stuck)." }); buttons = STEP_BTNS; }
  s.lastActiveAt = now; save();
  return { messages: out, buttons, session: { status: s.status, currentStepNo: s.currentStepNo, total: total(), stuckCount: s.stuckCount } };
}

// ---------- API ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "500kb" }));
const admin = (req, res, next) => req.get("x-admin-key") === ADMIN ? next() : res.status(401).json({ error: "Administrator passcode required." });
const ago = (t) => Math.round((Date.now() - t) / DAY * 10) / 10;

app.get("/api/config", (_q, r) => r.json({ districts: DISTRICTS, maxAudioKB: MAX_AUDIO_KB, resumeDays: RESUME_DAYS, stuckLimit: STUCK_LIMIT, enforceApproval: ENFORCE }));
app.post("/api/message", (q, r) => { const o = handle(q.body || {}); r.status(o.error ? 400 : 200).json(o); });

app.get("/api/admin/steps", admin, (_q, r) => r.json(db.guide.steps));
app.put("/api/admin/steps/:n", admin, (q, r) => {                // FR 5.1 edit step text and voice note
  const s = db.guide.steps.find(x => x.stepNo === Number(q.params.n));
  if (!s) return r.status(404).json({ error: "No such step." });
  const b = q.body || {};
  if (typeof b.textEn === "string") s.textEn = b.textEn.slice(0, 600);
  if (typeof b.textRw === "string") s.textRw = b.textRw.slice(0, 600);
  if (typeof b.nativeApproved === "boolean") s.nativeApproved = b.nativeApproved;
  if (b.audioBase64) {
    const ext = String(b.audioExt || "").toLowerCase();
    if (!["mp3", "ogg", "wav", "webm", "m4a"].includes(ext)) return r.status(400).json({ error: "Use mp3, ogg, wav, webm or m4a." });
    const buf = Buffer.from(b.audioBase64, "base64");
    if (buf.length > MAX_AUDIO_KB * 1024) return r.status(413).json({ error: `Voice notes must be ${MAX_AUDIO_KB} KB or smaller.` });
    fs.mkdirSync(UP_DIR, { recursive: true });
    const name = `step-${s.stepNo}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UP_DIR, name), buf);
    s.audioUrl = "/uploads/" + name; s.audioSizeKB = Math.ceil(buf.length / 1024);
  }
  save(); r.json(s);
});
app.get("/api/admin/stats", admin, (_q, r) => {                  // FR 5.2 usage stats
  const n = (st) => db.sessions.filter(s => s.status === st).length;
  r.json({ started: db.sessions.filter(s => s.currentStepNo >= 1).length, completed: n("COMPLETED"), escalated: db.escalations.length, active: n("ACTIVE"),
    sessions: db.sessions.length, users: Object.keys(db.users).length, openEscalations: db.escalations.filter(e => e.status !== "RESOLVED").length });
});
app.get("/api/admin/sessions", admin, (_q, r) => r.json(db.sessions.map(s => ({ ...s, phone: "+250 7** *** " + s.phone.slice(-3), idleDays: ago(s.lastActiveAt) })).reverse()));
app.post("/api/admin/sessions/:sid/age", admin, (q, r) => {      // demo tool: simulate days passing to test the 7-day rule
  const s = db.sessions.find(x => x.sessionId === q.params.sid);
  if (!s) return r.status(404).json({ error: "No such session." });
  s.lastActiveAt -= (Number(q.body?.days) || 8) * DAY; save(); r.json({ ok: true });
});
app.get("/api/admin/agents", admin, (_q, r) => r.json(db.agents));
app.post("/api/admin/agents", admin, (q, r) => {
  const { name, phone, district } = q.body || {};
  if (!name || !phone || !DISTRICTS.includes(district)) return r.status(400).json({ error: "Name, phone and a valid district are required." });
  const a = { agentId: id(), name: String(name).slice(0, 80), phone: String(phone).slice(0, 30), district, verified: !!q.body.verified };
  db.agents.push(a); save(); r.json(a);
});
app.put("/api/admin/agents/:aid", admin, (q, r) => {
  const a = db.agents.find(x => x.agentId === q.params.aid);
  if (!a) return r.status(404).json({ error: "No such agent." });
  const { name, phone, district, verified } = q.body || {};
  if (name) a.name = String(name).slice(0, 80); if (phone) a.phone = String(phone).slice(0, 30);
  if (DISTRICTS.includes(district)) a.district = district; if (typeof verified === "boolean") a.verified = verified;
  save(); r.json(a);
});
app.delete("/api/admin/agents/:aid", admin, (q, r) => { db.agents = db.agents.filter(x => x.agentId !== q.params.aid); save(); r.json({ ok: true }); });
app.get("/api/admin/escalations", admin, (_q, r) => r.json(db.escalations.map(e => ({ ...e, agent: db.agents.find(a => a.agentId === e.agentId)?.name || "None" })).reverse()));
app.post("/api/admin/escalations/:eid/resolve", admin, (q, r) => {
  const e = db.escalations.find(x => x.escalationId === q.params.eid);
  if (!e) return r.status(404).json({ error: "No such escalation." });
  e.status = "RESOLVED"; save(); r.json(e);
});
app.post("/api/admin/reset", admin, (_q, r) => { db = seed(); save(); r.json({ ok: true }); });

app.use(express.static(path.join(here, "public")));              // only public/ is served, never data/
app.listen(PORT, () => {
  console.log(`Irembo Voice Guide running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSCODE) console.warn("ADMIN_PASSCODE is not set. Using the default passcode for demo only.");
});
