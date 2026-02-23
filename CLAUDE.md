# Organize Yourselves — Calling Organizer App

## Project Overview

A personal productivity app for LDS church leaders to organize their calling responsibilities, meetings, action items, and quick thoughts. Built as a mobile-first PWA (Progressive Web App) using React + Vite + Tailwind CSS with offline-first storage via Dexie.js (IndexedDB).

**Core philosophy:** "Organize yourselves; prepare every needful thing" — D&C 88:119

**Design mantra:** Less time administering, more time ministering.

## Target Users (Phase 1: Individual / Lite Mode)

Leadership callings only — Ward Council members and above:
- Bishop, Bishopric Counselors, Executive Secretary
- Elders Quorum President, Relief Society President
- Ward Mission Leader
- Young Women President, Primary President, Sunday School President
- Temple & Family History Leader
- Stake President, Stake Presidency Counselors, High Councilors

Phase 1 is a **personal tool** — no data sharing between users. Future phases will add opt-in ward/stake linking.

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + @tailwindcss/forms
- **Storage:** Dexie.js (IndexedDB wrapper) for offline-first local persistence
- **Icons:** lucide-react
- **Dates:** date-fns
- **Routing:** react-router-dom
- **No backend needed for Phase 1** — all data stored locally in IndexedDB

## Key Architecture Decisions

1. **Offline-first:** All data in IndexedDB via Dexie.js. No network required for core functionality. Essential because church buildings often have poor connectivity.
2. **Mobile-first responsive:** Designed for phone use (quick capture during meetings, reviewing tasks between appointments) but works on desktop.
3. **Non-confidential data only:** App is for workflow management, NOT case management. Keep entries generic (e.g., "Meet with John Smith" not details about why). Action items from private meetings should be generic and unlinked to specific individuals' situations.
4. **Handbook-derived defaults:** Each calling comes pre-loaded with responsibilities and meetings from the General Handbook, but everything is customizable.

## Phase 1 Feature Set (What We're Building Now)

### 1. Onboarding Flow
- Enter name
- Select one or more callings from a searchable/grouped list
- App auto-generates: responsibilities (from handbook), meetings (with templates), personalized dashboard
- ~15-20 minutes of focused setup, then builds organically

### 2. Dashboard (Home)
- Greeting with calling context
- Quick capture bar (always accessible, one-tap thought capture)
- Stats cards: Overdue items, Due Today, Active Items, Inbox count
- Focus Items: Starred + High Priority action items
- Upcoming meetings with prep status indicators
- Recent activity feed

### 3. Action Items (The Heart of the System)
- Create with: title, description, owner, priority (High/Medium/Low), starred flag, pillar category, context (at church/home/phone/computer/visit), due date, source meeting, target meetings for reporting
- Views: Today, This Week, Overdue, By Pillar, By Context, All, Completed
- Status flow: Not Started → In Progress → Waiting → Complete
- Sort: Overdue first → Starred → High priority → Due date
- Support recurring items (weekly, monthly, etc.) for things like "Update new move-in list"
- SMART prompting: Encourage specific, measurable, assignable, relevant, time-bound items

### 4. Meetings
- List of meetings per calling with cadence info
- Each meeting type has an agenda template (customizable)
- Create meeting instances (specific dated occurrences)
- During a meeting instance: take notes inline against agenda items, quick-create action items, tag notes for other meetings ("→ Missionary Huddle"), mark attendance
- After meeting: finalize notes, action items auto-distribute
- **Future killer feature:** Notes tagged in one meeting auto-populate agendas in related meetings

### 5. Quick Capture Inbox
- Zero-friction text input from anywhere
- Items land in inbox as unprocessed
- Process later: convert to action item (with full fields), convert to meeting note, move to journal, or discard
- GTD "capture" philosophy — get it out of your head immediately

### 6. Responsibilities
- View all responsibilities grouped by calling
- Handbook-derived defaults marked separately from custom
- Add custom responsibilities (e.g., "Update new move-in list weekly")
- Mark as recurring with cadence
- Grouped by pillar (Living, Caring, Inviting, Uniting, Admin)

### 7. Spiritual Impressions Journal
- Private, never shared (even in future multi-user mode)
- Simple text entry with date and optional tags
- Quick entry from anywhere in the app
- Searchable

### 8. Settings / More
- Manage callings (add/remove, re-run onboarding)
- View responsibilities
- Access journal
- Reset data option
- Export data (future)

## Data Model

All stored in Dexie.js (IndexedDB). Schema defined in `src/db.js`:

