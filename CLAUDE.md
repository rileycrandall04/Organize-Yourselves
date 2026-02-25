# Organize Yourselves — Calling Organizer App

## Project Overview

A personal productivity app for LDS church leaders to organize their calling responsibilities, meetings, action items, and quick thoughts. Built as a mobile-first PWA (Progressive Web App) using React + Vite + Tailwind CSS with offline-first storage via Dexie.js (IndexedDB).

**Core philosophy:** "Organize yourselves; prepare every needful thing" — D&C 88:119

**Design mantra:** Less time administering, more time ministering.

## Tech Stack

- **Frontend:** React 18 + Vite 5.4.21 + Tailwind CSS + @tailwindcss/forms
- **Storage:** Dexie.js v3.2.4 (IndexedDB wrapper) for offline-first local persistence
- **Icons:** lucide-react
- **Dates:** date-fns
- **Routing:** react-router-dom (BrowserRouter)
- **AI:** Optional Anthropic/OpenAI integration via `src/utils/ai.js`
- **No backend needed** — all data stored locally in IndexedDB
- **Dev server:** port 3001 via `.claude/launch.json`
- **GitHub:** `rileycrandall04/Organize-Yourselves`

## Current Version: v0.4.0

## What's Built (Complete Feature Set)

### Core Features (Phase 1)
- Onboarding flow (name + calling selection → auto-setup)
- Dashboard with quick capture, stats cards, focus items, upcoming meetings
- Action Items with views (Today, This Week, Overdue, By Pillar, By Context, All, Completed)
- Meetings with auto-generated agendas, inline notes, carry-forward action items
- Quick Capture Inbox with process flow
- Responsibilities (handbook defaults + custom)
- Spiritual Impressions Journal
- People management
- Settings with backup/restore/export
- Ministering (EQ/RS/Bishopric callings)

### Calling Pipeline (Phase 2-4)
- Full org chart with 10 organizations, presidency tiers, and hierarchy
- Kanban and list views alongside org chart
- Stage flow: Identified → Discussed → Prayed About → Assigned to Extend → Extended → Accepted → Sustained → Set Apart → Serving
- Release flow: Release Planned → Release Meeting → Released
- Candidate management with autocomplete from People
- Auto-generated action items on stage transitions
- Priority system (high/low only)

### Pipeline Display (PR #6)
- 5 display stage groups with filter chips (Discussing, Need to Extend, Sustaining, To be Set Apart, Complete)
- Org chip click → filter org chart to single auxiliary
- Pipeline on bottom tab bar; Inbox moved to More menu
- Scoped "Reports To" per auxiliary organization

### Meeting Intelligence (PR #6)
- Focus Families/Individuals section in meeting notes
- Text selection toolbar: highlight text → create action item or tag for another meeting
- Calling snooze on pipeline agenda items
- Expanded agenda propagation (all active stages through set_apart)
- Note tagging across meetings with auto-populate
- AI-powered meeting summaries and action item suggestions

### AI Chat (PR #6)
- CallingChat component on Pipeline page (floating chat panel)
- `callingChatMessage()` with full pipeline context
- Suggested question chips for quick queries
- Only visible when AI is configured (Settings → API key)

### Tutorial (PR #6)
- 6-step first-time tutorial overlay
- localStorage flag prevents re-showing
- Skip button available

## Key Architecture Decisions

1. **Offline-first:** All data in IndexedDB via Dexie.js. No network required for core functionality.
2. **Mobile-first responsive:** Designed for phone use but works on desktop.
3. **Non-confidential data only:** Workflow management, NOT case management.
4. **Handbook-derived defaults:** Each calling pre-loaded with responsibilities and meetings.
5. **AI optional:** Works fully without AI; API key adds summaries, suggestions, and chat.

## Key Files & Data Model

### Database (`src/db.js`)
- 4 schema versions (v1 base → v4 enhanced pipeline)
- Key tables: `profile`, `userCallings`, `callingSlots`, `meetings`, `meetingInstances`, `actionItems`, `inbox`, `journal`, `people`, `meetingNoteTags`
- Key functions: `buildAutoAgenda()`, `getCallingPipelineAgendaItems()`, `transitionCallingSlot()`, `getAutoActionsForTransition()`, `syncCallingNotesFromMeeting()`

