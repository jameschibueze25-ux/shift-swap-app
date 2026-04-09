# Shift Swap App

A web app that lets employees view their work schedule and request shift swaps with colleagues. Each user has their own account and portal — swap requests are visible in real time across all users.

## Features

- Email and password authentication
- Personal schedule for each user (Monday – Friday, Morning/Evening shifts)
- Request a shift swap by specifying what you're offering and what you want in return
- Same-day period swaps (e.g. Monday Morning ↔ Monday Evening) and cross-day swaps
- Accept or decline incoming swap requests from colleagues
- Schedule updates automatically after an accepted swap
- Data persists across devices via Supabase

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Backend / Database:** [Supabase](https://supabase.com) (Auth + PostgreSQL)

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/jameschibueze25-ux/shift-swap-app.git
cd shift-swap-app
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `schema.sql` — this creates the tables, security policies, and the `accept_swap` function
3. Run `seed-trigger.sql` — this sets up a trigger that automatically creates a profile and default schedule for every new user
4. In Supabase → **Authentication → Email** → disable **Confirm email** for instant signup

### 3. Add your credentials

```bash
cp config.example.js config.js
```

Open `config.js` and fill in your values from Supabase → **Settings → API**:

```js
const SUPABASE_URL      = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### 4. Open the app

Open `index.html` in a browser — no build step required.

## Database Schema

| Table | Description |
|---|---|
| `profiles` | User display names, linked to Supabase auth |
| `shifts` | Each user's shift slots (day + period + time) |
| `swap_requests` | Open, accepted, and cancelled swap requests between users |

## How Swaps Work

1. A user clicks **Request Swap** on one of their shifts
2. They select what shift they want in return
3. The request appears in all other users' **Incoming Swap Requests**
4. Another user clicks **Accept** — the database atomically swaps both users' shifts in a single transaction
5. Both schedules update immediately

## Project Structure

```
shift-swap-app/
├── index.html          # App markup and auth screen
├── script.js           # All app logic and Supabase calls
├── style.css           # Styles
├── schema.sql          # Database tables, RLS policies, accept_swap function
├── seed-trigger.sql    # Trigger to auto-create profile + shifts on signup
├── config.example.js   # Credential template (copy to config.js)
└── .gitignore          # Excludes config.js from version control
```
