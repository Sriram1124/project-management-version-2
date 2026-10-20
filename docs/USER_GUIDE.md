# InternHub — Platform Usage & Operations Guide

Welcome to **InternHub**, a multi-tenant project management, performance analytics, and governance platform tailored for cohort-based engineering internships and team operations.

---

## 📑 Table of Contents
1. [Architecture & Portals](#1-architecture--portals)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Authentication & Onboarding Flow](#3-authentication--onboarding-flow)
4. [Manager Portal Workflows](#4-manager-portal-workflows)
   - [Cohort Management](#cohort-management)
   - [Member Provisioning & Bulk Import](#member-provisioning--bulk-import)
   - [Projects, Epics & Tasks](#projects-epics--tasks)
   - [Sprint Planning & Task Assignment](#sprint-planning--task-assignment)
   - [Timesheet Monitoring](#timesheet-monitoring)
   - [Performance & Cohort Analytics](#performance--cohort-analytics)
5. [Intern & Tech Lead Workflows](#5-intern--tech-lead-workflows)
   - [Clock-In / Clock-Out & Attendance](#clock-in--clock-out--attendance)
   - [My Tasks & Kanban Board](#my-tasks--kanban-board)
   - [Task Extension Requests](#task-extension-requests)
   - [Individual Performance Reports](#individual-performance-reports)
6. [Super Admin Portal Workflows](#6-super-admin-portal-workflows)
7. [Operational Best Practices & Security](#7-operational-best-practices--security)

---

## 1. Architecture & Portals

The application features a strict dual-portal architecture accessible from the unified `/login` page:

```
                    ┌────────────────────────┐
                    │      /login Page       │
                    └───────────┬────────────┘
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
      [Root Portal]                    [Organization Portal]
   (Super Admins Only)               (Managers, Tech Leads, Interns)
               │                                 │
               ▼                                 ▼
    Super Admin Dashboard             Tenant Organization Selector
                                                 │
                                                 ▼
                                        Role-Based Dashboard
                               (Manager View / Intern View / Tech Lead)
```

---

## 2. User Roles & Permissions

| Role | Target Portal | Primary Responsibilities |
| :--- | :--- | :--- |
| **SUPER_ADMIN** | Root Portal | Cross-tenant platform oversight, organization onboarding, tenant suspension/activation, global manager credential resets. |
| **MANAGER** | Org Portal | Cohort creation, member onboarding (CSV/manual), project creation, sprint scheduling, timesheet verification, password resets. |
| **TECH_LEAD** | Org Portal | Scoped project lead, task breakdown, code/work item review, deadline extension request approval/rejection. |
| **INTERN** | Org Portal | Task execution (Kanban/Roadmap), daily clock-in/out attendance, timesheet logging, extension requests, personal performance reports. |

---

## 3. Authentication & Onboarding Flow

### First-Time Login (Interns & Managers)
1. **Navigate to `/login`**.
2. Click **"Organization Portal"** (do **not** select "Root Portal" unless you are a platform Super Admin).
3. Search or select your organization (e.g., **Dailoqa Solutions**).
4. Enter your **User Code** (e.g., `INT-7757`) or **Email address**.
5. Enter the **Temporary Password** provided by your manager or provisioning receipt.
6. **Mandatory Password Reset**:
   * First-time users are automatically routed to the password change screen.
   * Enter a permanent, secure password (minimum 8 characters).
   * Once set, you are automatically routed to your respective dashboard.

---

## 4. Manager Portal Workflows

### Cohort Management
* **Location**: Dashboard Header Dropdown $\rightarrow$ Cohort Switcher.
* Managers can toggle between cohorts (e.g., *Cohort 1*, *Cohort 2*).
* All member lists, analytics, deadlines, and project data automatically scope to the selected cohort.

### Member Provisioning & Bulk Import
* **Location**: **Interns** tab in the sidebar.
* **Single Add**: Click `+ Add New` $\rightarrow$ Enter name, email, cohort, batch, and sub-batch.
* **Bulk Import via CSV**:
  1. Click `Bulk Import CSV`.
  2. Download the provided template (`members_import_template.csv`).
  3. Upload the populated CSV containing columns: `name`, `email`, `type` (`INTERN` or `EMPLOYEE`), `batch`, `subbatch`.
  4. The system validates uniqueness, generates unique User Codes (`INT-XXXX`), creates temporary passwords hashed with Argon2, and prompts for credential export download.
* **Password Resets**:
  * If an intern loses access, click the purple **Reset** icon on their row in the table.
  * A modal displays a new random temporary password to share securely with the intern.

### Projects, Epics & Tasks
* **Location**: **Projects** tab.
* **Project Structure**:
  * **Projects**: Top-level initiative (e.g., *Platform Core*, *Mobile App*).
  * **Epics**: Large feature groups within a project.
  * **Tasks / Deliverables**: Individual assignable work items containing story points, due dates, priority, and assignees.
* **Assigning Project Members & Roles**:
  * In the project settings, assign members and promote eligible members to **Tech Lead**.

### Sprint Planning & Task Assignment
* **Location**: Project Workspace $\rightarrow$ **Sprints** or **Kanban**.
* Create 1-week or 2-week sprint cycles.
* Drag and drop tasks from the Backlog into active sprints.
* Set story point estimates (Fibonacci scale: 1, 2, 3, 5, 8, 13) to measure velocity.

### Timesheet Monitoring
* **Location**: **Timesheets** tab.
* Review daily work sessions logged by interns.
* Daily automated cutoff rule: Automatic session closeout occurs at **6:15 PM IST** to prevent overnight runaway timers.

### Performance & Cohort Analytics
* **Location**: **Reports** tab.
* View aggregate completion rates, overdue rates, story points velocity, and individual delivery risk profiles.

---

## 5. Intern & Tech Lead Workflows

### Clock-In / Clock-Out & Attendance
* **Location**: Top Navigation Bar / Attendance Widget.
* Interns must click **Clock In** at the start of their working shift.
* Interns can log breaks and add shift notes.
* Click **Clock Out** at the end of the shift. Time is automatically synchronized to your weekly timesheet.

### My Tasks & Kanban Board
* **Location**: **My Tasks** and **Projects** tabs.
* View tasks assigned to you across all projects.
* Move task cards across columns:
  $$\text{TODO} \longrightarrow \text{IN\_PROGRESS} \longrightarrow \text{IN\_REVIEW} \longrightarrow \text{COMPLETED}$$
* If blocked by external dependencies or blockers, toggle status to **BLOCKED** and describe the obstacle in comments.

### Task Extension Requests
* If an assigned deadline cannot be met due to blockers or complexity:
  1. Open the Task detail drawer.
  2. Click **Request Due Date Extension**.
  3. Select the proposed new due date and write a clear justification note.
  4. Tech Leads and Managers receive an instant notification to **Approve** or **Reject** the extension.

### Individual Performance Reports
* **Location**: **Reports** tab.
* View your individual delivery metrics:
  * On-Time Completion Rate (%)
  * Story Points Delivered vs. Committed
  * Overdue Task Count & Scheduled Progress
  * Active Work Session Breakdown

---

## 6. Super Admin Portal Workflows

* **Location**: Log in via **Root Portal** using root credentials.
* **Capabilities**:
  * **Organization Directory**: Provision new tenant organizations (universities, enterprise teams, incubator cohorts).
  * **Tenant Management**: Suspend or reactivate organizations on demand.
  * **Manager Provisioning**: Create and reset master manager accounts for any tenant organization.
  * **Global Audit Logs**: Immutable trail of platform-wide administrative actions.

---

## 7. Operational Best Practices & Security

1. **Temporary Password Rotation**: Temporary passwords are one-time credentials. Users must complete permanent password setup before platform access is granted.
2. **Session Security**: Resetting a user's password immediately purges all active session tokens and refresh tokens in `user_sessions`.
3. **Environment Isolation**:
   * Frontend: Configured via `VITE_API_URL` pointing to the deployed backend domain.
   * Backend: Configured with pooled Supabase connection strings (`port 6543`, `pgbouncer=true`, `connection_limit=3`).
4. **Credential Handling**: Never commit CSV files or credential exports to Git. Ensure `credentials_exports/` remains in `.gitignore`.

