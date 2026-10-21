import {
  ProjectMethodology,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
} from '@prisma/client';

export const PROJECTS_SPEC_PART4: any[] = [
  // =========================================================================
  // PROJECT 9: Cross Project Code Review (CP-REVIEW) - KANBAN
  // =========================================================================
  {
    name: 'Cross Project Code Review',
    code: 'CP-REVIEW',
    description:
      'Continuous automated cross-project code quality review, static AST analysis, security vulnerability scanning, and peer review triage board.',
    methodology: ProjectMethodology.KANBAN,
    members: [
      { email: 'saloni.rana@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'khushi.bainsla@dailoqa.com', role: 'DEVELOPER' },
      { email: 'yash.tanwar@dailoqa.com', role: 'DEVELOPER' },
      { email: 'tanmay.garg@dailoqa.com', role: 'DEVELOPER' },
      { email: 'nitin.aman@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Multi-Repo Ingestion & Webhooks',
        desc: 'GitHub/GitLab PR webhooks, branch diff parsing, and AST tokenization.',
        stories: [
          {
            title: 'Webhook Event Listener & Diff Parsing',
            desc: 'Receive pull request opened/synchronized payloads and extract unified git diffs.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build GitHub PR webhook signature validation endpoint',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Verify sha256 HMAC signature against configured organization webhook secret.',
                acceptance: ['Rejects unsigned or mismatched payloads with 401'],
              },
              {
                title: 'Git diff unified parser into file chunks with line offsets',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Parse + / - lines into structured object with old and new line numbers.',
                acceptance: ['Accurately handles renames and binary file modifications'],
              },
            ],
          },
          {
            title: 'Review Assignment & Reviewer Workload Balancer',
            desc: 'Assign peer reviewers based on domain expertise and active review queue counts.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Implement least-loaded reviewer assignment heuristic',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Select reviewer with lowest pending review count matching repo language.',
                acceptance: ['Distributes PRs evenly across team members'],
              },
            ],
          },
        ],
      },
      {
        title: 'Static Analysis & Security Scanning (SAST)',
        desc: 'AST security rules: SQL injection, hardcoded secrets, prototype pollution, OWASP Top 10.',
        stories: [
          {
            title: 'Security Pattern & Secret Scanner Rules Engine',
            desc: 'Scan code diffs for API keys, AWS secrets, and database connection strings.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.URGENT,
            tasks: [
              {
                title: 'Implement Shannon entropy calculation for high-entropy secret detection',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.URGENT,
                sp: 8,
                desc: 'Identify private keys and API tokens using Shannon entropy thresholds > 4.5.',
                acceptance: ['Catches AWS, JWT, and generic API secrets with < 2% false positives'],
                subtasks: [
                  { title: 'Benchmark scanner on 1,000 synthetic diff samples', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Performance benchmark' },
                ],
              },
              {
                title: 'False positive scanner crash on minified vendor bundle files',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'Parser runs out of stack memory on single-line 2MB minified JavaScript files.',
                acceptance: ['Ignore files matching *.min.js or vendor directories'],
              },
              {
                title: 'Automated PR inline comment decorator with fix recommendations',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_REVIEW,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Post targeted review comments on GitHub PR lines with suggested code replacements.',
                acceptance: ['Includes GitHub suggestion markdown block for 1-click commit'],
              },
            ],
          },
          {
            title: 'Code Review Continuous Flow Kanban Board',
            desc: 'Continuous triage board: QUEUED -> SCANNING -> REVIEW_IN_PROGRESS -> CHANGES_REQUESTED -> APPROVED.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build review SLA countdown card badge',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Show green (<4h), amber (4-8h), and red (>8h) review wait badges on cards.',
                acceptance: ['Updates dynamically without page refresh'],
              },
              {
                title: 'Overdue high-priority security scan review escalation',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Alert lead on PRs with unresolved critical security findings pending > 24 hours.',
                acceptance: ['Pings team Slack channel with PR link'],
              },
            ],
          },
        ],
      },
      {
        title: 'Technical Debt & Quality Telemetry',
        desc: 'Track repository health score, cyclomatic complexity trends, and reviewer participation.',
        stories: [
          {
            title: 'Repository Code Quality Health Scorecard',
            desc: 'Aggregate technical debt ratios, duplication percentages, and test coverage.',
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Compute unified repository technical debt index score (0-100)',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Weighted index based on open security bugs, complexity, and review latency.',
                acceptance: ['Scores updated nightly for all enrolled repositories'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 10: Fraud Detection System (BankShield) - KANBAN
  // =========================================================================
  {
    name: 'Fraud Detection System (BankShield)',
    code: 'BankShield',
    description:
      'Real-time financial fraud prevention, IP/device geolocation anomaly detection, velocity threshold rules, and suspicious activity reporting (SAR).',
    methodology: ProjectMethodology.KANBAN,
    members: [
      { email: 'aryan.sharma@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'jatin.malik@dailoqa.com', role: 'DEVELOPER' },
      { email: 'ansh.kukreti@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Transaction Stream Ingestion & Rules Engine',
        desc: 'High-throughput Kafka stream ingestion, sliding window aggregations, and rule evaluation.',
        stories: [
          {
            title: 'High-Throughput Ingestion & Velocity Tracking',
            desc: 'Track transaction velocity per card/account over 1-minute, 5-minute, and 1-hour windows.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement Redis sliding window counter for card swipe velocity',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Use Redis ZSET score as timestamp to count swipes in trailing 60 seconds.',
                acceptance: ['Evaluates in < 2ms under 5,000 transactions/second load'],
              },
              {
                title: 'Transaction payload JSON schema validator with Joi',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Validate mandatory amount, currency, merchant category, and card token fields.',
                acceptance: ['Rejects malformed events to dead letter queue'],
              },
            ],
          },
          {
            title: 'Geolocation Anomaly & Impossible Travel Detection',
            desc: 'Flag transactions occurring in distant cities within physically impossible travel times.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build Great Circle velocity calculator between consecutive IP coordinates',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Flag card if consecutive transactions imply travel speed > 800 km/h.',
                acceptance: ['Triggers auto-hold on account with REASON_IMPOSSIBLE_TRAVEL'],
              },
            ],
          },
        ],
      },
      {
        title: 'Fraud Analyst Case Management',
        desc: 'Continuous Kanban investigation board: SUSPICIOUS -> INVESTIGATING -> SAR_FILED -> BLOCKED -> CLEARED.',
        stories: [
          {
            title: 'Analyst Investigation Workbench & Evidence Viewer',
            desc: 'Consolidated view of account history, device fingerprint, IP proxy status, and velocity graph.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop interactive customer transaction timeline with risk score badges',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                desc: 'Chronological timeline showing approved vs flagged transactions with geolocation map.',
                acceptance: ['Interactive map pinpoints exact coordinates of each swipe'],
                subtasks: [
                  { title: 'Add unit tests for map pin clustering on repeated merchant locations', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Map testing' },
                ],
              },
              {
                title: 'One-click account freeze and card temporary lock action button',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_REVIEW,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                desc: 'Dispatch card freeze command to payment core processor via secure webhook.',
                acceptance: ['Returns confirmation with processor reference ID within 500ms'],
              },
              {
                title: 'Intermittent timeout in MaxMind GeoIP lookup causing false normal scores',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                desc: 'When GeoIP service experiences latency, rule defaults to score 0 instead of flagging unknown.',
                acceptance: ['Treat GeoIP timeout as high-risk UNKNOWN_LOCATION signal'],
              },
            ],
          },
          {
            title: 'Suspicious Activity Report (SAR) Compliance Filing',
            desc: 'Generate FinCEN/regulatory standard SAR XML filing documents.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build automated regulatory SAR narrative text compiler',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Compile structured investigation notes into standardized compliance regulatory text.',
                acceptance: ['Includes all mandatory transaction amounts and date stamps'],
              },
              {
                title: 'Overdue fraud case investigation review reminder',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'Compliance rule requires resolution of flagged cases within 72 hours of trigger.',
                acceptance: ['Blinks red indicator on board for cases > 48h old'],
              },
            ],
          },
        ],
      },
      {
        title: 'Rules Simulator & Backtesting',
        desc: 'Evaluate new fraud rules against 30 days of historical transactions before live activation.',
        stories: [
          {
            title: 'Historical Rule Backtesting Pipeline',
            desc: 'Simulate rule against past 1M transactions to evaluate false positive vs detection rate.',
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build backtesting simulation runner worker with progress bar',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Execute candidate rule against parquet historical transaction log.',
                acceptance: ['Reports false positive rate, precision, and recall'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 11: Resource Allocation & Management System (RAMS) - SCRUM
  // =========================================================================
  {
    name: 'Resource Allocation & Management System',
    code: 'RAMS',
    description:
      'Centralized employee skills inventory, project resource staffing, bench tracking, capacity forecasting, and utilization analytics.',
    methodology: ProjectMethodology.SCRUM,
    members: [
      { email: 'anshuman.mathur@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'sarthak.shah@dailoqa.com', role: 'DEVELOPER' },
      { email: 'mayank.j.malu@dailoqa.com', role: 'DEVELOPER' },
      { email: 'prince.kumar@dailoqa.com', role: 'DEVELOPER' },
      { email: 'ayush.rai@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Employee Profile & Master Skills Matrix',
        desc: 'Master skill taxonomy (Java, React, ML, DevOps) with 5-point proficiency levels.',
        stories: [
          {
            title: 'Skill Taxonomy & Bulk CSV Ingestion',
            desc: 'Import employee skills, certifications, and years of experience from CSV.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop CSV skills matrix bulk import parser with error reporting',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 0,
                desc: 'Validate employee codes and skill proficiency values (1-Beginner to 5-Expert).',
                acceptance: ['Returns line-by-line validation summary on import failure'],
              },
              {
                title: 'Interactive skill badge cloud component on employee profile',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 2,
                sprintIndex: 0,
                desc: 'Render visual skill tags with proficiency star ratings.',
                acceptance: ['Filterable by skill category (Backend, Frontend, Cloud)'],
              },
            ],
          },
          {
            title: 'Employee Availability & Allocation Calendar',
            desc: 'Calculate current allocation percentage (0% to 100%) across active projects.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build employee monthly allocation timeline calendar',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 0,
                desc: 'Gantt-style calendar illustrating active project commitments per engineer.',
                acceptance: ['Highlight over-allocated engineers (>100%) in bold red'],
              },
            ],
          },
        ],
      },
      {
        title: 'Project Staffing & Skill-Based Allocation',
        desc: 'Define project role requirements, find matching unassigned engineers, and assign staffing.',
        stories: [
          {
            title: 'Skill-Match Recommendation Engine',
            desc: 'Match open project staffing requests against bench engineers with highest skill overlap.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop skill matching score algorithm (cosine similarity on skill vector)',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 1,
                desc: 'Rank available engineers by fit score against required project skill matrix.',
                acceptance: ['Returns top 5 candidate matches ranked with match percentage'],
              },
              {
                title: 'Fix allocation collision when two PMs assign same engineer concurrently',
                type: WorkItemType.BUG,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                sprintIndex: 1,
                desc: 'Prevent total allocation exceeding 100% via database check constraint.',
                acceptance: ['Throws readable error when allocation exceeds 100%'],
              },
            ],
          },
          {
            title: 'Automatic Team Release on Project Closure',
            desc: 'When project status moves to COMPLETED, automatically release allocated headcount to bench.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build automated resource de-allocation trigger on project completion',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 1,
                desc: 'Reset project allocation to 0% and update employee bench counter.',
                acceptance: ['Updates bench days tracker starting next calendar day'],
              },
            ],
          },
        ],
      },
      {
        title: 'Bench Tracking & Utilization Analytics',
        desc: 'Track bench duration, departmental billable utilization, and upcoming roll-offs.',
        stories: [
          {
            title: 'Bench Days Tracker & Aging Alerts',
            desc: 'Calculate continuous bench days for unassigned employees and flag long-term bench risk.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement daily bench aging counter batch job',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 2,
                desc: 'Increment bench days for employees with 0% billable allocation.',
                acceptance: ['Categorizes into <30 days, 30-60 days, >60 days buckets'],
                subtasks: [
                  { title: 'Write tests for vacation leave days exclusion from bench counter', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Bench rule testing' },
                ],
              },
              {
                title: 'Departmental utilization rate summary report',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Graph percentage of billable vs non-billable hours by engineering practice.',
                acceptance: ['Exportable to CSV for leadership operations meetings'],
              },
              {
                title: 'Stale bench notification email dispatch queue blocker',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                sprintIndex: 2,
                desc: 'Redis queue connection drop halts automated bench warning emails.',
                acceptance: ['Implement resilient Redis retry connection with health check'],
              },
            ],
          },
          {
            title: 'Project Staffing Request & Approval Workflow',
            desc: 'PMs submit resource requests with required start dates for HR approval.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build staffing request submission modal and HR review queue',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Specify headcount, seniority level, and duration with approval action buttons.',
                acceptance: ['Dispatches notification to HR staffing manager'],
              },
            ],
          },
        ],
      },
      {
        title: 'Capacity Forecasting & Skill Gap Reports',
        desc: '6-month forward hiring demand forecasting based on pipeline projects.',
        stories: [
          {
            title: 'Skill Gap Telemetry & Hiring Projections',
            desc: 'Compare upcoming project requirements against available talent pool.',
            sprintIndex: 3,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Develop forward skill deficit calculator dashboard widget',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Highlight skills with projected negative supply in Q1 2027.',
                acceptance: ['Visual red alert cards for high-demand missing skills'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 12: Timesheet Management System (TMS-PMS) - KANBAN
  // =========================================================================
  {
    name: 'Timesheet Management System (To be integrated with Project Management)',
    code: 'TMS-PMS',
    description:
      'Continuous daily and weekly timesheet logging, real-time live stopwatch timers, timesheet approval gates, and in-sprint bug reporting integration.',
    methodology: ProjectMethodology.KANBAN,
    members: [
      { email: 'm.n.reddy@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'p.g.srihitha@dailoqa.com', role: 'DEVELOPER' },
      { email: 's.r.teja@dialoqa.com', role: 'DEVELOPER' },
      { email: 'sanka.m.srujan@dailoqa.com', role: 'DEVELOPER' },
      { email: 'm.v.somanadh@dailoqa.com', role: 'DEVELOPER' },
      { email: 'j.pramod@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Live Task Timers & Manual Time Entries',
        desc: 'Stopwatch timer widget, background session persistence, and manual entry retro-logging.',
        stories: [
          {
            title: 'Persistent Live Task Stopwatch Timer',
            desc: 'Start/pause/stop timer linked to active work item with browser tab synchronization.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build synchronized stopwatch state manager using BroadcastChannel API',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Keep running timer tick perfectly synchronized across multiple open browser tabs.',
                acceptance: ['Timer stays accurate even if tab is put in background throttle'],
              },
              {
                title: 'Auto-stop running timer after 8 hours of inactivity',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 2,
                desc: 'Prevent runaway 24h timers if employee forgets to stop before leaving office.',
                acceptance: ['Caps single session duration at 480 minutes with warning note'],
              },
            ],
          },
          {
            title: 'Manual Time Entry Submission & Validation',
            desc: 'Log historical hours against tasks with notes and duration checks.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Implement daily total hours cap validation (max 16h/day)',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Reject manual entry that pushes employee daily total beyond 16 hours.',
                acceptance: ['Throws 400 error with descriptive daily total message'],
              },
            ],
          },
        ],
      },
      {
        title: 'Weekly Timesheet Submissions & Approvals',
        desc: 'Weekly grid view, submit for manager approval, reject with feedback, and payroll freeze.',
        stories: [
          {
            title: 'Weekly Timesheet Matrix Grid View',
            desc: 'Spreadsheet-like grid showing Mon-Sun hours grouped by project and task.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop editable weekly timesheet matrix component with keyboard navigation',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                desc: 'Allow quick arrow key navigation and inline number editing across week days.',
                acceptance: ['Auto-sums daily and weekly totals dynamically'],
                subtasks: [
                  { title: 'Write tests for Sunday-to-Saturday vs Monday-to-Sunday week start settings', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Week start testing' },
                ],
              },
              {
                title: 'Manager batch timesheet approval review drawer',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Quickly inspect and approve submitted timesheets for entire team in one click.',
                acceptance: ['Displays warning if employee logged less than 40 hours in week'],
              },
              {
                title: 'Timesheet rejection note missing in notification email payload',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'When manager rejects timesheet with feedback, employee receives generic email.',
                acceptance: ['Include manager rejection comments in email template body'],
              },
            ],
          },
          {
            title: 'Overdue Timesheet Reminder & Escalation',
            desc: 'Automated Monday morning reminder for unsubmitted previous week timesheets.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build automated weekly timesheet submission audit cron job',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_REVIEW,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Detect missing timesheets every Monday at 10:00 AM and send reminder pings.',
                acceptance: ['Dispatches email and in-app bell notification'],
              },
              {
                title: 'Overdue timesheet lock prevention task',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'Resolve past-due timesheets before monthly payroll lock date.',
                acceptance: ['All pending approvals cleared before 25th of month'],
              },
            ],
          },
        ],
      },
      {
        title: 'Integrated In-Sprint Bug Tracking',
        desc: 'Report and link software bugs discovered during timesheet logged sessions.',
        stories: [
          {
            title: 'Bug Reporting Workflow & Lifecycle',
            desc: 'Continuous flow: REPORTED -> CONFIRMED -> IN_FIX -> VERIFIED -> CLOSED.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build in-sprint bug creation modal with environment & severity tagging',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Capture browser, OS, reproduction steps, and expected vs actual behavior.',
                acceptance: ['Directly links to parent task being worked on'],
              },
              {
                title: 'Bug verification retest checklist for QA engineers',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Provide structured retest verification form before marking bug CLOSED.',
                acceptance: ['Requires QA sign-off before closing ticket'],
              },
            ],
          },
        ],
      },
    ],
  },
];