### Calling Config (`src/data/callings.js`)
- `PRESIDENCY_ROLES`: Maps 6 org keys → role name arrays
- `REPORTS_TO_ROLES`: Flat array of valid parent roles
- `getReportsToForOrg(orgKey)`: Scoped filtering helper
- `ORG_HIERARCHY`: Full org chart tree structure
- `ORG_TEMPLATES`: Default positions per organization
- `JURISDICTION_MAP`: Maps callingKey → { orgs, scope }

### Constants (`src/utils/constants.js`)
- `CALLING_STAGES`, `CALL_STAGE_ORDER`, `RELEASE_STAGE_ORDER`
- `CALLING_PRIORITIES`: high and low only (no medium)
- `DISPLAY_STAGE_GROUPS`: 5 user-friendly categories mapping 9 granular stages

### AI (`src/utils/ai.js`)
- Supports Anthropic (Claude) and OpenAI providers
- `callAi()` core function, `callingChatMessage()`, `summarizeMeetingNotes()`, `suggestActionItems()`
- Config stored in localStorage

## Project Structure

```
src/
├── main.jsx
├── App.jsx                    ← Router + tutorial gate
├── index.css                  ← Tailwind + component classes
├── db.js                      ← Dexie schema + all CRUD helpers
├── data/
│   └── callings.js            ← Calling configs, org hierarchy, templates
├── components/
│   ├── Dashboard.jsx
│   ├── ActionItems.jsx
│   ├── Meetings.jsx
│   ├── MeetingNotes.jsx       ← Agenda, notes, focus families, selection toolbar
│   ├── CallingPipeline.jsx    ← Pipeline orchestrator (org chart, kanban, list)
│   ├── CallingChat.jsx        ← AI chat panel on pipeline page
│   ├── CallingSlotForm.jsx    ← Form with autocomplete, scoped reports-to
│   ├── OrgChart.jsx           ← Org chart with stage/org filtering
│   ├── NeedsDashboard.jsx     ← Open positions + service alerts
│   ├── CandidateManager.jsx
│   ├── Tutorial.jsx           ← First-time 6-step tutorial
│   ├── Onboarding.jsx
│   ├── InboxView.jsx
│   ├── MoreMenu.jsx
│   ├── Settings.jsx
│   ├── People.jsx
│   ├── Journal.jsx
│   ├── Responsibilities.jsx
│   ├── Ministering.jsx
│   ├── SacramentProgram.jsx
│   └── shared/
│       ├── BottomNav.jsx      ← Home, Actions, Meetings, Pipeline, More
│       ├── ActionItemRow.jsx
│       ├── Modal.jsx
│       ├── MeetingPicker.jsx
│       ├── AiButton.jsx
│       ├── PillarBadge.jsx
│       └── PriorityBadge.jsx
├── hooks/
│   └── useDb.js               ← Reactive hooks (useLiveQuery)
└── utils/
    ├── ai.js                  ← AI provider abstraction
    ├── dates.js               ← Date formatting helpers
    └── constants.js           ← Enums, stage config, display groups
```

## Git History (PRs merged to master)

1. **PR #1** — Initial app build (onboarding, dashboard, actions, meetings, inbox, journal)
2. **PR #2** — Calling pipeline (kanban, org chart, stage transitions)
3. **PR #3** — Flat folder org chart redesign
4. **PR #4** — Pipeline UX defaults (org view, collapse sections, open positions)
5. **PR #5** — Presidency tiers, workflow redesign, meeting integration
6. **PR #6** — Meeting intelligence, AI chat, pipeline enhancements, UI compaction, tutorial (v0.4.0)

## UX Principles

1. **5-minute Sunday:** Most use in short bursts.
2. **Progressive disclosure:** Simple by default, power features available.
3. **Mobile-first:** Thumb-friendly, quick input, works offline.
4. **Respect the sacred:** Tone reflects the sacred nature of service.
5. **Simplicity is key:** Every screen immediately clear, minimal taps.

## Notes for Future Sessions

- Build passes cleanly: `npx vite build` (1736 modules, ~559 KB gzipped ~156 KB)
- Dev server: `npm run dev` on port 3001
- Always use `preview_snapshot` instead of `preview_screenshot` for visual verification
- Bottom nav: Home, Actions, Meetings, Pipeline, More
- Priorities are high/low only (medium was removed in v0.4.0)
- `getReportsToForOrg()` scopes parent options per auxiliary
- Tutorial uses localStorage key `tutorial_completed`
- AI config uses localStorage key `organize_ai_config`
