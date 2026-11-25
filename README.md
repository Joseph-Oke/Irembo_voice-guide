# Irembo Voice Guide (Phase 1 MVP prototype)

A prototype of the SRS: a guided, step-by-step walkthrough for applying for a birth certificate on Irembo, with the administrator tools the SRS describes. It simulates the WhatsApp chat in the browser. It does not connect to WhatsApp or to Irembo (SRS 2.1, 2.5).

## Run it
1. Install Node.js 18 or newer.
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and set `ADMIN_PASSCODE`.
4. `npm start`, then open http://localhost:3000

Pages: Home, Guide (parent chat), Steps, Agents, Activity. The last three ask for the administrator passcode.

## Demo script
1. **Guide:** send Hi, tap Yes, tap Done a few times, tap Repeat once.
2. Tap **I'm stuck** twice: you get a verified agent's contact (FR 3).
3. Tap Close chat, then Hi: the guide resumes at the saved step (FR 4.2).
4. **Activity:** click "Simulate 8 days idle", then Hi in the Guide: it starts fresh (7-day rule).
5. **Steps:** edit a step, upload a voice note under 200 KB, tick "Approved by a native speaker" (FR 5.1).
6. **Agents:** add or verify an agent, and resolve an escalation.

## SRS traceability
| Requirement | Where |
|---|---|
| FR 1.1 Greet and confirm | `handle()` in server.js, greeting then Yes button |
| FR 1.2 Send first step (voice note plus text) | step message with Play voice note button |
| FR 2.1 Done advances, FR 2.2 Repeat | Done and Repeat buttons, or type 1 or 2 (NFR 5) |
| FR 3.1 Two consecutive "I'm stuck" | `STUCK_LIMIT = 2`, Repeat does not count |
| FR 3.2 Nearest verified agent | district match, else first verified agent |
| FR 4.1 Save step, FR 4.2 Resume within 7 days | `RESUME_DAYS = 7`, data/db.json |
| FR 5.1 Edit step text and voice notes | Steps page, 200 KB limit |
| FR 5.2 Usage stats | Activity page |
| Manage agent contact list | Agents page |
| NFR 2, 3 Minimal data | only phone, language and role stored; numbers masked for admin |
| Actors | Primary and secondary user (Guide), Administrator (admin pages), Irembo Agent (receives the user's contact, outside the bot) |
| Class diagram | Guide, GuideStep, Session, Escalation, IremboAgent and BotController are the shapes in `db` and `handle()` |

## Known gaps (honest list)
- **Kinyarwanda:** none is included. SRS 2.5 requires a native speaker to supply and approve it. Add it on the Steps page. Set `ENFORCE_NATIVE_APPROVAL=true` to withhold unapproved steps.
- **Voice:** without an uploaded file the Play button uses your browser's English voice as a placeholder.
- **Step text** is sample content from Irembo's public help pages. Check it against the live process.
- **Agent contacts** are sample data with non-dialable numbers. Add real, verified agents.
- **Storage** is a JSON file (data/db.json). Swap in SQLite for production.
- **WhatsApp** (Twilio or Meta API) is not connected yet.
