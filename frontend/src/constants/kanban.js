export const KANBAN_STATUSES = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
};

export const KANBAN_PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
};

export const COLUMNS_CONFIG = [
  {
    id: KANBAN_STATUSES.TODO,
    title: 'To Do',
    dotColor: 'bg-slate-400',
    borderColor: 'border-slate-200',
  },
  {
    id: KANBAN_STATUSES.IN_PROGRESS,
    title: 'In Progress',
    dotColor: 'bg-purple-600',
    borderColor: 'border-purple-200',
  },
  {
    id: KANBAN_STATUSES.IN_REVIEW,
    title: 'In Review',
    dotColor: 'bg-amber-500',
    borderColor: 'border-amber-200',
  },
  {
    id: KANBAN_STATUSES.BLOCKED,
    title: 'Blocked',
    dotColor: 'bg-rose-500',
    borderColor: 'border-rose-200',
  },
  {
    id: KANBAN_STATUSES.COMPLETED,
    title: 'Completed',
    dotColor: 'bg-emerald-500',
    borderColor: 'border-emerald-200',
  },
];

export const MOCK_ASSIGNEES = [
  {
    id: 'user-1',
    name: 'Priya Sharma',
    role: 'Project Tech Lead',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-2',
    name: 'Kabir Das',
    role: 'Section B2 • Intern',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-3',
    name: 'Rohan Shah',
    role: 'Section A1 • Intern',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-4',
    name: 'Arjun Mehta',
    role: 'Section A1 • Intern',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-5',
    name: 'Meera Nair',
    role: 'Section B2 • Intern',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-6',
    name: 'Sarah Mitchell',
    role: 'Program Manager',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&auto=format&fit=crop&q=80',
  },
];

export const MOCK_EPICS = [
  'All Epics',
  'Timesheets Epic',
  'Database Epic',
  'Auth Epic',
  'Security Epic',
  'DevOps Epic',
];

export const MOCK_SPRINTS = [
  'Sprint 04 / Active Sprint',
  'Sprint 05 (Upcoming)',
  'Sprint 03 (Past)',
  'Sprint 02 (Past)',
  'Sprint 01 (Past)',
];

