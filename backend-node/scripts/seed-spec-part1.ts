import {
  PrismaClient,
  ProjectMethodology,
  ProjectStatus,
  SprintStatus,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
} from '@prisma/client';

const prisma = new PrismaClient();

// Helper to calculate dates relative to current simulation date (Oct 19, 2026)
const now = new Date('2026-10-19T10:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

interface MemberDef {
  email: string;
  role: string;
}

interface ItemTemplate {
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  sp: number;
  sprintIndex?: number; // 0=Sprint1, 1=Sprint2, 2=Sprint3(Active), 3=Sprint4(Planned), undefined=Backlog/Kanban
  desc: string;
  acceptance: string[];
  subtasks?: {
    title: string;
    status: WorkItemStatus;
    sp: number;
    desc: string;
  }[];
}

interface StoryTemplate {
  title: string;
  desc: string;
  sprintIndex?: number;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tasks: ItemTemplate[];
}

interface EpicTemplate {
  title: string;
  desc: string;
  stories: StoryTemplate[];
}

interface ProjectSpec {
  name: string;
  code: string;
  description: string;
  methodology: ProjectMethodology;
  members: MemberDef[];
  epics: EpicTemplate[];
}

export const PROJECTS_SPEC: ProjectSpec[] = [
  // =========================================================================
  // PROJECT 1: Attendance Management & Leave Management (AMS-LMS) - SCRUM
  // =========================================================================
  {
    name: 'Attendance Management & Leave management',
    code: 'AMS-LMS',
    description:
      'Centralized automated employee attendance, shift tracking, leave workflows, and facial-recognition kiosk support for Dailoqa enterprise employees.',
    methodology: ProjectMethodology.SCRUM,
    members: [
      { email: 'krish.jain@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'akshat.awasthi@dailoqa.com', role: 'DEVELOPER' },
      { email: 'ashish.rai@dailoqa.com', role: 'SCRUM_MASTER' },
      { email: 'manisha.parihar@dailoqa.com', role: 'DEVELOPER' },
      { email: 'ananya.jain@dailoqa.com', role: 'QA_TESTER' },
      { email: 'aditi.gupta@dailoqa.com', role: 'DEVELOPER' },
      { email: 'akansha.attri@dailoqa.com', role: 'DEVELOPER' },
      { email: 'keshav.gupta@dailoqa.com', role: 'QA_TESTER' },
    ],
    epics: [
      {
        title: 'Authentication & Profile Security',
        desc: 'RBAC for App Admin, Manager, and Employee tiers with biometric kiosk authentication hooks.',
        stories: [
          {
            title: 'Role-Based Access Control and Session Hardening',
            desc: 'Implement JWT refresh rotation and permissions guard for attendance admins.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build secure biometric token handshake for kiosk terminals',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 0,
                desc: 'Generate short-lived signed tokens for DeepFace kiosk API synchronization.',
                acceptance: ['Tokens expire after 60 seconds', 'Includes device MAC hash'],
                subtasks: [
                  { title: 'Write token issuance unit tests', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'Covers edge case expiration' },
                ],
              },
              {
                title: 'Enforce manager leave approval permission gates',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Restrict approval endpoints to users with LEAVE_APPROVE capability.',
                acceptance: ['403 returned for regular employees'],
              },
            ],
          },
          {
            title: 'Employee Profile Management and Shift Calendars',
            desc: 'Configure flexible working shifts, standard hours, and break policies.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Create shift configuration tables and schema migrations',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 0,
                desc: 'Support daylight savings, flexible windows, and grace periods.',
                acceptance: ['Grace period defaults to 15 mins'],
              },
              {
                title: 'Frontend shift assignment modal in Manager Portal',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Allow managers to batch assign shifts across departments.',
                acceptance: ['Batch assign updates up to 50 employees per call'],
              },
            ],
          },
        ],
      },
      {
        title: 'Attendance Clocking & Work-Hour Tracking',
        desc: 'Real-time check-in/out, GPS geofencing, IP whitelisting, and daily hour calculations.',
        stories: [
          {
            title: 'Live Check-in and Geofencing Validation',
            desc: 'Record geo-stamped check-ins with tamper-proof device timestamps.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop geofence radius calculation algorithm',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 1,
                desc: 'Calculate Haversine distance between office centroid and GPS coordinates.',
                acceptance: ['Rejects check-ins > 100m outside boundary'],
                subtasks: [
                  { title: 'Add unit tests for boundary lat/long points', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'Boundary testing' },
                ],
              },
              {
                title: 'Fix race condition on double-clicking Check-In button',
                type: WorkItemType.BUG,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                sprintIndex: 1,
                desc: 'Prevent duplicate session generation within 10 seconds.',
                acceptance: ['Idempotency key stored in Redis'],
              },
            ],
          },
          {
            title: 'Working Hours Calculation and Overtime Tracking',
            desc: 'Compute net productive hours minus break durations automatically.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Implement night shift split hour calculator',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 1,
                desc: 'Split shifts crossing midnight into respective calendar day buckets.',
                acceptance: ['Reconciles timesheets accurately across midnight'],
              },
              {
                title: 'Build overtime approval dispatch trigger',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 2,
                sprintIndex: 1,
                desc: 'Notify direct manager when working hours exceed 9.0 hours/day.',
                acceptance: ['Dispatches notification to manager email and in-app'],
              },
            ],
          },
        ],
      },
      {
        title: 'Leave & Work-From-Home (WFH) Management',
        desc: 'Multi-type leave balances, accrual engine, holiday calendar, and WFH request routing.',
        stories: [
          {
            title: 'Leave Accrual & Balance Ledger',
            desc: 'Monthly accrual credits with rollover caps and sandwich-rule calculations.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement sandwich weekend leave deduction engine',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                sprintIndex: 2,
                desc: 'Detect Friday + Monday consecutive leaves and deduct intervening weekend days.',
                acceptance: ['Configurable toggle per department policy'],
                subtasks: [
                  { title: 'Audit edge cases around national holidays', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Calendar verification' },
                ],
              },
              {
                title: 'Leave balance deficit validation error on submit',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                sprintIndex: 2,
                desc: 'Negative balances allowed when concurrent requests are submitted in parallel.',
                acceptance: ['Use row-level locking during leave deduction'],
              },
              {
                title: 'Document maternity and bereavement special leave policies',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 2,
                sprintIndex: 2,
                desc: 'Publish guidelines into company policy tab.',
                acceptance: ['Markdown rendered in employee help portal'],
              },
            ],
          },
          {
            title: 'Attendance Regularization Workflows',
            desc: 'Employees submit biometric missed punches with reason codes for manager sign-off.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build regularization request form with attachment upload',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Allow employees to attach medical or client meeting proof.',
                acceptance: ['Max 5MB PDF/PNG allowed'],
              },
              {
                title: 'Regularization monthly quota limit enforcement',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 2,
                desc: 'Disallow more than 3 regularizations per calendar month.',
                acceptance: ['Warning modal displayed when quota exceeded'],
              },
            ],
          },
        ],
      },
      {
        title: 'DeepFace Kiosk & Advanced Analytics',
        desc: 'Computer vision automated kiosk attendance and monthly compliance exports.',
        stories: [
          {
            title: 'Automated Facial Recognition Kiosk Integration',
            desc: 'Ingest 128-d embeddings from DeepFace camera stream and match employee database.',
            sprintIndex: 3,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build vector embedding similarity endpoint with pgvector',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                sprintIndex: 3,
                desc: 'Query nearest neighbor embedding with cosine threshold > 0.88.',
                acceptance: ['Latency < 200ms for 5,000 enrolled faces'],
              },
              {
                title: 'Kiosk offline buffering and sync worker',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Store punches in local SQLite when offline and replay upon reconnect.',
                acceptance: ['Zero loss of punches during 4h network outage'],
              },
            ],
          },
          {
            title: 'Executive Compliance & Payroll Export Reports',
            desc: 'Generate monthly CSV/Excel summaries formatted for ADP and SAP payroll ingestion.',
            sprintIndex: 3,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Export monthly payroll reconciliation matrix',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Column breakdown of Payable Days, LOP, Overtime Hours, and Shift Allowances.',
                acceptance: ['Generates xlsx within 3 seconds for 1,000 records'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 2: Performance Management System (PerforMax) - SCRUM
  // =========================================================================
  {
    name: 'Performance Management System (PerforMax)',
    code: 'PerforMax',
    description:
      'Enterprise KPI tracking, quarterly 360-degree performance evaluation cycles, continuous feedback feeds, and talent matrix reporting.',
    methodology: ProjectMethodology.SCRUM,
    members: [
      { email: 'jatin.maurya@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'akshat.bansal@dailoqa.com', role: 'DEVOPS_ENGINEER' },
      { email: 'jasleen.kaur@dailoqa.com', role: 'DEVELOPER' },
      { email: 'jayesh.kansal@dailoqa.com', role: 'DEVELOPER' },
      { email: 'bhavya.bhutani@dailoqa.com', role: 'QA_TESTER' },
      { email: 'tanvi.kad@dailoqa.com', role: 'DEVELOPER' },
      { email: 'aditya.sen@dailoqa.com', role: 'DEVELOPER' },
      { email: 'anushka.khare@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Goal & KPI Master Configuration',
        desc: 'Framework for OKR hierarchy, weightage constraints, and target milestones.',
        stories: [
          {
            title: 'Departmental KPI Template Builder',
            desc: 'HR creates standard quarterly KPI templates mapped to organizational strategic pillars.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop KPI weightage summation validation engine',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 0,
                desc: 'Validate total assigned weightage equals exactly 100.0%.',
                acceptance: ['Rejects submission if total != 100%'],
              },
              {
                title: 'Add support for qualitative vs quantitative measurement units',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Support Currency, Percentage, Numeric Count, and Binary Completed/Not.',
                acceptance: ['Dropdown dynamically swaps formatting'],
              },
            ],
          },
          {
            title: 'Cascading Employee Goal Alignment',
            desc: 'Employees link personal quarterly goals to parent organizational key results.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build interactive goal hierarchy tree view component',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 0,
                desc: 'Visual node tree displaying CEO -> VP -> Manager -> Individual goals.',
                acceptance: ['Collapsible nodes with progress badges'],
              },
              {
                title: 'Goal milestone progress slider and proof attachment',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Allow employees to adjust progress percentage and upload deliverables.',
                acceptance: ['Auto-updates parent goal weighted progress'],
              },
            ],
          },
        ],
      },
      {
        title: 'Evaluation Cycles & 360 Reviews',
        desc: 'Self-assessment, peer feedback, manager grading, and normalization curves.',
        stories: [
          {
            title: 'Quarterly Review Workflow State Machine',
            desc: 'Manage states from DRAFT -> SELF_REVIEW -> PEER_REVIEW -> MANAGER_REVIEW -> CALIBRATION -> LOCKED.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement appraisal transition guard rules',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 1,
                desc: 'Prevent manager review until self-review submission is sealed.',
                acceptance: ['Returns 400 with explanation if self-review incomplete'],
              },
              {
                title: 'Fix rating rounding discrepancy in 5-point scale calculator',
                type: WorkItemType.BUG,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 2,
                sprintIndex: 1,
                desc: 'Round composite score to 2 decimal places consistently.',
                acceptance: ['3.456 rounds to 3.46'],
              },
            ],
          },
          {
            title: 'Continuous Feedback & Praise Wall',
            desc: 'Peer recognition, real-time manager feedback notes, and 1:1 check-in logs.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Create kudos badge reward system with notification feed',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 3,
                sprintIndex: 1,
                desc: 'Allow peers to award badges like Innovation, Team Player, Problem Solver.',
                acceptance: ['Badges show on user profile'],
              },
              {
                title: 'Private manager 1:1 notes encrypted storage',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 1,
                desc: 'Store sensitive manager notes encrypted with KMS key.',
                acceptance: ['Non-manager users cannot inspect raw database text'],
              },
            ],
          },
        ],
      },
      {
        title: 'Calibration & Performance Bell Curve',
        desc: 'HR committee review, forced distribution normalization, and promotion tracking.',
        stories: [
          {
            title: '9-Box Talent Matrix Visualization',
            desc: 'Plot employees across Performance vs Potential grid with drag-and-drop calibration.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build interactive 9-box SVG grid with live employee cards',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                sprintIndex: 2,
                desc: 'Render cards with avatar, department filter, and calibration status.',
                acceptance: ['Filters by department and role in < 50ms'],
                subtasks: [
                  { title: 'Test drag-and-drop event listeners across browser touch/desktop', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Cross-browser testing' },
                ],
              },
              {
                title: 'Bell curve distribution warning indicator',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Warn HR when top tier exceeds 15% or bottom tier falls below 10%.',
                acceptance: ['Visual gauge color turns orange if curve deviates > 5%'],
              },
              {
                title: 'Resolve race condition during concurrent manager calibrations',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                sprintIndex: 2,
                desc: 'Simultaneous score updates overwrite each other without optimistic lock.',
                acceptance: ['Implement version column optimistic locking'],
              },
            ],
          },
          {
            title: 'Promotion & Increment Proposal Flow',
            desc: 'Formal recommendations submitted to compensation committee.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build salary band comparison helper in manager proposal view',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 2,
                desc: 'Show target role min/mid/max compensation bands.',
                acceptance: ['Highlight out-of-band proposed increments'],
              },
            ],
          },
        ],
      },
      {
        title: 'Executive Analytics & Performance History',
        desc: 'Multi-year performance audits, attrition risk predictors, and export reports.',
        stories: [
          {
            title: 'Historical Performance Trend Charts',
            desc: 'Render longitudinal rating trajectories across past 8 quarters.',
            sprintIndex: 3,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Develop time-series rating trajectory chart using Recharts',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Display self vs manager vs normalized final ratings over time.',
                acceptance: ['Hover tooltips disclose reviewer comments'],
              },
              {
                title: 'Export comprehensive appraisal PDF dossier',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Compile signed appraisal packet with watermarked signature timestamp.',
                acceptance: ['PDF conforms to legal HR compliance archive standard'],
              },
            ],
          },
        ],
      },
    ],
  },
];

