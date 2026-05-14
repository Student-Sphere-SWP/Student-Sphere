# Student Sphere — Learning Management System

A full-stack web-based LMS built with Node.js and Express. It supports four user roles (Admin, Lecturer, Student, Mentor), AI-generated quizzes powered by Google Gemini, adaptive learning, PDF study materials, module chat, tutorial sessions, progress tracking, and analytics.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Roles & Capabilities](#roles--capabilities)
- [Database Schema](#database-schema)
- [Route Reference](#route-reference)
- [Authentication & Security](#authentication--security)
- [AI Features](#ai-features)
- [File Storage](#file-storage)
- [Email](#email)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Error Handling](#error-handling)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + Express.js |
| Templating | EJS + Tailwind CSS (CDN) |
| Database | PostgreSQL (hosted on Supabase) |
| DB Client | `pg` (node-postgres Pool) |
| Storage | Supabase Storage |
| AI | Google Gemini 2.5 Flash Lite (`@google/generative-ai`) |
| Auth | JWT (httpOnly cookie, 7-day expiry) + bcrypt (cost 12) |
| PDF Parsing | `pdf-parse` |
| File Upload | Multer (in-memory buffer) |
| Session | `express-session` (flash messages only) |
| Validation | `express-validator` |
| Charts | Chart.js (CDN) |
| Email | Nodemailer (SMTP / Gmail) |

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- A Google Gemini API key — [get one here](https://aistudio.google.com/app/apikey)
- An SMTP email provider (Gmail, Mailgun, etc.)

---

## Project Structure

```
student-sphere/
├── app.js                    # Express entry point, middleware, route mounting
├── package.json
├── migrations/
│   └── 001_initial.sql       # Full PostgreSQL schema (tables, indexes, triggers)
├── public/
│   └── js/
│       └── main.js           # Client-side JavaScript
├── src/
│   ├── config/
│   │   ├── database.js       # pg Pool (DATABASE_URL)
│   │   └── supabase.js       # Supabase JS client
│   ├── helpers/
│   │   ├── gemini.js         # AI quiz generation (standard + adaptive)
│   │   ├── mailer.js         # Password reset email via Nodemailer
│   │   ├── pdfExtract.js     # Extract text from PDF buffer (pdf-parse)
│   │   └── storage.js        # Supabase Storage upload / delete
│   ├── middleware/
│   │   ├── auth.js           # JWT parse, requireAuth, requireRole, redirectIfAuthenticated
│   │   └── upload.js         # Multer in-memory single-file upload
│   └── routes/
│       ├── auth.js           # /login /register /forgot-password /reset-password /logout /profile
│       ├── admin.js          # /admin/*
│       ├── lecturer.js       # /lecturer/*
│       ├── student.js        # /student/*
│       └── mentor.js         # /mentor/*
└── views/
    ├── admin/
    │   ├── analytics.ejs
    │   ├── dashboard.ejs
    │   ├── enrollments.ejs
    │   ├── modules.ejs
    │   ├── user-edit.ejs
    │   ├── user-modules.ejs
    │   └── users.ejs
    ├── auth/
    │   ├── forgot-password.ejs
    │   ├── login.ejs
    │   ├── register.ejs
    │   └── reset-password.ejs
    ├── errors/
    │   ├── 404.ejs
    │   └── 500.ejs
    ├── lecturer/
    │   ├── analytics.ejs
    │   ├── create-announcement.ejs
    │   ├── create-quiz.ejs
    │   ├── dashboard.ejs
    │   ├── edit-pdf.ejs
    │   └── module.ejs
    ├── mentor/
    │   ├── analytics.ejs
    │   ├── dashboard.ejs
    │   ├── my-notes.ejs
    │   ├── session-rsvps.ejs
    │   └── sessions.ejs
    ├── partials/
    │   ├── flash.ejs
    │   ├── footer.ejs
    │   ├── head.ejs
    │   └── navbar.ejs
    ├── shared/
    │   └── profile.ejs
    └── student/
        ├── adaptive-quiz-result.ejs
        ├── adaptive-quiz-take.ejs
        ├── adaptive-quiz.ejs
        ├── dashboard.ejs
        ├── manual-quiz-result.ejs
        ├── manual-quiz.ejs
        ├── module.ejs
        ├── modules.ejs
        ├── progress.ejs
        ├── quiz-result.ejs
        ├── quiz.ejs
        ├── sessions.ejs
        ├── tutor-profile.ejs
        └── tutors.ejs
```

---

## Roles & Capabilities

### Admin
- Dashboard with counts of users (by role), modules, enrollments, and AI quiz attempts
- Create, edit, and soft-delete users of any role
- Create, edit, and soft-delete course modules
- Assign lecturers and mentors to modules
- Enroll and unenroll students from modules
- View system-wide analytics

### Lecturer
- Dashboard showing assigned modules with student and PDF counts
- View module detail page (PDFs, announcements, chat history)
- Post, pin, and delete announcements
- Upload and delete PDF study notes
- Edit existing PDF note metadata (topic name, file replacement)
- Create manual MCQ quizzes (configurable questions with A/B/C/D options)
- View per-module analytics (quiz scores by topic)

### Student
- Dashboard with enrolled modules, five most recent quiz scores, overall mastery %
- Browse all available modules and self-enroll / unenroll
- View module page (announcements, PDFs, live-style chat)
- Post chat messages in a module
- Take AI-generated quizzes from any PDF note (choose 5–20 questions)
- Take lecturer-created manual practice quizzes
- Take adaptive quizzes (AI focuses on the student's identified weak topics)
- View detailed results for every quiz type
- Full learning progress page (per-topic averages, weak topic flags, mastery bands)
- Browse mentor profiles with ratings and reviews
- RSVP to and cancel tutorial sessions
- Rate and review mentors after sessions

### Mentor
- Dashboard with module stats, upcoming sessions, and average star rating
- Create tutorial sessions (topic, date/time, capacity, meeting link or location)
- View and manage RSVPs for each session; mark student attendance
- Upload personal tutor PDF notes per module
- Delete own tutor notes
- View per-module analytics (average scores by topic, 30 most recent attempts)

---

## Database Schema

All tables use `UUID` primary keys generated by `gen_random_uuid()` (pgcrypto extension).  
Soft deletes are applied to `user`, `module`, and `pdf_note` via a `deleted_at` column.

### Tables

| Table | Purpose |
|-------|---------|
| `user` | All platform users (admin / lecturer / student / mentor) |
| `module` | Course modules with a unique code and optional colour |
| `user_module` | Lecturers and mentors assigned to a module |
| `student_enrollment` | Student enrolments in modules |
| `announcement` | Module announcements (can be pinned) |
| `module_message` | In-module chat messages |
| `pdf_note` | PDF study materials; `is_tutor_note` flag distinguishes mentor uploads |
| `manual_quiz` | Lecturer-created MCQ quizzes |
| `manual_quiz_question` | Questions for a manual quiz (4 options, correct answer) |
| `manual_quiz_attempt` | Student attempt record for a manual quiz (score %) |
| `ai_quiz_attempt` | Student attempt on an AI-generated quiz (PDF source, topic, score %) |
| `adaptive_quiz_attempt` | Student attempt on an adaptive AI quiz (module + topic, score %) |
| `weak_topic` | Auto-maintained per-student weak topics per module (avg score, attempt count) |
| `tutorial_session` | Mentor-created sessions (date/time, capacity, link/location) |
| `tutor_rating` | Star ratings (1–5) and text reviews left by students for mentors |
| `session_rsvp` | Student RSVPs; tracks `rsvp_status` and `attended` flag |
| `password_reset_token` | Short-lived tokens (1 hour) for email-based password reset |

### Entity Relationships

```
user ──< user_module >── module
user ──< student_enrollment >── module
module ──< announcement
module ──< module_message
module ──< pdf_note
module ──< manual_quiz ──< manual_quiz_question
                       ──< manual_quiz_attempt
module ──< ai_quiz_attempt ──> pdf_note
module ──< adaptive_quiz_attempt
module ──< weak_topic
module ──< tutorial_session ──< session_rsvp
user (mentor) ──< tutor_rating (by student)
```

### Auto-update Triggers

A `update_updated_at()` PL/pgSQL function keeps `updated_at` current on:

- `user`
- `announcement`
- `pdf_note`
- `tutor_rating`
- `weak_topic`

---

## Route Reference

### Auth (`/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate; set JWT cookie; redirect to role dashboard |
| GET | `/register` | Registration page |
| POST | `/register` | Create student account; set JWT cookie |
| GET | `/forgot-password` | Forgot-password page |
| POST | `/forgot-password` | Generate reset token; send email |
| GET | `/reset-password` | Reset-password page (`?token=`) |
| POST | `/reset-password` | Validate token; update password hash |
| POST | `/logout` | Clear JWT cookie |
| GET | `/profile` | View own profile (all roles) |
| POST | `/profile` | Update name, bio, profile picture |

### Admin (`/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Counts: users by role, modules, enrollments, AI quiz attempts |
| GET | `/users` | List users with optional role filter and name/email search |
| POST | `/users` | Create user (any role) |
| GET | `/users/:id/edit` | Edit user form |
| PUT | `/users/:id` | Update user name, email, role, bio, profile picture |
| DELETE | `/users/:id` | Soft-delete user |
| GET | `/modules` | List all modules |
| POST | `/modules` | Create module |
| GET | `/modules/:id/edit` | Edit module form |
| PUT | `/modules/:id` | Update module |
| DELETE | `/modules/:id` | Soft-delete module |
| GET | `/modules/:id/users` | Manage user assignments for a module |
| POST | `/modules/:id/assign` | Assign lecturer or mentor to module |
| DELETE | `/modules/:id/assign/:userId` | Remove assignment |
| GET | `/enrollments` | Manage student enrollments |
| POST | `/enrollments` | Enroll student in module |
| DELETE | `/enrollments/:id` | Unenroll student |
| GET | `/analytics` | Platform-wide analytics |

### Lecturer (`/lecturer`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Assigned modules with student and PDF counts |
| GET | `/modules/:moduleId` | Module detail: PDFs, announcements, chat |
| GET | `/announcements/create` | Create announcement form |
| POST | `/announcements` | Post announcement to a module |
| DELETE | `/announcements/:id` | Delete own announcement |
| POST | `/modules/:moduleId/pdfs` | Upload PDF note to a module |
| GET | `/pdfs/:id/edit` | Edit PDF note metadata |
| PUT | `/pdfs/:id` | Update PDF note (replace file or just metadata) |
| DELETE | `/pdfs/:id` | Soft-delete PDF note |
| GET | `/quizzes/create` | Create manual quiz form |
| POST | `/quizzes` | Save manual quiz with questions |
| GET | `/analytics` | Analytics across all assigned modules |

### Student (`/student`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Enrolled modules, recent scores, mastery summary |
| GET | `/modules` | Browse all modules with enrolment status |
| POST | `/modules/:moduleId/enroll` | Self-enroll |
| POST | `/modules/:moduleId/unenroll` | Unenroll |
| GET | `/modules/:moduleId` | Module detail: announcements, PDFs, chat |
| POST | `/modules/:moduleId/messages` | Post chat message |
| GET | `/quiz/:pdfNoteId` | AI quiz setup page (choose question count) |
| POST | `/quiz/:pdfNoteId/generate` | Extract PDF text; generate quiz via Gemini |
| POST | `/quiz/:pdfNoteId/submit` | Score quiz; save `ai_quiz_attempt`; update `weak_topic` |
| GET | `/quiz-result/:attemptId` | AI quiz result with per-question breakdown |
| GET | `/manual-quiz/:quizId` | Take a lecturer-created manual quiz |
| POST | `/manual-quiz/:quizId/submit` | Score manual quiz; save `manual_quiz_attempt` |
| GET | `/manual-quiz-result/:attemptId` | Manual quiz result detail |
| GET | `/adaptive-quiz/:moduleId` | Adaptive quiz setup (shows current weak topics) |
| POST | `/adaptive-quiz/:moduleId/generate` | Generate adaptive quiz targeting weak topics |
| POST | `/adaptive-quiz/:moduleId/submit` | Score adaptive quiz; update `adaptive_quiz_attempt` and `weak_topic` |
| GET | `/adaptive-quiz-result/:attemptId` | Adaptive quiz result |
| GET | `/progress` | Full progress page: per-topic scores, weak topics, mastery bands |
| GET | `/tutors` | Browse mentors with average rating |
| GET | `/tutors/:mentorId` | Mentor profile: bio, sessions, ratings breakdown |
| POST | `/tutors/:mentorId/rate` | Submit or update a star rating and review |
| GET | `/sessions` | Upcoming tutorial sessions for enrolled modules |
| POST | `/sessions/:sessionId/rsvp` | RSVP to a session |
| DELETE | `/sessions/:sessionId/rsvp` | Cancel RSVP |

### Mentor (`/mentor`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Stats, module list, next 5 upcoming sessions, average rating |
| GET | `/analytics/:moduleId` | Per-topic quiz analytics for a module |
| GET | `/sessions` | All own sessions with RSVP counts |
| GET | `/sessions/create` | Create session form |
| POST | `/sessions` | Create tutorial session |
| DELETE | `/sessions/:id` | Delete session |
| GET | `/sessions/:id/rsvps` | RSVP list for a session |
| POST | `/sessions/:id/rsvps/:studentId/attended` | Toggle student attendance |
| GET | `/notes` | List own tutor notes across all modules |
| POST | `/modules/:moduleId/notes` | Upload tutor PDF note |
| DELETE | `/notes/:id` | Delete tutor note |

---

## Authentication & Security

- Login and registration use **express-validator** for input sanitisation and validation before any database interaction.
- Passwords are hashed with **bcrypt** at cost factor 12.
- On successful login or registration a **JWT** is signed with `JWT_SECRET` (7-day expiry) and set as an `httpOnly`, `SameSite=lax` cookie (`secure: true` in production).
- Every protected route passes through either `requireAuth` (any logged-in user) or `requireRole(role)` (single role guard), both of which verify the JWT and attach `req.user`.
- `redirectIfAuthenticated` prevents authenticated users from accessing `/login` and `/register`.
- Password reset uses a UUID token stored in `password_reset_token` with a 1-hour expiry delivered by email. The token is consumed on use.
- File uploads are handled by Multer in in-memory mode (no temp files on disk). Only `image/*` and `application/pdf` are accepted.

---

## AI Features

Powered by **Google Gemini 2.5 Flash Lite** via `@google/generative-ai`.

### Standard AI Quiz (`generateQuiz`)

1. The PDF's raw text is extracted by `pdf-parse`.
2. Text is truncated to 10,000 characters to stay within token limits.
3. A structured prompt asks Gemini to produce a JSON array of MCQ questions.
4. The response is cleaned of any markdown fences before `JSON.parse`.
5. A fallback regex extractor handles rare cases where Gemini wraps output in text.

Each question object shape:
```json
{
  "question": "string",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A"
}
```

### Adaptive Quiz (`generateAdaptiveQuiz`)

1. The student's `weak_topic` rows for the module are queried (topics with avg score < 70%).
2. Topic names are passed to Gemini with instructions to focus questions on those areas.
3. After submission, each weak topic's avg score and attempt count are recalculated.
4. Topics where the student achieves ≥ 70% are removed from `weak_topic`.

---

## File Storage

Files are stored in a **Supabase Storage** bucket (default name: `student-sphere-files`).

| Folder | Content |
|--------|---------|
| `avatars/` | User profile pictures (images) |
| `pdfs/` | Lecturer and tutor PDF notes |

**`uploadFile(buffer, originalName, folder, mimeType)`** — uploads the buffer with a UUID filename and returns the public URL.

**`deleteFile(publicUrl)`** — extracts the storage path from the Supabase public URL and removes the object from the bucket.

The bucket must be set to **Public** so uploaded files are accessible via URL without authentication.

---

## Email

Nodemailer sends password reset emails over SMTP (default: Gmail on port 587, STARTTLS).

The reset email is a styled HTML message containing a branded button that links to `/reset-password?token=<token>`. The link expires after **1 hour**.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
NODE_ENV=development
PORT=3000
SESSION_SECRET=replace-with-a-long-random-string

# PostgreSQL (Supabase connection string)
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

# JWT
JWT_SECRET=replace-with-another-long-random-string

# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_STORAGE_BUCKET=student-sphere-files

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=Student Sphere <no-reply@studentsphere.com>

# Application base URL (used in password reset links)
APP_URL=http://localhost:3000
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the template above into `.env` and fill in all values.

### 3. Run the database migration

Apply `migrations/001_initial.sql` to your Supabase database via the SQL Editor or psql:

```bash
psql "$DATABASE_URL" -f migrations/001_initial.sql
```

This creates all tables, indexes, and triggers.

### 4. Create the Supabase Storage bucket

1. Go to **Storage** in your Supabase dashboard.
2. Click **New bucket** and name it to match `SUPABASE_STORAGE_BUCKET`.
3. Set visibility to **Public**.

### 5. Start the server

```bash
# Development (with auto-reload via nodemon)
npm run dev

# Production
npm start
```

The app listens on `http://localhost:3000` (or `PORT`). Visiting `/` redirects to `/login`.

### 6. Create the first admin user

Register a student account at `/register`, then promote it in the database:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| 404 Not Found | Renders `views/errors/404.ejs` with `status 404` |
| Unhandled server error | Renders `views/errors/500.ejs` with `status 500` and the error message |
| Flash messages | Success / error / info stored in session; displayed by `views/partials/flash.ejs` on the next request |
| Auth failure | Redirect to `/login` with a session error flash |

---

## License

MIT

