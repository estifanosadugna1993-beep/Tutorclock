# Tutorly — Full-Stack Tutor Management App

Tutorly is a production-ready Next.js (App Router) + PostgreSQL application designed for independent tutors to track tutoring time, manage student rosters, create payment requests, and export family-ready session summary reports.

---

## 🚀 How to Launch This Application in Real Production

To launch this app on the internet with your own domain so families and tutors can use it, you need two things: **a hosted PostgreSQL database** and **a Node.js web server / cloud host** for the Next.js frontend and backend APIs.

### 1. Hosted PostgreSQL Database (Free or Paid)
The app stores users, students, sessions, and payment requests in PostgreSQL via Drizzle ORM.
Recommended cloud database providers:
- **[Neon](https://neon.tech/)** *(Serverless PostgreSQL – free tier available)*
- **[Supabase](https://supabase.com/)** *(PostgreSQL – free tier available)*
- **[Railway](https://railway.app/)** *(PostgreSQL database addon)*
- **[Render](https://render.com/)** *(Managed PostgreSQL)*

When you create your database, copy your connection string URL (it looks like `postgresql://user:password@hostname:5432/dbname?sslmode=require`).

---

### 2. Cloud Application Hosting (Next.js Frontend + Backend API)
Because Next.js has built-in API routes (`src/app/api/`), **your frontend and backend are hosted together in a single deployment**. You do **not** need a separate backend server.

#### Option A: Deploy on Vercel (Easiest for Next.js)
1. Push this project repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Sign in to [Vercel](https://vercel.com/) and click **Add New -> Project**, then import your Git repository.
3. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your PostgreSQL connection string from Neon / Supabase / Railway.
   - `AUTH_SECRET`: A secure random 32+ character string (e.g. generated via `openssl rand -hex 32`) to sign authentication cookies.
4. Click **Deploy**. Vercel will build and launch your full-stack app automatically with a free HTTPS domain (`your-app.vercel.app`).
5. Run your database schema push against your production database:
   ```bash
   DATABASE_URL="your_production_connection_string" npx drizzle-kit push
   ```

#### Option B: Deploy on Railway or Render (Container / VPS Hosting)
1. Import your GitHub repository into [Railway](https://railway.app/) or [Render](https://render.com/).
2. Add a **PostgreSQL Database service** in the same workspace.
3. In your app’s environment variables, set:
   - `DATABASE_URL`: The internal or external database connection URL provided by Railway/Render.
   - `AUTH_SECRET`: A secure random secret string.
   - `NODE_ENV`: `production`
4. Set the build command to `npm run build` and start command to `npm run start`.
5. Run `npx drizzle-kit push` once after deploying to initialize your production tables.

---

## 🛠️ Local Development & Commands

- **Run Dev Server:** `npm run dev`
- **Apply Database Schema:** `npx drizzle-kit push`
- **Typecheck:** `npm run typecheck`
- **Production Build:** `npm run build`

## 📦 Project Structure

- `src/db/schema.ts` — Drizzle PostgreSQL table definitions (`users`, `students`, `tutoring_sessions`, `payment_requests`).
- `src/lib/auth.ts` — Cookie-based authentication, password hashing, and demo data seeding.
- `src/app/api/*` — Backend REST API routes for authentication, dashboard metrics, CRUD flows, and CSV report export.
- `src/app/page.tsx` — Full-featured interactive UI (tutor clock, student cards, session history, payment requests, report preview).
