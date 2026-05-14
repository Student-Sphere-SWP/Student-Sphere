# Student Sphere

A full-stack Learning Management System (LMS) built with Node.js and Express, featuring AI-powered quiz generation, role-based dashboards, social features, and detailed analytics.

---

## Table of Contents

- [System Overview](#system-overview)
- [Tech Stack](#tech-stack)
- [User Roles](#user-roles)
- [Features](#features)
  - [Authentication](#authentication)
  - [Admin](#admin)
  - [Lecturer](#lecturer)
  - [Mentor / Tutor](#mentor--tutor)
  - [Student](#student)
  - [Social & Notifications](#social--notifications)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Migrations](#migrations)

---

## System Overview

Student Sphere is a multi-role academic platform that connects administrators, lecturers, mentors, and students under a single web application. It supports PDF-based study material, AI-generated and manual quizzes, tutorial session scheduling, peer study groups, direct messaging, and rich analytics — all wrapped in a dark glassmorphism UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4.18 |
| Templating | EJS 3.1 |
| Database | PostgreSQL (via Supabase) |
| ORM / Query | `pg` (raw SQL with parameterised queries) |
| Auth | JWT (httpOnly cookies) + bcrypt |
| File Storage | Supabase Storage |
| AI | Google Gemini 2.5 Flash Lite (`@google/generative-ai`) |
| PDF Parsing | `pdf-parse` |
| Email | Nodemailer |
| File Uploads | Multer |
| Charts | Chart.js 4.4.0 (CDN) |
| Styling | Tailwind CSS (CDN) + custom dark glassmorphism CSS |
| Validation | `express-validator` |
| Sessions | `express-session` (flash messages only) |

---

## User Roles

| Role | Description |
|---|---|
| `admin` | Full system control — manages users, modules, and enrolments |
| `lecturer` | Teaches modules — uploads content, creates quizzes, records test marks, views analytics |
| `mentor` | Tutors students — uploads notes, runs sessions, tracks attendance |
| `student` | Learner — enrols in modules, takes quizzes, RSVPs to sessions, tracks progress |

---

## Features

### Authentication

- Register with name, email, and password (bcrypt hashed)
- Login issues a signed JWT stored as an httpOnly cookie
- Role-based redirect on login (`/admin/dashboard`, `/lecturer/dashboard`, etc.)
- Forgot password — sends a time-limited reset link via email
- Reset password — validates token and updates password hash
- All routes are protected by role middleware; unauthenticated requests redirect to `/login`
- Profile picture upload (stored in Supabase Storage)

---

### Admin

Accessed at `/admin/*`

| Feature | Details |
|---|---|
| **Dashboard** | Platform-wide stats: total users by role, total modules, total enrolments, recent activity |
| **User Management** | Create, edit, soft-delete users of any role; search and filter user list |
| **Module Management** | Create, edit, soft-delete modules; set module code, name, description, and colour tag |
| **Staff Assignment** | Assign lecturers and mentors to modules |
| **Enrolment Management** | Enrol or remove students from any module; view full enrolment list |
| **Analytics** | Platform-wide quiz attempt counts, score averages, most active students |
| **Profile** | Update own name, email, bio, and profile picture |

---

### Lecturer

Accessed at `/lecturer/*`

| Feature | Details |
|---|---|
| **Dashboard** | Cards for each assigned module with student count and PDF count |
| **Module View** | Full module page: PDFs, announcements, module chat, manual quizzes, class tests |
| **PDF Upload** | Upload PDF study notes with topic name; stored in Supabase Storage |
| **PDF Edit / Delete** | Rename topic, replace file, or soft-delete any uploaded PDF |
| **Announcements** | Create announcements per module (with optional pin); delete announcements |
| **Manual Quizzes** | Create multiple-choice quizzes; add questions with 4 options and a correct answer |
| **Class Tests** | Link a class test to a PDF note; set title, total marks, and test date |
| **Mark Recording** | Enter marks obtained per enrolled student for any class test |
| **Analytics Overview** | Cross-module dashboard: total students, total attempts, avg score, per-module breakdown with progress bars and Details links |
| **Per-Module Analytics** | 6 summary stat cards; Avg Score by Topic bar chart; Score Distribution doughnut (Mastered / Proficient / Getting There / Needs Work); Topic Breakdown table (attempts, avg, min, max); Top 5 Students leaderboard; Recent 20 quiz attempts |
| **PDF Analytics** | Per-PDF view stats — how many students have generated a quiz from each note |
| **Module Chat** | Post messages visible to all enrolled students and staff |
| **Profile** | Update name, email, bio, profile picture |

---

### Mentor / Tutor

Accessed at `/mentor/*`

| Feature | Details |
|---|---|
| **Dashboard** | Assigned modules, upcoming sessions (next 5), total sessions hosted, average rating |
| **Tutorial Notes** | Upload PDF notes tagged as tutor notes; filter by module; delete own notes |
| **Session Management** | Create, edit, and delete tutorial sessions (topic, date/time, capacity, location/link) |
| **RSVP Viewer** | See which students have RSVPd to each session |
| **Attendance Marking** | Mark individual students as attended for past sessions |
| **Module Analytics** | 4 quiz stat cards (enrolled students, attempts, avg score, avg rating); 4 session stat cards (sessions hosted, total RSVPs, total attended, attendance rate); Recent Sessions table; Avg Quiz Score by Topic chart; Topic Breakdown table |
| **Module Chat** | Post messages in any assigned module |
| **Profile** | Update name, email, bio, profile picture |

---

### Student

Accessed at `/student/*`

| Feature | Details |
|---|---|
| **Dashboard** | Enrolled modules, 5 most recent quiz scores, topics mastered count, overall average |
| **Module Browser** | Browse all active modules; self-enrol or unenrol |
| **Module View** | PDFs, pinned/recent announcements, module chat, manual quizzes, class test results |
| **AI Quiz Generation** | Select any PDF note, choose 5 / 10 / 20 questions, and Gemini 2.5 Flash Lite generates a multiple-choice quiz instantly |
| **AI Quiz Submission** | Submit answers and see score, correct answers, and per-question breakdown; score saved automatically |
| **Manual Quizzes** | Take lecturer-created multiple-choice quizzes; results saved |
| **Adaptive Quizzes** | AI-driven quiz that targets weakest topics based on past performance |
| **Class Test Results** | View own marks and percentage for any class test in enrolled modules |
| **Progress Tracker** | Per-topic averages with trend arrows; 30-day score trend chart; total quizzes taken; overall average; activity streak (consecutive active days); class test summary |
| **Tutors** | Browse mentors assigned to enrolled modules; see rating, bio, and shared modules |
| **Tutor Profile** | Full mentor profile with uploaded notes, upcoming sessions, and student ratings; RSVP from the profile |
| **Rate Tutors** | Submit a star rating (1–5) with optional written review; edit or delete own ratings |
| **Tutorial Sessions** | Browse upcoming sessions for enrolled modules; RSVP and cancel; mark own attendance |
| **Peer Study Sessions** | Create or join peer study groups per module; leave or cancel sessions |

---

### Social & Notifications

Available to students at `/social/*`

| Feature | Details |
|---|---|
| **Friend System** | Send, accept, and reject friend requests; view pending and accepted friends |
| **Block / Unblock** | Block another student; blocked users cannot send messages or friend requests |
| **Direct Messaging** | Real-time-style chat with accepted friends; conversation list with long-poll for new messages |
| **In-App Notifications** | Notifications for friend requests, messages, and other events; unread count badge in the navbar |

---

## Database Schema

The database uses three migration files applied in order:

### `001_initial.sql` — Core Tables

| Table | Purpose |
|---|---|
| `user` | All users (admin / lecturer / mentor / student) |
| `module` | Academic modules with code, name, description, colour, soft-delete |
| `user_module` | Staff (lecturers, mentors) assigned to modules |
| `student_enrollment` | Students enrolled in modules |
| `pdf_note` | Uploaded PDFs linked to a module; `is_tutor_note` flag for mentor notes |
| `announcement` | Lecturer announcements per module with optional pin |
| `module_message` | Chat messages per module |
| `ai_quiz_attempt` | Records of AI quiz sessions: student, module, topic, score, timestamp |
| `weak_topic` | Running average per student per topic — drives the adaptive quiz |
| `manual_quiz` | Lecturer-created quizzes linked to a module |
| `manual_quiz_question` | Individual questions (4 options, 1 correct answer) |
| `manual_quiz_attempt` | Student attempts at manual quizzes with score |
| `adaptive_quiz_attempt` | Student attempts at adaptive quizzes with score |
| `tutorial_session` | Mentor-created sessions with topic, datetime, capacity, and location/link |
| `session_rsvp` | Student RSVPs with status (rsvpd / cancelled) and attendance flag |
| `tutor_rating` | Student ratings of mentors (1–5 stars, optional review) |

### `002_social_features.sql` — Social Layer

| Table | Purpose |
|---|---|
| `friendship` | Friend relationships with status (pending / accepted / rejected / blocked) |
| `direct_message` | Messages between two users with `read_at` timestamp |
| `peer_session` | Student-created study groups per module with capacity |
| `peer_session_participant` | Students who have joined a peer session |
| `in_app_notification` | In-app notifications with `dedup_key` (partial unique index) to prevent duplicate alerts |

### `003_class_tests.sql` — Class Tests

| Table | Purpose |
|---|---|
| `class_test` | Tests created by a lecturer, linked to a module and a PDF note |
| `class_test_mark` | Individual student marks per test (unique per student per test) |

---

## Project Structure

```
student-sphere/
├── app.js                        # Express app entry point
├── package.json
├── apply-migration.js            # Helper to run 001_initial.sql
├── migrations/
│   ├── 001_initial.sql
│   ├── 002_social_features.sql
│   └── 003_class_tests.sql
├── src/
│   ├── config/
│   │   ├── database.js           # pg Pool setup
│   │   └── supabase.js           # Supabase client
│   ├── helpers/
│   │   ├── gemini.js             # AI quiz + adaptive quiz generation
│   │   ├── mailer.js             # Nodemailer password reset
│   │   ├── notifications.js      # In-app notification helper
│   │   ├── pdfExtract.js         # PDF text extraction
│   │   └── storage.js            # Supabase Storage upload/delete
│   ├── middleware/
│   │   ├── auth.js               # JWT verify, requireRole, signAndSetCookie
│   │   └── upload.js             # Multer config
│   └── routes/
│       ├── admin.js
│       ├── auth.js
│       ├── lecturer.js
│       ├── mentor.js
│       ├── peerSessions.js
│       ├── social.js
│       └── student.js
├── views/
│   ├── partials/                 # head, navbar, flash, footer
│   ├── auth/                     # login, register, forgot-password, reset-password
│   ├── admin/                    # dashboard, users, user-edit, user-modules, modules, enrollments, analytics
│   ├── lecturer/                 # dashboard, module, create-announcement, create-quiz, edit-pdf, analytics, analytics-overview
│   ├── mentor/                   # dashboard, analytics, my-notes, sessions, session-rsvps
│   ├── student/                  # dashboard, modules, module, quiz, quiz-result, manual-quiz, adaptive-quiz, progress, tutors, tutor-profile, sessions
│   ├── shared/
│   │   └── profile.ejs
│   └── errors/
│       ├── 404.ejs
│       └── 500.ejs
└── public/
    └── js/
        └── main.js
```

---

## Setup & Installation

### Prerequisites

- Node.js 18 or later
- A [Supabase](https://supabase.com) project with PostgreSQL and a Storage bucket
- A [Google AI Studio](https://ai.google.dev/) API key for Gemini
- An SMTP email account for password reset emails

### Steps

1. **Clone the repository and install dependencies**

   ```bash
   git clone <repo-url>
   cd "Student Sphere"
   npm install
   ```

2. **Create a `.env` file** — see [Environment Variables](#environment-variables) below

3. **Apply database migrations**

   ```bash
   node apply-migration.js
   ```

   Then apply migrations 002 and 003:

   ```bash
   node -e "require('dotenv').config(); const {Pool}=require('pg'); const fs=require('fs'); const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); pool.query(fs.readFileSync('./migrations/002_social_features.sql','utf8')).then(()=>{console.log('002 done');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"

   node -e "require('dotenv').config(); const {Pool}=require('pg'); const fs=require('fs'); const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); pool.query(fs.readFileSync('./migrations/003_class_tests.sql','utf8')).then(()=>{console.log('003 done');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
   ```

4. **Create the first admin account**

   Generate a password hash:

   ```bash
   node -e "require('bcrypt').hash('yourpassword', 10).then(console.log)"
   ```

   Then insert the admin via Supabase SQL editor or `psql`:

   ```sql
   INSERT INTO "user" (name, email, password_hash, role)
   VALUES ('Admin Name', 'admin@example.com', '<hash>', 'admin');
   ```

5. **Start the app** — see [Running the App](#running-the-app)

---

## Environment Variables

Create a `.env` file in the project root:

```env
# PostgreSQL — from Supabase > Project Settings > Database > Connection string
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

# Security
SESSION_SECRET=replace-with-a-long-random-string
JWT_SECRET=replace-with-a-different-long-random-string

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
SUPABASE_BUCKET=your-storage-bucket-name

# Email (Nodemailer) — Gmail example
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password

# Optional
NODE_ENV=development
PORT=3000
```

---

## Running the App

**Development** (auto-restart on changes, requires `nodemon`):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

Open `http://localhost:3000` in a browser. You will be redirected to `/login`.

---

## Migrations

All migration files use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so they are safe to re-run without error. Run them in order (001 → 002 → 003). Foreign keys cascade on delete — removing a user or module automatically cleans up all related data.

| File | Tables Added |
|---|---|
| `001_initial.sql` | user, module, user_module, student_enrollment, pdf_note, announcement, module_message, ai_quiz_attempt, weak_topic, manual_quiz, manual_quiz_question, manual_quiz_attempt, adaptive_quiz_attempt, tutorial_session, session_rsvp, tutor_rating |
| `002_social_features.sql` | friendship, direct_message, peer_session, peer_session_participant, in_app_notification |
| `003_class_tests.sql` | class_test, class_test_mark |