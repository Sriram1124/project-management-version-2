import {
  PrismaClient,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
} from '@prisma/client';

const prisma = new PrismaClient();

const now = new Date('2026-10-19T10:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

const ADDITIONAL_ITEMS: Record<string, any[]> = {
  'Ticket Management System': [
    {
      title: 'Automated CVE database ingestion synchronization daemon',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Ingest NVD JSON feed nightly and auto-link CVE definitions to reported vulnerabilities.',
      acceptance: ['Matches CPE vendor strings accurately'],
      subtasks: [
        { title: 'Write unit tests for NVD 2.0 API pagination', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'API testing' },
      ],
    },
    {
      title: 'Security analyst ticket assignment SLA notification webhook',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.MEDIUM,
      sp: 3,
      desc: 'Dispatch incident channel notification when high severity finding is logged.',
      acceptance: ['Includes finding deep link and severity badge'],
    },
    {
      title: 'False positive status transition reason modal',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      sp: 2,
      desc: 'Require analyst to enter justification when marking ticket as FALSE_POSITIVE.',
      acceptance: ['Stores reason in audit log'],
    },
    {
      title: 'Fix WebSocket reconnection race condition on browser wake from sleep',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 3,
      desc: 'Laptop lid open causes stale socket token error without clean re-auth.',
      acceptance: ['Automatically requests fresh JWT before reconnecting'],
    },
    {
      title: 'Executive vulnerability patch velocity monthly summary chart',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Graph Mean Time to Remediate (MTTR) by severity over trailing 6 months.',
      acceptance: ['Render exportable PNG/PDF report'],
    },
    {
      title: 'Penetration test report bulk findings CSV importer',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Bulk create findings from Burp Suite and OWASP ZAP XML exports.',
      acceptance: ['Validates schema before bulk transaction insert'],
    },
  ],

  'Cross Project Code Review': [
    {
      title: 'SonarQube rule mapping and severity normalization',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Normalize external SonarQube rule IDs to standard internal finding taxonomy.',
      acceptance: ['Maps Blocker/Critical/Major to standard severities'],
    },
    {
      title: 'Automated PR merge check status indicator integration',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Block GitHub PR merge button if mandatory code review findings remain open.',
      acceptance: ['Sets GitHub commit status context to failure'],
      subtasks: [
        { title: 'Write tests for GitHub commit status API wrapper', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'API testing' },
      ],
    },
    {
      title: 'Reviewer workload heatmap by day of week',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      sp: 3,
      desc: 'Visual matrix showing review distribution to identify bottlenecks.',
      acceptance: ['Highlights overloaded reviewers in amber'],
    },
    {
      title: 'Fix diff syntax highlighting on TypeScript 5.5 type import syntax',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.MEDIUM,
      sp: 2,
      desc: 'Type imports with inline comments misalign side-by-side diff view.',
      acceptance: ['Tokenizes PrismJS syntax accurately'],
    },
    {
      title: 'Security compliance sign-off checklist in PR review view',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 3,
      desc: 'Mandatory checkboxes for data privacy, authentication, and logging review.',
      acceptance: ['Recorded with reviewer sign-off timestamp'],
    },
    {
      title: 'Automated dependency vulnerability scanner (Snyk/Dependabot sync)',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Alert when package.json or pom.xml references vulnerable library versions.',
      acceptance: ['Triggers review finding with CVE details'],
    },
  ],

  'Fraud Detection System (BankShield)': [
    {
      title: 'Merchant category code (MCC) high-risk transaction rule',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Flag transactions at casinos, wire transfers, and crypto exchanges above $1,000.',
      acceptance: ['Applies enhanced verification challenge'],
    },
    {
      title: 'Device fingerprint hash calculation and cookie tampering check',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Compute browser Canvas, WebGL, and AudioContext hash to identify repeat fraud devices.',
      acceptance: ['Persistent fingerprint survives incognito sessions'],
      subtasks: [
        { title: 'Test device fingerprint consistency across OS updates', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'Consistency test' },
      ],
    },
    {
      title: 'Analyst case notes search index with full-text indexing',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      sp: 3,
      desc: 'Search past case resolution notes by keyword and entity ID.',
      acceptance: ['Sub-second search response'],
    },
    {
      title: 'Intermittent false positive on Apple Pay dynamic device PANs',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 3,
      desc: 'Apple Pay tokenized card updates erroneously trigger new card alert rule.',
      acceptance: ['Verify token provider flag before evaluating new card rule'],
    },
    {
      title: 'Automated SMS OTP challenge dispatch integration with Twilio',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Trigger step-up 2FA OTP for medium-risk suspicious transactions.',
      acceptance: ['Expires OTP after 120 seconds'],
    },
    {
      title: 'Fraud loss prevention executive dashboard KPI cards',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Track prevented fraud dollars, chargeback rates, and operational review time.',
      acceptance: ['Displays real-time prevented dollar metrics'],
    },
  ],

  'Timesheet Management System (To be integrated with Project Management)': [
    {
      title: 'Project billable vs non-billable tag selector on task time entries',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.MEDIUM,
      sp: 3,
      desc: 'Tag individual time blocks as billable, client meeting, internal, or training.',
      acceptance: ['Defaults to project default billable status'],
    },
    {
      title: 'Timesheet PDF export with client-ready billing invoice breakdown',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Generate printable timesheet statement with manager sign-off stamp.',
      acceptance: ['Aggregates hours by role and rate code'],
      subtasks: [
        { title: 'Format PDF layout for standard A4 landscape print', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'PDF formatting' },
      ],
    },
    {
      title: 'Missing time entry calendar reminder banner in intern portal',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      sp: 2,
      desc: 'Display subtle amber banner when hours logged for yesterday is under 8.0h.',
      acceptance: ['One-click button opens time logging modal for missing date'],
    },
    {
      title: 'Timer drift bug when device sleeps during active tracking session',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 3,
      desc: 'Sleep mode causes stopwatch display to desynchronize from server timestamp.',
      acceptance: ['Recalculate elapsed seconds from started_at timestamp upon wake'],
    },
    {
      title: 'Overtime threshold compliance rule configuration tab',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 3,
      desc: 'Configure weekly 40h standard threshold and approval requirements.',
      acceptance: ['Enforces overtime justification notes'],
    },
    {
      title: 'Monthly payroll lock and timesheet freeze workflow',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Lock timesheet modifications after monthly payroll cutoff date.',
      acceptance: ['Restricts post-cutoff edits to HR Admin override'],
    },
  ],

  'AI Transaction Anomlay Detection': [
    {
      title: 'High-frequency micro-deposit testing pattern detector',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Detect automated bots executing small $0.01-$1.00 authorization attempts.',
      acceptance: ['Identifies card testing within 10 transactions'],
    },
    {
      title: 'TimesFM anomaly threshold auto-calibration job',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Recalibrate 3-sigma anomaly threshold dynamically based on weekday/weekend volume.',
      acceptance: ['Prevents false anomaly spikes during planned marketing sales'],
      subtasks: [
        { title: 'Write unit tests for weekend volume baseline scaling factor', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'Scaling test' },
      ],
    },
    {
      title: 'Alert dispatch webhook payload encryption with AES-GCM',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 3,
      desc: 'Encrypt sensitive bank account details in external webhook notifications.',
      acceptance: ['Uses shared secret with customer endpoint'],
    },
    {
      title: 'Redis feature cache connection timeout during sudden transaction burst',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.URGENT,
      sp: 3,
      desc: 'Connection pool starvation drops feature fetch during 10k TPS flash sale.',
      acceptance: ['Implement circuit breaker and fallback local in-memory cache'],
    },
    {
      title: 'Multi-tenant alert routing and risk team assignment rules',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Route enterprise client transactions to their dedicated internal risk analysts.',
      acceptance: ['Strict tenant isolation on alert queue'],
    },
    {
      title: 'Model drift monitoring dashboard and PSI metric tracking',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Calculate Population Stability Index (PSI) to detect input feature distribution drift.',
      acceptance: ['Alerts data science team if PSI > 0.25'],
    },
  ],

  'LOAN APPLICATION ANALYSER': [
    {
      title: 'Bank account verification penny drop reconciliation worker',
      type: WorkItemType.TASK,
      status: WorkItemStatus.COMPLETED,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Match penny drop beneficiary name against application with Levenshtein distance < 3.',
      acceptance: ['Reconciles IMPS reference and account validity'],
    },
    {
      title: 'Co-applicant financial document upload and income aggregation',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Allow borrower to add spouse/parent as co-borrower to increase loan eligibility.',
      acceptance: ['Aggregates combined household net monthly income'],
      subtasks: [
        { title: 'Write tests for combined DTI formula with multiple income sources', status: WorkItemStatus.COMPLETED, sp: 2, desc: 'DTI formula test' },
      ],
    },
    {
      title: 'Underwriter rejection reason code template selector',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      sp: 2,
      desc: 'Standardized adverse action reason codes for rejected loan applications.',
      acceptance: ['Compliant with fair lending regulatory requirements'],
    },
    {
      title: 'OCR parser failure on skewed camera photos of salary slips',
      type: WorkItemType.BUG,
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.HIGH,
      sp: 3,
      desc: 'Photos taken at an angle fail perspective warp and miss net pay column.',
      acceptance: ['Apply OpenCV perspective transform before running OCR engine'],
    },
    {
      title: 'Loan disbursement instruction batch export to core banking system',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.HIGH,
      sp: 5,
      desc: 'Export approved loan disbursement files formatted for NEFT/RTGS clearing.',
      acceptance: ['Generates PGP-encrypted batch disbursement file'],
    },
    {
      title: 'Executive loan portfolio yield and average ticket size analytics',
      type: WorkItemType.TASK,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sp: 5,
      desc: 'Track weighted average APR, approval rate, and delinquency vintages.',
      acceptance: ['Visual charts rendered on credit committee dashboard'],
    },
  ],
};

async function main() {
  console.log('=== BOOSTING TASK COUNTS TO 25-30 FOR REMAINING PROJECTS ===\n');

  const manager = await prisma.user.findUnique({
    where: { email: 'manager@dailoqa.com' },
  });
  if (!manager) throw new Error('Manager not found');

  for (const [projName, tasks] of Object.entries(ADDITIONAL_ITEMS)) {
    const proj = await prisma.project.findFirst({
      where: { name: projName },
      include: {
        members: { include: { user: true } },
        work_items: { where: { type: WorkItemType.STORY } },
      },
    });

    if (!proj) {
      console.warn(`Project "${projName}" not found!`);
      continue;
    }

    const stories = proj.work_items;
    if (stories.length === 0) {
      console.warn(`No stories found in "${projName}"!`);
      continue;
    }

    const members = proj.members.map((m) => m.user);
    let memberIdx = 0;
    let addedCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      const taskSpec = tasks[i];
      const story = stories[i % stories.length];
      const assignee = members[memberIdx % members.length];
      memberIdx++;

      let startDate = daysAgo(10);
      let dueDate = daysFromNow(8);
      let completedAt: Date | null = null;

      if (taskSpec.status === WorkItemStatus.COMPLETED) {
        startDate = daysAgo(25);
        dueDate = daysAgo(8);
        completedAt = daysAgo(9);
      } else if (taskSpec.status === WorkItemStatus.IN_PROGRESS) {
        startDate = daysAgo(5);
        dueDate = daysFromNow(5);
      } else if (taskSpec.status === WorkItemStatus.TODO) {
        startDate = daysFromNow(3);
        dueDate = daysFromNow(15);
      }

      const formattedDesc = `${taskSpec.desc}\n\n### Acceptance Criteria\n${taskSpec.acceptance
        .map((a: string) => `- [x] ${a}`)
        .join('\n')}`;

      const t = await prisma.workItem.create({
        data: {
          organization_id: proj.organization_id,
          project_id: proj.id,
          parent_id: story.id,
          created_by: manager.id,
          type: taskSpec.type,
          title: taskSpec.title,
          description: formattedDesc,
          status: taskSpec.status,
          priority: taskSpec.priority,
          story_points: taskSpec.sp,
          start_date: startDate,
          due_date: dueDate,
          completed_at: completedAt,
        },
      });
      addedCount++;

      if (assignee) {
        await prisma.workItemAssignee.create({
          data: { work_item_id: t.id, user_id: assignee.id },
        });
      }

      if (taskSpec.subtasks) {
        for (const sub of taskSpec.subtasks) {
          const st = await prisma.workItem.create({
            data: {
              organization_id: proj.organization_id,
              project_id: proj.id,
              parent_id: t.id,
              created_by: manager.id,
              type: WorkItemType.SUBTASK,
              title: sub.title,
              description: sub.desc,
              status: sub.status,
              priority: taskSpec.priority,
              story_points: sub.sp,
              start_date: startDate,
              due_date: dueDate,
              completed_at: sub.status === WorkItemStatus.COMPLETED ? completedAt : null,
            },
          });
          addedCount++;

          if (assignee) {
            await prisma.workItemAssignee.create({
              data: { work_item_id: st.id, user_id: assignee.id },
            });
          }
        }
      }
    }

    const totalNow = await prisma.workItem.count({ where: { project_id: proj.id } });
    console.log(`Boosted "${projName}": added ${addedCount} items -> total now ${totalNow}`);
  }

  console.log('\nTask boost completed successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());

