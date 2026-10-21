# InternHub — Complete Platform Usage & Operations Guide

Welcome to **InternHub**, an enterprise project management, sprint execution, performance analytics, and time-tracking platform built for engineering teams, cohort internships, and tech organizations.

This guide provides clear, step-by-step instructions for **Interns**, **Tech Leads**, and **Managers** on how to navigate and operate every feature in the platform.

---

## 📑 Table of Contents

1. [Quick Start & Navigation](#1-quick-start--navigation)
2. [Daily Routine for Interns](#2-daily-routine-for-interns)
3. [Project Workspace & Jira-Style Management](#3-project-workspace--jira-style-management)
   - [Project Overview](#project-overview)
   - [Roadmap & Gantt View](#roadmap--gantt-view)
   - [Backlog & Sprint Planning](#backlog--sprint-planning)
   - [Sprint Workspace (Active Sprint Board)](#sprint-workspace-active-sprint-board)
   - [Scrum Board](#scrum-board)
   - [Action Items & Minutes of Meeting (MoM)](#action-items--minutes-of-meeting-mom)
   - [Work Item Hierarchy (Epics, Stories, Tasks, Bugs, Subtasks)](#work-item-hierarchy)
4. [Time Tracking & Timesheet Guide](#4-time-tracking--timesheet-guide)
   - [Using the Live Timer](#using-the-live-timer)
   - [Quick-Starting a Timer on a Specific Task](#quick-starting-a-timer-on-a-specific-task)
   - [Editing Previously Logged Time](#editing-previously-logged-time)
   - [Timesheet Views (Week, Month, 5-Day vs 7-Day)](#timesheet-views)
5. [Performance Analytics & Reports](#5-performance-analytics--reports)
   - [Personal Analytics vs. Project Dashboard](#personal-analytics-vs-project-dashboard)
   - [Filtering by Project](#filtering-by-project)
   - [Understanding Your Metrics](#understanding-your-metrics)
6. [Team Collaboration & Communication](#6-team-collaboration--communication)
   - [Teams & Discussion Channels](#teams--discussion-channels)
   - [Forms & Evaluations](#forms--evaluations)
   - [Notifications & Requests](#notifications--requests)
7. [Tech Lead & Manager Administration](#7-tech-lead--manager-administration)
   - [Adding and Removing Project Members](#adding-and-removing-project-members)
   - [Creating & Managing Sprints](#creating--managing-sprints)
   - [Reviewing & Approving Due Date Extensions](#reviewing--approving-due-date-extensions)
   - [Reviewing Intern Timesheets](#reviewing-intern-timesheets)
8. [Frequently Asked Questions & Troubleshooting](#8-frequently-asked-questions--troubleshooting)

---

## 1. Quick Start & Navigation

### How to Sign In
1. Navigate to `/login`.
2. Click **Organization Portal** (Root Portal is reserved strictly for platform Super Administrators).
3. Search or select your organization (e.g., *Dailoqa Solutions*).
4. Enter your **User Code** (e.g. `INT-1024`) or your corporate email.
5. Enter your password. (First-time users must reset their temporary password to a secure permanent password).

### Main Sidebar Navigation
* **Dashboard**: High-level personal summary, attendance punch card, and recent assignments.
* **Projects**: Project workspaces, roadmaps, backlogs, active sprints, scrum boards, and meeting notes.
* **My Tasks**: Personal Kanban board showing work items specifically assigned to you.
* **Timesheets**: Time tracking, live running stopwatch, daily breakdown, and entry editor.
* **Reports / Analytics**: Delivery velocity, sprint completion rate, and project-by-project performance.
* **Teams**: Chat channels, announcements, and direct messaging with teammates.
* **Forms**: Assigned evaluation surveys, check-ins, and feedback forms.

---

## 2. Daily Routine for Interns

Follow this straightforward routine every working day:

```
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│       1. Track Task Time        │      │    2. Update Tasks & Wrap Up    │
│    Timesheets / Sprint Board    │ ───► │      Move to In Review / Done   │
│    Click "Start Timer" or (▶)   │      │      Check off deliverables     │
└─────────────────────────────────┘      └─────────────────────────────────┘
```

1. **Track Task Hours**:
   - Go to **Timesheets** or your **Active Sprint Board**.
   - Click **Start Timer** at the top or click the **Play (▶)** button next to the task you are working on.
   - When switching tasks or stepping away, click **Stop Timer (⏹)** to log the exact time spent.
2. **Evening Wrap-Up**:
   - Before ending your day, update the status of your tasks on the **Scrum Board** (e.g., drag from `IN_PROGRESS` to `IN_REVIEW` or `COMPLETED`).
   - Double-check your daily timesheet to ensure all hours worked are logged accurately.
   - *Note*: An automatic session closeout occurs at **6:15 PM IST** to prevent runaway timers.
   - *(Note on Attendance: Automated morning clock-in and punch-card tracking are scheduled for the V2 attendance module; current attendance is tracked via logged task timesheet hours).*

---

## 3. Project Workspace & Jira-Style Management

To open a project, click **Projects** in the sidebar, then select your assigned project card.

Inside the project workspace, you will find 6 tabs:

### 1. Project Overview
- Displays project health, milestones, active members, and overall project task distribution.
- **Task Analytics**: Shows total project-wide distribution across `To Do`, `In Progress`, `In Review`, and `Completed` (this reflects the whole project team's output).

### 2. Roadmap & Gantt View
- Visual timeline displaying **Epics** and their expected schedules.
- Great for understanding upcoming deadlines, dependencies, and quarterly goals.

### 3. Backlog & Sprint Planning
- **Creating Work Items**: Click `+ Create Issue` to add a new Epic, Story, Task, or Bug.
- **Assigning to Sprints**:
  - Drag work items from the **Backlog** section into an open sprint (e.g., *Sprint 01*).
  - Or click the work item, open the detail drawer, and select the target Sprint from the dropdown.
- **Starting a Sprint** (Tech Leads & Managers):
  - Once sprint goals and story point estimates are filled, click **Start Sprint**.
  - Enter the sprint name, start date, end date, and sprint goal.

### 4. Sprint Workspace (Active Sprint Board)
- The active sprint board displays cards organized into 4 status columns:
  $$\text{To Do} \longrightarrow \text{In Progress} \longrightarrow \text{In Review} \longrightarrow \text{Done}$$
- **Drag and Drop**: Simply drag any task card to move it into another status.
- **Filter by Assignee**: Click your avatar at the top of the board to instantly see only tasks assigned to you.
- **Quick Timer**: Hover over any card and click the play button to start tracking time on it immediately.

### 5. Scrum Board
- Provides a comprehensive, bird's-eye Kanban view of all active work items across the entire project, regardless of whether they belong to the current sprint or future iterations.

### 6. Action Items & Minutes of Meeting (MoM)
- Document meeting discussions, decisions, and action items.
- Convert any action item directly into a tracked project task with an assigned owner and due date.

### Work Item Hierarchy
InternHub structures work in three levels:
1. **Epic** (Purple label): Large high-level features or modules (e.g., *User Authentication Module*).
2. **Story / Task / Bug** (Blue/Green/Red label): Deliverables assigned to an individual (e.g., *Implement OAuth Google Sign-in*).
3. **Subtask**: Smaller granular checklists under a parent task (e.g., *Write unit test for callback token*).

---

## 4. Time Tracking & Timesheet Guide

The **Timesheets** page provides an accurate record of your work hours and productivity.

### Using the Live Timer
1. Open **Timesheets** from the sidebar.
2. In the top-right header, click the purple **Start Timer** button.
3. In the timer popup:
   - Select the **Task** you are working on.
   - Enter a brief description (e.g., *Fixing responsive navbar CSS*).
   - Click **Start**.
4. A live timer banner appears at the top of the screen showing elapsed hours, minutes, and seconds (`HH:MM:SS`).
5. When finished, click **Stop Timer**. The hours are automatically calculated and added to today's timesheet.

### Quick-Starting a Timer on a Specific Task
- Look at the timesheet task rows.
- Each row has a small **Play (▶)** button on the right side.
- Clicking that play button immediately launches the live timer pre-filled with that specific task.

### Editing Previously Logged Time
If you made a mistake or forgot to stop a timer:
1. Locate the entry under the appropriate day in the timesheet table.
2. Click the small **Pencil (Edit)** icon next to the logged duration.
3. In the inline editor or modal:
   - Adjust the **Duration (hours or minutes)**.
   - Update the notes or work description.
4. Click **Save**.
5. The daily, weekly, and monthly totals will recalculate instantly.
> *Note: Interns may only edit their own entries. Once a timesheet period has been formally approved by a Manager, it is locked against further edits.*

### Timesheet Views
- **Week vs. Month**: Toggle between the 7-day weekly grid and the full-month summary.
- **Mon–Fri vs. 7 Days**: Click the days toggle button to hide weekends or view the entire full week.
- **Navigation**: Use the `<` and `>` arrows to inspect past weeks or months, or click `Today` to jump back to the current date.

---

## 5. Performance Analytics & Reports

InternHub separates project-wide metrics from individual performance to give both managers and interns the right context.

### Personal Analytics vs. Project Dashboard
- **Project Dashboard (Projects -> Overview)**: Shows overall project delivery metrics, total completed vs total backlog items across all teammates.
- **Analytics Page (Sidebar -> Reports / Analytics)**: Focuses on **your personal contributions**, including your individual completion rate, story points delivered, overdue tasks, and work session hours.

### Filtering by Project
On the **Reports / Analytics** page:
1. Locate the **Project Selector** dropdown at the top.
2. Choose:
   - **All Projects (All Performance)**: Summarizes your collective output across every team you belong to.
   - **Specific Project (e.g. Platform Core)**: Focuses strictly on your deliverables, velocity, and story points within that selected project.

### Understanding Your Metrics
- **Completion Rate (%)**: Percentage of assigned tasks moved to `Done` before the deadline.
- **Story Points Delivered**: Total story points completed out of the points committed during sprint planning.
- **Overdue Task Count**: Tasks past their assigned due date that have not yet been marked completed.
- **Task Extension Requests**: If you anticipate that a task cannot be finished on time, open the task detail drawer and submit a **Due Date Extension Request** with your reason so your Tech Lead can approve it.

---

## 6. Team Collaboration & Communication

### Teams & Channels
- Click **Teams** in the sidebar to chat with your team.
- **General Channel**: Company-wide and cohort-wide announcements.
- **Project Channels**: Focused technical discussions for each project.
- Share links, code snippets, and updates without needing external chat applications.

### Forms & Evaluations
- Click **Forms** in the sidebar.
- Complete weekly self-evaluations, feedback forms, and sprint retro questionnaires assigned by your manager.
- Once submitted, responses are compiled for manager review.

### Notifications
- The **Bell** icon in the top navigation notifies you when:
  - You are assigned a new task or added to a sprint.
  - A Tech Lead or Manager reviews your extension request.
  - A teammate mentions you in a task comment.
- Click **Clear All** or click individual notifications to mark them as read.

---

## 7. Tech Lead & Manager Administration

### Adding and Removing Project Members
Tech Leads and Managers can adjust project membership:
1. Open the project and navigate to the **Overview** tab.
2. In the **Project Members** card:
   - **To Add a Member**: Click **+ Add Member**, select a user from the organization directory dropdown, choose their role (`Member` or `Tech Lead`), and click **Add**.
   - **To Remove a Member**: Click the red **Remove (Trash)** icon next to the member's name and confirm.

### Creating & Managing Sprints
1. In the **Backlog** tab, click **Create Sprint**.
2. Drag prioritized stories from the Backlog into the new sprint container.
3. Review total story points to ensure the team is not overcommitted.
4. Click **Start Sprint**, define the sprint dates (typically 1 to 2 weeks), and confirm.
5. When the sprint end date is reached, click **Complete Sprint** to generate sprint analytics and rollover unfinished tasks.

### Reviewing & Approving Due Date Extensions
1. When an intern requests an extension, an alert appears in your notifications and project dashboard.
2. Review the intern's justification notes and proposed new date.
3. Click **Approve** to update the task deadline or **Reject** with feedback.

### Reviewing Intern Timesheets
1. Managers can navigate to the **Timesheets Review** tab.
2. Inspect individual and team-wide logged hours by week or month.
3. Check for discrepancies, unassigned work sessions, or excessive overtime.

---

## 8. Frequently Asked Questions & Troubleshooting

#### Q: Why can't I see a sprint in the Backlog page?
> Ensure you have selected a project first. If the sprint has not been created yet, a Tech Lead or Manager can click **Create Sprint** at the top of the Backlog.

#### Q: Why is my task analytics showing zero on the Analytics page?
> Check the project dropdown at the top of the Analytics page. If you are filtered to a project where you do not have assigned tasks, switch the dropdown to **All Projects (All Performance)**.

#### Q: How do I recover if I forgot to stop my timer?
> Do not worry. The platform automatically caps daily timers at 6:15 PM IST. You can simply go to **Timesheets**, click the **Pencil (Edit)** icon on that day's entry, and adjust the duration to the actual hours worked.

#### Q: Why can't I remove or add a member to a project?
> Only users with **Tech Lead** role in that project or **Manager** / **Admin** roles in the organization have permission to modify project rosters. Interns cannot add or remove members.

#### Q: How do I report a blocker on my task?
> Open your task on the **Scrum Board** or **My Tasks**, change the status or tag to **Blocked**, and leave a comment explaining what dependency is preventing progress. Notify your Tech Lead in your team channel.

---

*InternHub Documentation • For technical support or platform questions, contact your team Manager or platform administrator.*