export const INITIAL_KANBAN_TASKS = [
  {
    id: 'SPS-204',
    title: 'Create Weekly Calendar Submission Form',
    description: 'Design and build the weekly attendance and calendar submission form with automated reminders for interns.',
    status: KANBAN_STATUSES.TODO,
    priority: KANBAN_PRIORITIES.MEDIUM,
    priorityBg: 'bg-amber-50 text-amber-700 border-amber-200',
    epic: 'Timesheets Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 3,
    dueDate: 'Dec 20',
    isOverdue: false,
    assignee: null,
    subtasks: [
      { id: 'st-204-1', title: 'Draft calendar grid UI', done: false },
      { id: 'st-204-2', title: 'Validate timesheet submission schema', done: false },
    ],
    comments: [
      { id: 'c1', author: 'Priya Sharma', time: '1 day ago', text: 'Please ensure deadline defaults to Friday 5 PM.' }
    ],
    timeLogged: '0h',
  },
  {
    id: 'SPS-206',
    title: 'Design Database Schema for Intern Profiles & Sections',
    description: 'PostgreSQL schema design with foreign key constraints mapping interns, tech leads, and active projects.',
    status: KANBAN_STATUSES.IN_PROGRESS,
    priority: KANBAN_PRIORITIES.HIGH,
    priorityBg: 'bg-rose-50 text-rose-700 border-rose-200',
    epic: 'Database Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 5,
    subtasksText: '1 of 2 subtasks',
    dueDate: 'Dec 11',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[1], // Kabir Das
    subtasks: [
      { id: 'st-206-1', title: 'Define foreign key constraints for Tech Leads mapping', done: true },
      { id: 'st-206-2', title: 'Create Audit table triggers for profile updates', done: false },
    ],
    comments: [
      { id: 'c2', author: 'Kabir Das', time: 'Yesterday', text: 'Migration scripts tested on local container, ready for PR.' }
    ],
    timeLogged: '12h 30m',
  },
  {
    id: 'SPS-202',
    title: 'Implement JWT Session Tokens',
    description: 'Stateless JWT session authentication with HttpOnly secure cookie exchange and refresh token rotation.',
    status: KANBAN_STATUSES.IN_REVIEW,
    priority: KANBAN_PRIORITIES.HIGH,
    priorityBg: 'bg-rose-50 text-rose-700 border-rose-200',
    epic: 'Auth Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 5,
    dueDate: 'Dec 10',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[0], // Priya Sharma
    subtasks: [
      { id: 'st-202-1', title: 'Configure cookie encryption keys', done: true },
      { id: 'st-202-2', title: 'Add token expiry interceptor in axios/fetch client', done: true },
    ],
    comments: [
      { id: 'c3', author: 'Sarah Mitchell', time: '2 days ago', text: 'PR is up for security review with DevOps.' }
    ],
    timeLogged: '18h',
  },
  {
    id: 'SPS-203',
    title: 'Role-Based Routing Safeguards',
    description: 'Middleware guards restricting Manager, Tech Lead, and Intern dashboards with audit logging on unauthorized attempts.',
    status: KANBAN_STATUSES.BLOCKED,
    priority: KANBAN_PRIORITIES.BLOCKED,
    priorityBg: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    epic: 'Security Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 8,
    dueDate: 'Dec 8',
    isOverdue: true,
    assignee: MOCK_ASSIGNEES[2], // Rohan Shah
    subtasks: [
      { id: 'st-203-1', title: 'Map permission matrix per endpoint', done: true },
      { id: 'st-203-2', title: 'Implement RBAC higher order component', done: false },
      { id: 'st-203-3', title: 'Awaiting IT API access keys', done: false },
    ],
    comments: [
      { id: 'c4', author: 'Rohan Shah', time: '3 days ago', text: 'Blocked on external API keys from IT department. Ticket #4921.' }
    ],
    timeLogged: '8h 45m',
  },
  {
    id: 'SPS-201',
    title: 'Setup PostgreSQL Migration Scripts',
    description: 'Alembic/Knex migration runner with baseline tables, indexes, and seed datasets for development.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'Database Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 5,
    dueDate: 'Dec 6',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[3], // Arjun Mehta
    subtasks: [
      { id: 'st-201-1', title: 'Write seed data generator', done: true },
      { id: 'st-201-2', title: 'Verify index performance on student ID lookup', done: true },
    ],
    comments: [
      { id: 'c5', author: 'Arjun Mehta', time: 'Dec 6', text: 'Migrations completed and tested on staging DB.' }
    ],
    timeLogged: '14h',
  },
  {
    id: 'SPS-198',
    title: 'Setup CI/CD GitHub Actions Pipeline',
    description: 'Automated test suite execution and lint checks on pull requests with preview deployments.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'DevOps Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 3,
    dueDate: 'Dec 2',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[4], // Meera Nair
    subtasks: [
      { id: 'st-198-1', title: 'Configure Node 20 matrix runner', done: true },
      { id: 'st-198-2', title: 'Add automated coverage report badge', done: true },
    ],
    comments: [],
    timeLogged: '6h',
  },
  {
    id: 'SPS-199',
    title: 'Docker Containerization & Local Env Config',
    description: 'Docker compose setup bundling Postgres, Redis, and local development hot-reload services.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'DevOps Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 5,
    dueDate: 'Dec 4',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[3], // Arjun Mehta
    subtasks: [
      { id: 'st-199-1', title: 'Write Dockerfile.dev with volume mounts', done: true },
    ],
    comments: [],
    timeLogged: '9h',
  },
  {
    id: 'SPS-197',
    title: 'OAuth2 Provider Integration (Google & GitHub)',
    description: 'Single sign-on authentication handlers with automated user profile provisioning and organization domain restriction.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'Auth Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 5,
    dueDate: 'Nov 30',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[0], // Priya Sharma
    subtasks: [
      { id: 'st-197-1', title: 'Register Google OAuth client credentials', done: true },
      { id: 'st-197-2', title: 'Configure GitHub callback URLs', done: true },
    ],
    comments: [],
    timeLogged: '11h 30m',
  },
  {
    id: 'SPS-196',
    title: 'Initial Workspace Architecture & Tailwind Configuration',
    description: 'Setup project scaffolding with Tailwind CSS, custom color palette tokens, and shared design system components.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'DevOps Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 2,
    dueDate: 'Nov 28',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[1], // Kabir Das
    subtasks: [
      { id: 'st-196-1', title: 'Define custom tailwind color tokens', done: true },
    ],
    comments: [],
    timeLogged: '5h',
  },
  {
    id: 'SPS-195',
    title: 'REST API Rate Limiting & Security Headers',
    description: 'Enforce express-rate-limit and Helmet security middleware to prevent brute force and XSS injection vectors.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'Security Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 3,
    dueDate: 'Nov 26',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[2], // Rohan Shah
    subtasks: [
      { id: 'st-195-1', title: 'Configure Redis store for rate limit counter', done: true },
    ],
    comments: [],
    timeLogged: '4h 15m',
  },
  {
    id: 'SPS-194',
    title: 'Intern Profile Image Upload & S3 Bucket Pipeline',
    description: 'Presigned URL upload pipeline for avatar assets with Sharp image compression and resizing.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'Database Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 3,
    dueDate: 'Nov 25',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[4], // Meera Nair
    subtasks: [
      { id: 'st-194-1', title: 'Configure AWS S3 bucket CORS policy', done: true },
    ],
    comments: [],
    timeLogged: '7h',
  },
  {
    id: 'SPS-193',
    title: 'Automated Slack Webhook Alerts for Critical Errors',
    description: 'Webhook dispatcher sending formatted Slack notifications on uncaught exceptions and production error spikes.',
    status: KANBAN_STATUSES.COMPLETED,
    priority: KANBAN_PRIORITIES.COMPLETED,
    priorityBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    epic: 'DevOps Epic',
    sprint: 'Sprint 04 / Active Sprint',
    storyPoints: 2,
    dueDate: 'Nov 24',
    isOverdue: false,
    assignee: MOCK_ASSIGNEES[0], // Priya Sharma
    subtasks: [
      { id: 'st-193-1', title: 'Create incoming webhook in workspace', done: true },
    ],
    comments: [],
    timeLogged: '3h 30m',
  },
];