```
profile: { name }
callings: [callingKey strings]
responsibilities: [{ id, callingKey, title, pillar, isCustom, isRecurring, recurringCadence }]
meetings: [{ id, callingKey, name, cadence, template[] }]
meetingInstances: [{ id, meetingId, date, notes, agendaItems[], actionItemIds[], status }]
actionItems: [{ id, title, description, status, priority, starred, pillar, context, dueDate, isRecurring, recurringCadence, sourceMeetingInstanceId, targetMeetingIds[], createdAt, completedAt }]
inbox: [{ id, text, createdAt, processed }]
journal: [{ id, text, date, tags[] }]
people: [{ id, name, phone, email }] // manually added as relevant, NOT a full ward list
```

## Four Pillars (Categories for responsibilities and action items)

From Handbook 1.2 — all church work falls under:
1. **Living the Gospel** (blue) — Teaching, learning, ordinances, covenant path
2. **Caring for Those in Need** (amber) — Ministering, service, welfare, compassionate service
3. **Inviting All to Receive the Gospel** (emerald) — Missionary work, new/returning members, activation
4. **Uniting Families for Eternity** (purple) — Temple, family history, sealing
5. **Administration** (gray) — Callings, meetings, finances, records (our addition)

## Calling Configurations

Pre-built in `src/data/callings.js`. Each calling has:
- `key`, `title`, `org`, `handbook` reference
- `responsibilities[]` — each with title and pillar
- `meetings[]` — each with name, cadence, and agenda template

Callings currently defined: bishop, bishopric_1st, bishopric_2nd, exec_secretary, eq_president, rs_president, ward_mission_leader, yw_president, primary_president, ss_president, temple_fh_leader, stake_president, high_councilor

## Calling Pipeline (Future Phase 2-3)

Kanban flow for managing calling changes:
IDENTIFIED → PRAYED ABOUT → DISCUSSED IN BISHOPRIC → EXTENDED → ACCEPTED → SUSTAINED → SET APART
(with DECLINED branch back to IDENTIFIED)

Each stage transition auto-generates appropriate action items.

## Meeting Workflow (The Core Innovation for Phase 2)

**Before:** Auto-generate agenda from template + unresolved items from last instance + tagged notes from other meetings
**During:** Notes inline on agenda, quick-create action items, tag notes for other meetings
**After:** Finalize, distribute action items, queue tagged notes for destination meetings

## UX Principles

1. **5-minute Sunday:** Most use in short bursts. Quick capture, quick review, quick prep.
2. **Progressive disclosure:** Simple by default, power features available but not overwhelming.
3. **Mobile-first:** Thumb-friendly, quick input, works offline.
4. **Respect the sacred:** Tone reflects the sacred nature of service. No gamification.
5. **Simplicity is key:** Every screen should be immediately clear. Minimal taps to accomplish common tasks.

## Color Palette

