/* Irembo Voice Guide front end. One script, page logic chosen by <body data-page>. */
const $ = (id) => document.getElementById(id);

//GLOBAL MESSAGE
function showMessage(msg) {
  let box = $("message-box");
  if (!box) { box = document.createElement("div"); box.id = "message-box"; document.body.appendChild(box); }
  box.innerText = msg; box.style.display = "block";
  clearTimeout(box._t); box._t = setTimeout(() => (box.style.display = "none"), 3000);
}

//API HELPER (administrator calls send the passcode)
async function api(path, opts = {}, isAdmin = false, retry = true) {
  const headers = { "Content-Type": "application/json" };
  if (isAdmin) {
    let key = sessionStorage.getItem("adminKey");
    if (!key) { key = prompt("Administrator passcode"); if (!key) throw new Error("Passcode needed."); sessionStorage.setItem("adminKey", key); }
    headers["x-admin-key"] = key;
  }
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && isAdmin && retry) { sessionStorage.removeItem("adminKey"); showMessage("Wrong passcode."); return api(path, opts, true, false); }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fill = (select, items) => items.forEach((d) => select.appendChild(new Option(d, d)));
const fail = (e) => showMessage(e.message);

//GUIDE (primary and secondary users)
async function initGuide() {
  const chat = $("chat"), quick = $("quick");
  const cfg = await api("/api/config");
  fill($("district"), cfg.districts); $("district").value = "Huye";

  const bubble = (cls, node) => { const b = el("div", "bubble " + cls); b.appendChild(node); chat.appendChild(b); chat.scrollTop = chat.scrollHeight; };
  function playVoice(m, btn) {
    if (m.audioUrl) { new Audio(m.audioUrl).play().catch(() => showMessage("Could not play audio.")); return; }
    if (!("speechSynthesis" in window)) { showMessage("No voice available in this browser."); return; }
    speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(m.text));
  }
  function showBot(m) {
    const wrap = el("div");
    if (m.kind === "step") {
      wrap.appendChild(el("div", "tag", `Step ${m.stepNo} of ${m.total}`));
      wrap.appendChild(el("div", "", m.text));
      const b = el("button", "small-btn", m.audioUrl ? "Play voice note" : "Play voice note (placeholder voice)");
      b.onclick = () => playVoice(m, b); wrap.appendChild(b);
      wrap.appendChild(el("div", "note", (m.rw ? "Kinyarwanda text. " : "Sample English text, Kinyarwanda pending. ") + (m.approved ? "Approved by a native speaker." : "Not yet approved by a native speaker.")));
      bubble("bot", wrap);
    } else { wrap.appendChild(el("div", m.kind === "agent" ? "tag" : "", m.kind === "agent" ? "Ask a human" : "")); wrap.appendChild(el("div", "", m.text)); bubble(m.kind === "agent" ? "agent" : "bot", wrap); }
  }
  function setButtons(list) {
    quick.innerHTML = "";
    list.forEach((b) => { const x = el("button", "", b.label); x.onclick = () => send(b.id, b.label); quick.appendChild(x); });
  }
  async function send(input, shown) {
    if (shown !== null) bubble("me", el("div", "", shown || input || "Hi"));
    try {
      const r = await api("/api/message", { method: "POST", body: JSON.stringify({ phone: $("phone").value, role: $("role").value, district: $("district").value, input }) });
      r.messages.forEach(showBot); setButtons(r.buttons);
    } catch (e) { fail(e); }
  }
  $("send").onclick = () => { const v = $("chat-input").value.trim(); if (!v) return; $("chat-input").value = ""; send(v); };
  $("chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
  $("leave").onclick = () => { chat.innerHTML = ""; setButtons([{ id: "hi", label: "Hi" }]); showMessage("Chat closed. Your place is saved. Send Hi to continue."); };
  setButtons([{ id: "hi", label: "Hi" }]);
}

//STEPS (administrator, FR 5.1)
async function initSteps() {
  const cfg = await api("/api/config"); $("max-kb").textContent = cfg.maxAudioKB;
  const list = $("steps-list");
  async function load() {
    const steps = await api("/api/admin/steps", {}, true); list.innerHTML = "";
    steps.forEach((s) => {
      const c = el("div", "step-card");
      c.appendChild(el("h3", "", "Step " + s.stepNo));
      const en = el("textarea"); en.value = s.textEn; en.placeholder = "English sample text";
      const rw = el("textarea"); rw.value = s.textRw; rw.placeholder = "Kinyarwanda text (from a native speaker)";
      const file = el("input"); file.type = "file"; file.accept = "audio/*";
      const ok = el("input"); ok.type = "checkbox"; ok.checked = s.nativeApproved;
      const approve = el("label", "check"); approve.append(ok, "Approved by a native speaker");
      const info = el("span", "badge" + (s.audioUrl ? " ok" : ""), s.audioUrl ? `Voice note ${s.audioSizeKB} KB` : "No voice note");
      const save = el("button", "", "Save step");
      save.onclick = async () => {
        const body = { textEn: en.value, textRw: rw.value, nativeApproved: ok.checked };
        try {
          if (file.files[0]) {
            const f = file.files[0];
            if (f.size > cfg.maxAudioKB * 1024) return showMessage(`Voice notes must be ${cfg.maxAudioKB} KB or smaller.`);
            const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; buf.forEach((b) => (bin += String.fromCharCode(b)));
            body.audioBase64 = btoa(bin); body.audioExt = f.name.split(".").pop();
          }
          await api("/api/admin/steps/" + s.stepNo, { method: "PUT", body: JSON.stringify(body) }, true);
          showMessage("Step saved."); load();
        } catch (e) { fail(e); }
      };
      const row = el("div", "form-row"); row.append(file, info, approve, save);
      c.append(el("label", "", "English"), en, el("label", "", "Kinyarwanda"), rw, row); list.appendChild(c);
    });
  }
  load().catch(fail);
}

