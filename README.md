# Irembo Voice Guide

A prototype of a guided, step-by-step walkthrough for applying for a birth certificate through Irembo. It includes administrator tools described in the SRS and simulates a WhatsApp conversation in the browser. It does not connect to WhatsApp or Irembo (SRS 2.1, 2.5).

## Status
Phase 1 MVP prototype. The guided chat and administrator tools are simulated within the browser-based application.

## Setup
1. Install Node.js 18 or newer.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env` and set `ADMIN_PASSCODE`.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

## Pages
- Home — landing page.
- Guide — simulated parent chat.
- Steps — administrator step management.
- Agents — administrator agent management.
- Activity — activity tracking.

The Steps, Agents, and Activity pages require the administrator passcode.