- Primary: Blue-700 (#1e3f8f) — headers, buttons, active states
- Pillar colors: Blue (Living), Amber (Caring), Emerald (Inviting), Purple (Uniting), Gray (Admin)
- Background: Slate-50
- Cards: White with subtle border
- Sage green accent available for spiritual/sacred elements

## Project Structure

```
calling-organizer/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── CLAUDE.md              ← You are here
├── public/
│   └── manifest.json      ← PWA manifest (to create)
├── src/
│   ├── main.jsx           ← Entry point (to create)
│   ├── App.jsx            ← Root component with routing (to create)
│   ├── index.css           ← Tailwind directives + component classes
│   ├── db.js               ← Dexie database schema + helper functions
│   ├── data/
│   │   └── callings.js     ← Handbook-derived calling configurations
│   ├── components/
│   │   ├── Onboarding.jsx
│   │   ├── Dashboard.jsx
│   │   ├── ActionItems.jsx
│   │   ├── ActionItemForm.jsx
│   │   ├── Meetings.jsx
│   │   ├── MeetingDetail.jsx
│   │   ├── MeetingNotes.jsx
│   │   ├── InboxView.jsx
│   │   ├── Responsibilities.jsx
│   │   ├── Journal.jsx
│   │   ├── MoreMenu.jsx
│   │   └── shared/          ← Reusable UI pieces
│   │       ├── PillarBadge.jsx
│   │       ├── PriorityBadge.jsx
│   │       ├── ActionItemRow.jsx
│   │       └── Modal.jsx
│   ├── hooks/
│   │   └── useDb.js         ← Custom hooks for database operations
│   └── utils/
│       ├── dates.js         ← Date formatting helpers
│       └── constants.js     ← Shared constants
```

## Build Order

1. Shared utilities and hooks (dates.js, constants.js, useDb.js)
2. Shared UI components (PillarBadge, PriorityBadge, ActionItemRow, Modal)
3. main.jsx + App.jsx with routing shell
4. Onboarding flow (name → calling selection → auto-setup)
5. Dashboard with quick capture
6. Action Items (list views + create/edit form)
7. Meetings list + Meeting Detail + Meeting Notes
8. Inbox (capture + process flow)
9. Responsibilities view (with custom add)
10. Journal
11. Settings / More menu
12. PWA manifest + service worker for offline

## Revised Full Roadmap

- **Phase 1:** Personal dashboard + meetings + action items + quick capture + responsibilities + journal (CURRENT)
- **Phase 2:** Meeting intelligence (note tagging, auto-agendas) + calling pipeline kanban
- **Phase 3:** Onboarding wizard improvements + mentoring mode + transition/handoff packages
- **Phase 4:** Calendar, visits, receipts, lesson library
- **Phase 5:** Multi-user ward sync + delegation + stake-level views (LAST)

## What's Already Built

### Config & Data Layer (from prior session)
- `package.json` — All dependencies declared (npm install already run)
- `vite.config.js` — Vite config (port 3001, open: false)
- `tailwind.config.js` — Custom colors (primary blue, sage green)
- `postcss.config.js` — PostCSS config
- `index.html` — HTML entry point
- `src/index.css` — Tailwind directives + component utility classes (btn-primary, btn-secondary, card, input-field, badge variants for priority and pillar)
- `src/db.js` — Complete Dexie database schema with all CRUD helpers and dashboard stats function. Note: `getProfile()` returns `null` (not undefined) when empty, so `useLiveQuery` can distinguish "loading" from "no data".
- `src/data/callings.js` — Full calling configurations for 13 leadership callings with responsibilities, meetings, agenda templates, pillar categories, handbook references

### Build Steps 1-5 (completed this session)
- `src/utils/dates.js` — 10 date formatting helpers (formatShort, formatFriendly, formatDueStatus, isOverdue, todayStr, etc.)
- `src/utils/constants.js` — All enums: STATUSES, PRIORITIES, CONTEXTS, CADENCES, MEETING_STATUSES, PILLAR_BADGE_CLASS, ACTION_VIEWS, NAV_TABS
- `src/hooks/useDb.js` — 11 reactive hooks using dexie-react-hooks (useProfile, useUserCallings, useActionItems, useInbox, useDashboardStats, useOnboardingComplete, etc.)
- `src/components/shared/PillarBadge.jsx` — Pillar category badge
- `src/components/shared/PriorityBadge.jsx` — Priority level badge
- `src/components/shared/ActionItemRow.jsx` — Tappable action item row with status/star toggles, badges, overdue highlighting
- `src/components/shared/Modal.jsx` — Bottom-sheet (mobile) / centered dialog (desktop), Escape/backdrop close, scroll lock
- `src/components/shared/BottomNav.jsx` — 5-tab bottom nav with inbox badge count
- `src/main.jsx` — Entry point with BrowserRouter
- `src/App.jsx` — Root component: loading spinner → onboarding gate → routes + bottom nav
- `src/components/Onboarding.jsx` — Full 2-step flow: name entry → calling selection with search/org grouping → auto-setup
- `src/components/Dashboard.jsx` — Greeting, quick capture bar, 4 stat cards (tappable), focus items (starred/high-priority), upcoming meetings
- `src/components/ActionItems.jsx` — Placeholder (step 6)
- `src/components/Meetings.jsx` — Placeholder (step 7)
- `src/components/InboxView.jsx` — Placeholder (step 8)
- `src/components/MoreMenu.jsx` — Menu items for Responsibilities, Journal, People, Settings

## What Needs to Be Built Next

Build steps 6-12 remain. Start with step 6 (Action Items):

6. **Action Items** — List views (Today, This Week, Overdue, By Pillar, By Context, All, Completed) + create/edit form with ActionItemForm.jsx
7. **Meetings** — List + MeetingDetail + MeetingNotes (agenda, notes, action item creation)
8. **Inbox** — Quick capture input + process flow (convert to action item, meeting note, journal, or discard)
9. **Responsibilities** — View grouped by calling, custom add, recurring cadence
10. **Journal** — Simple text entries with date/tags, searchable
11. **Settings / More** — Manage callings, reset data
12. **PWA** — manifest.json + service worker for offline

## Important Notes

- Dependencies already installed. Run `npm run dev` to start (port 3001).
- The db.js helper functions return promises (use async/await)
- Calling configs in callings.js export both the full CALLINGS object and helper functions (getCallingList, getCallingConfig, getOrgLabel, getPillarConfig)
- Keep the UI simple and clean. Avoid over-engineering. Ship something usable fast.
- Production build verified: `npx vite build` passes cleanly (1708 modules, no errors)