//AGENTS (administrator, FR 3.2 list and escalations)
async function initAgents() {
  const cfg = await api("/api/config"); fill($("a-district"), cfg.districts);
  async function load() {
    const [agents, esc] = await Promise.all([api("/api/admin/agents", {}, true), api("/api/admin/escalations", {}, true)]);
    const tb = document.querySelector("#agents-table tbody"); tb.innerHTML = "";
    agents.forEach((a) => {
      const tr = el("tr"); const name = el("input"); name.value = a.name; const phone = el("input"); phone.value = a.phone;
      const d = el("select"); fill(d, cfg.districts); d.value = a.district; const v = el("input"); v.type = "checkbox"; v.checked = a.verified;
      const save = el("button", "small-btn", "Save"), del = el("button", "small-btn ghost", "Delete");
      save.onclick = () => api("/api/admin/agents/" + a.agentId, { method: "PUT", body: JSON.stringify({ name: name.value, phone: phone.value, district: d.value, verified: v.checked }) }, true).then(() => showMessage("Saved.")).catch(fail);
      del.onclick = () => api("/api/admin/agents/" + a.agentId, { method: "DELETE" }, true).then(load).catch(fail);
      [name, phone, d, v].forEach((x) => { const td = el("td"); td.appendChild(x); tr.appendChild(td); });
      const td = el("td"); td.append(save, " ", del); tr.appendChild(td); tb.appendChild(tr);
    });
    const eb = document.querySelector("#esc-table tbody"); eb.innerHTML = "";
    if (!esc.length) { const tr = el("tr"); const td = el("td", "muted", "No escalations yet."); td.colSpan = 4; tr.appendChild(td); eb.appendChild(tr); }
    esc.forEach((e) => {
      const tr = el("tr"); [new Date(e.triggeredAt).toLocaleString(), e.agent, e.status].forEach((t) => tr.appendChild(el("td", "", t)));
      const td = el("td"); if (e.status !== "RESOLVED") { const b = el("button", "small-btn", "Mark resolved"); b.onclick = () => api(`/api/admin/escalations/${e.escalationId}/resolve`, { method: "POST" }, true).then(load).catch(fail); td.appendChild(b); }
      tr.appendChild(td); eb.appendChild(tr);
    });
  }
  $("a-add").onclick = () => api("/api/admin/agents", { method: "POST", body: JSON.stringify({ name: $("a-name").value, phone: $("a-phone").value, district: $("a-district").value, verified: $("a-verified").checked }) }, true)
    .then(() => { $("a-name").value = ""; $("a-phone").value = ""; load(); }).catch(fail);
  load().catch(fail);
}

//ACTIVITY (administrator, FR 5.2)
async function initActivity() {
  const cfg = await api("/api/config");
  async function load() {
    const [s, sess] = await Promise.all([api("/api/admin/stats", {}, true), api("/api/admin/sessions", {}, true)]);
    const rate = s.started ? Math.round((s.completed / s.started) * 100) + "%" : "n/a";
    $("stats").innerHTML = "";
    [["Started", s.started], ["Completed", s.completed], ["Completion rate", rate], ["Active", s.active], ["Escalated", s.escalated], ["Open escalations", s.openEscalations]]
      .forEach(([k, v]) => { const c = el("div", "stat-card"); c.append(el("b", "", v), el("span", "", k)); $("stats").appendChild(c); });
    const tb = document.querySelector("#sess-table tbody"); tb.innerHTML = "";
    sess.forEach((x) => {
      const resumable = x.status !== "COMPLETED" && x.idleDays <= cfg.resumeDays;
      const tr = el("tr"); [x.phone, x.status, `${x.currentStepNo}`, x.stuckCount, x.idleDays, resumable ? "Yes" : "No"].forEach((t) => tr.appendChild(el("td", "", t)));
      const td = el("td"); const b = el("button", "small-btn ghost", "Simulate 8 days idle");
      b.onclick = () => api(`/api/admin/sessions/${x.sessionId}/age`, { method: "POST", body: JSON.stringify({ days: 8 }) }, true).then(load).catch(fail);
      td.appendChild(b); tr.appendChild(td); tb.appendChild(tr);
    });
  }
  $("search").addEventListener("input", function () {
    const q = this.value.toLowerCase();
    document.querySelectorAll("#sess-table tbody tr").forEach((r) => (r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"));
  });
  $("reset").onclick = () => { if (confirm("Delete all sessions and restore the sample steps and agents?")) api("/api/admin/reset", { method: "POST" }, true).then(() => { showMessage("Demo data reset."); load(); }).catch(fail); };
  load().catch(fail);
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  ({ guide: initGuide, steps: initSteps, agents: initAgents, activity: initActivity })[page]?.();
});
