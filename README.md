# HallManager

**Venue booking management software for community halls and event spaces.**

HallManager is a full-stack web application that helps hall managers and venue operators handle bookings, invoices, regular bookers, and accounting — all from a single clean dashboard. Built for real-world venue management, it covers everything from a public-facing booking request form through to QuickFile accounting sync.

---

## Features

### For Managers & Admins
- **Dashboard** — at-a-glance overview of pending bookings, extra slot requests, confirmed upcoming sessions, and total revenue
- **Bookings** — manage all booking requests; approve or deny with automatic email notifications; create bookings manually on behalf of customers
- **Public Booking Form** — a shareable `/book` URL that anyone can use to submit a booking request without creating an account
- **Extra Slot Requests** — dedicated queue for one-off additional sessions from regular bookers, with their custom rate applied automatically
- **Calendar View** — month-view calendar with per-venue filtering and a day detail panel
- **Sites & Venues** — manage multiple venues with individual rates, deposit amounts, capacity, and emoji identifiers
- **Users & Access** — manage admin, manager, and regular booker accounts; send invite emails; reset passwords; assign venues; set custom per-site rates for regular bookers
- **QuickFile Integration** — sync invoices to QuickFile accounting software; link regular bookers to QuickFile client records; track sync status
- **Settings** — accent colour theming, email notification preferences, and Stripe Connect (coming soon)

### For Regular Bookers (Portal)
- Personalised portal showing their bookings, extra slot requests, invoices, and custom pricing
- Submit extra slot requests directly, with their negotiated rate applied automatically and a live price preview
- View invoice history and payment status

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Custom CSS design system + Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth |
| Email | Resend API via Supabase Edge Functions (Deno) |
| Accounting | QuickFile API integration |
| Hosting | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Resend](https://resend.com) account (for email)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed

### 1. Clone and install

```bash
git clone https://github.com/your-username/hallmanager.git
cd hallmanager
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database setup

Run `supabase/schema.sql` in your Supabase SQL editor to create all tables, RLS policies, and seed data.

Then add these policies to enable the public booking form:

```sql
-- Allow anyone to read sites (for the public booking form)
CREATE POLICY "Public can view sites"
  ON sites FOR SELECT TO anon USING (true);

-- Allow anyone to submit a pending booking
CREATE POLICY "Public can submit bookings"
  ON bookings FOR INSERT TO anon
  WITH CHECK (status = 'pending');
```

### 4. Deploy Edge Functions

```bash
cd hallmanager
supabase functions deploy send-email
supabase functions deploy invite-user
```

Set the following secrets in your Supabase project dashboard (Settings → Edge Functions):

```
RESEND_API_KEY=your-resend-key
SITE_URL=https://your-domain.com
```

### 5. Run locally

```bash
npm run dev
```

---

## Project Structure

```
src/
  pages/
    Dashboard.tsx        # Overview + pending actions
    Bookings.tsx         # Booking management + admin create
    BookingForm.tsx      # Public booking request form (/book)
    ExtraSlots.tsx       # Extra slot request queue
    CalendarView.tsx     # Month calendar with day detail
    Sites.tsx            # Venue management
    Users.tsx            # User management + invite + roles
    Portal.tsx           # Regular booker self-service portal
    QuickFile.tsx        # Accounting integration
    Settings.tsx         # Theme, notifications, Stripe
  components/
    Layout.tsx           # Sidebar + topbar
    ui/                  # Badge, Button, Modal, etc.
  lib/
    supabase.ts          # Typed Supabase client
    database.types.ts    # All table types
    email.ts             # Email helper
  context/
    AuthContext.tsx      # Auth state + profile
    ThemeContext.tsx      # Accent colour theming
supabase/
  functions/
    send-email/          # Booking + slot notification emails
    invite-user/         # Admin user invite via Supabase Auth
  schema.sql             # Full DB schema with RLS
```

---

## Licence

Private — all rights reserved.
