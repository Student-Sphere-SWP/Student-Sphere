# Student Sphere — Learning Management System

A full-stack Node.js LMS with four user roles: **Admin**, **Lecturer**, **Student**, and **Mentor**. Features AI-powered quiz generation via Google Gemini, PDF lecture notes, module chat, session booking, progress tracking, and profile picture uploads.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + Express.js |
| Templating | EJS + Tailwind CSS (CDN) |
| Database | PostgreSQL (Supabase) |
| Storage | Supabase Storage |
| AI | Google Gemini 1.5 Flash |
| Auth | JWT (httpOnly cookie) |
| Charts | Chart.js (CDN) |
| Email | Nodemailer (SMTP) |

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- A Google Gemini API key — [get one here](https://aistudio.google.com/app/apikey)
- An SMTP email provider (Gmail, Mailgun, etc.)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in all values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string (with `?sslmode=require`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role secret key |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name (see step 4) |
| `JWT_SECRET` | Any long random string (min 32 chars) |
| `SESSION_SECRET` | Any long random string |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP username / email address |
| `EMAIL_PASS` | SMTP password or app password |
| `EMAIL_FROM` | Sender display name and address |
| `APP_URL` | Public URL (e.g. `http://localhost:3000`) |
| `PORT` | Server port (default `3000`) |

### 3. Run the database migration

In your Supabase dashboard go to **SQL Editor** and run the content of:

```
migrations/001_initial.sql
```

This creates all 15 tables, indexes, triggers, and a seed admin user.

### 4. Create the Supabase Storage bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **New bucket**
3. Name it exactly as set in `SUPABASE_STORAGE_BUCKET` (e.g. `studentsphere`)
4. Set it to **Public** (so uploaded files can be served via URL)

### 5. Start the server

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The app will be available at `http://localhost:3000` (or your configured `PORT`).

---

## Default Admin Credentials

| Email | Password |
|-------|----------|
| `admin@studentsphere.com` | `Admin@123` |

**Change the password immediately after first login.**

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Manage all users, modules, enrollments, view analytics |
| **Lecturer** | Manage their modules: upload PDFs, post announcements, create quizzes, view analytics |
| **Student** | Browse and enroll in modules, generate AI quizzes, practice quizzes, chat, book tutor sessions, track progress |
| **Mentor** | Upload tutor notes, create and manage sessions, mark attendance, view analytics |

---

## Key Features

- **AI Quiz Generation** — Students select a lecture PDF and choose 5–20 questions; Gemini extracts the PDF text and generates a multiple-choice quiz. Scores are tracked per topic (mastery levels: Need Practice / Getting There / Proficient / Mastered).
- **Manual Practice Quizzes** — Lecturers create static quizzes for practice (no progress impact).
- **Module Chat** — Real-time-style chat (10-second auto-refresh) per module, visible to all enrolled users.
- **Profile Pictures** — All users can upload a profile photo stored in Supabase Storage.
- **Password Reset** — Email-based token flow (30-minute expiry).
- **Charts** — Chart.js visualisations on admin analytics and progress pages.

---

## Project Structure

```
├── app.js                  # Express entry point
├── package.json
├── .env.example
├── migrations/
│   └── 001_initial.sql
├── public/
│   └── js/main.js
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── supabase.js
│   ├── helpers/
│   │   ├── gemini.js
│   │   ├── mailer.js
│   │   ├── pdfExtract.js
│   │   └── storage.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── upload.js
│   └── routes/
│       ├── auth.js
│       ├── admin.js
│       ├── lecturer.js
│       ├── student.js
│       └── mentor.js
└── views/
    ├── partials/       # head, navbar, flash, footer
    ├── auth/           # login, register, forgot-password, reset-password
    ├── shared/         # profile
    ├── errors/         # 404, 500
    ├── admin/          # dashboard, users, modules, enrollments, analytics…
    ├── lecturer/       # dashboard, module, quizzes, analytics…
    ├── student/        # dashboard, modules, quizzes, progress, tutors…
    └── mentor/         # dashboard, sessions, notes, analytics…
```

---

## License

MIT
