import {
  ProjectMethodology,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
} from '@prisma/client';

export const PROJECTS_SPEC_PART5: any[] = [
  // =========================================================================
  // PROJECT 13: AI Transaction Anomaly Detection (AI-TAD) - KANBAN
  // =========================================================================
  {
    name: 'AI Transaction Anomlay Detection',
    code: 'AI-TAD',
    description:
      'Continuous real-time anomaly detection, Google TimesFM foundation model forecasting, multi-signal risk scoring, and investigation triage queue.',
    methodology: ProjectMethodology.KANBAN,
    members: [
      { email: 'harsh.kumar@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'bharat.yadav@dailoqa.com', role: 'DEVELOPER' },
      { email: 'pranav.suresh@dailoqa.com', role: 'DEVELOPER' },
      { email: 'nitin.singh@dailoqa.com', role: 'DEVELOPER' },
      { email: 'deepanshu.dangi@dailoqa.com', role: 'QA_TESTER' },
    ],
    epics: [
      {
        title: 'Historical Transaction Analysis & Preprocessing',
        desc: 'Extract 24-month transaction logs, normalize feature vectors, and remove noisy settlement artifacts.',
        stories: [
          {
            title: 'Transaction Feature Extraction Pipeline',
            desc: 'Compute rolling aggregates: 24h volume, deviation from merchant baseline, and night-time activity.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop PySpark batch pipeline for historical feature engineering',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Compute merchant category baseline spend curves across 10M transactions.',
                acceptance: ['Runs in < 15 minutes on cluster'],
              },
              {
                title: 'Feature store sync worker using Feast / Redis',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                desc: 'Sync real-time feature vectors to Redis for online model scoring.',
                acceptance: ['Feature lookup latency < 1.5ms'],
              },
            ],
          },
          {
            title: 'Synthetic Anomaly Data Augmentation',
            desc: 'Inject synthetic fraud patterns (smurfing, card testing, sudden volume spikes) for model training.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build synthetic financial anomaly generator with CTGAN',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Generate balanced positive anomaly samples matching realistic bank fraud topologies.',
                acceptance: ['Statistically indistinguishable from audited historical SAR cases'],
              },
            ],
          },
        ],
      },
      {
        title: 'TimesFM Time-Series Forecasting & Anomaly Scoring',
        desc: 'Incorporate Google TimesFM zero-shot time-series model for transaction volume forecasting.',
        stories: [
          {
            title: 'Google TimesFM Foundation Model Integration',
            desc: 'Forecast baseline expected hourly volume per payment rail and compute anomaly residual score.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Serve TimesFM zero-shot model inference container with Triton Server',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                desc: 'Host TimesFM checkpoint on GPU instance for low-latency batch forecasting.',
                acceptance: ['Generates 168-hour forward forecast in < 250ms'],
                subtasks: [
                  { title: 'Benchmark GPU VRAM utilization under 50 concurrent tenant requests', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'VRAM benchmark' },
                ],
              },
              {
                title: 'Multi-signal risk score aggregator and reason code generator',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_REVIEW,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Combine TimesFM volume residual, isolation forest score, and rule triggers into 0-100 score.',
                acceptance: ['Attaches top 3 contributing reason codes (e.g., REASON_SPIKE_VELOCITY)'],
              },
              {
                title: 'CUDA out-of-memory error during peak load TimesFM batch processing',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                desc: 'Batch size of 128 exceeds 16GB GPU memory during simultaneous hourly forecasts.',
                acceptance: ['Dynamically tune batch size to 32 with request queuing'],
              },
            ],
          },
          {
            title: 'Investigation Dashboard & Alert Dispatch',
            desc: 'Continuous Kanban review queue: FLAGGED -> UNDER_REVIEW -> CONFIRMED_ANOMALY -> FALSE_POSITIVE -> RESOLVED.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build real-time anomaly telemetry chart with interactive confidence bands',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Plot actual transaction rate against TimesFM predicted band; highlight red breach points.',
                acceptance: ['Tooltips display transaction count and delta deviation'],
              },
              {
                title: 'Overdue anomaly alert triage escalation',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'Urgent task to review alerts with anomaly score > 90 pending > 2 hours.',
                acceptance: ['Auto-escalates to senior risk officer on duty'],
              },
            ],
          },
        ],
      },
      {
        title: 'Feedback Loop & Active Learning',
        desc: 'Incorporate analyst feedback into weekly model fine-tuning and rule threshold optimization.',
        stories: [
          {
            title: 'Analyst Label Ingestion for Model Retraining',
            desc: 'Capture false-positive labels to automatically adjust dynamic sensitivity thresholds.',
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.LOW,
            tasks: [
              {
                title: 'Build active learning feedback collector endpoint',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.LOW,
                sp: 3,
                desc: 'Store verified labels with audit trail for continuous model performance tracking.',
                acceptance: ['Labels versioned and tagged with model release version'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 14: AI Powered QA Test and Bug Analysis (AI-QA-BUGS) - SCRUM
  // =========================================================================
  {
    name: 'AI Powered QA Test and Bug Analysis',
    code: 'AI-QA-BUGS',
    description:
      'Centralized AI-powered QA platform: test case authoring, automated execution runs, intelligent bug title/severity classification, and root cause analysis.',
    methodology: ProjectMethodology.SCRUM,
    members: [
      { email: 'kanak.varshney@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'rohit.raghav@dailoqa.com', role: 'QA_TESTER' },
      { email: 'darsheel.jaiswal@dailoqa.com', role: 'QA_TESTER' },
      { email: 'mann.upadhyay@dailoqa.com', role: 'DEVOPS_ENGINEER' },
      { email: 'garvita.singh@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Test Case Management & Execution Runs',
        desc: 'Folder hierarchies, test steps with expected results, test run suites, and pass/fail recording.',
        stories: [
          {
            title: 'Hierarchical Test Suite Tree & Test Steps Editor',
            desc: 'Organize test cases into modules with step-by-step actions and assertions.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build interactive test step reordering editor with drag-and-drop',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 0,
                desc: 'Allow testers to reorder steps, add expected outcomes, and attach screenshots.',
                acceptance: ['Smooth step renumbering on reorder'],
              },
              {
                title: 'Test suite export to Gherkin feature file format',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Generate Cucumber-compatible Given/When/Then text files from test cases.',
                acceptance: ['Valid Gherkin syntax accepted by cucumber-js'],
              },
            ],
          },
          {
            title: 'Test Run Execution Matrix & Result Recorder',
            desc: 'Execute test suites across environments (Staging, Pre-Prod) and record Pass/Fail/Blocked.',
            sprintIndex: 0,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Develop rapid test runner execution keyboard shortcuts view',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 3,
                sprintIndex: 0,
                desc: 'Press P for Pass, F for Fail, B for Blocked to speed up manual regression cycles.',
                acceptance: ['Logs tester duration spent on each step'],
              },
            ],
          },
        ],
      },
      {
        title: 'Complete Bug Lifecycle Management',
        desc: 'One-click bug creation from failed test steps, reproduction logs, and retest verification.',
        stories: [
          {
            title: 'Defect Creation from Failed Test Runs',
            desc: 'Auto-populate bug description with failed test step details and execution environment.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement one-click bug filing modal from failed test step',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 1,
                desc: 'Pre-fill summary, browser version, user agent, and step logs automatically.',
                acceptance: ['Binds defect ID directly to execution run result'],
              },
              {
                title: 'Fix broken attachment link when filing bug from mobile test view',
                type: WorkItemType.BUG,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 2,
                sprintIndex: 1,
                desc: 'Mobile image uploads generate relative file path instead of public storage URL.',
                acceptance: ['Generates correct absolute CDN attachment URL'],
              },
            ],
          },
          {
            title: 'Defect Severity Triage & Developer Assignment',
            desc: 'Categorize defects (CRITICAL, MAJOR, MINOR, TRIVIAL) and route to module developer.',
            sprintIndex: 1,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Build defect triage queue with filter by component and target release',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.LOW,
                sp: 3,
                sprintIndex: 1,
                desc: 'Allow QA lead to batch-assign bugs to developers for current sprint.',
                acceptance: ['Dispatches assignment notification to developer'],
              },
            ],
          },
        ],
      },
      {
        title: 'AI-Powered Bug Analysis & Classification',
        desc: 'LLM classification: automated bug title generation, priority/severity prediction, duplicate detection.',
        stories: [
          {
            title: 'Intelligent Bug Duplicate Detector',
            desc: 'Calculate semantic embedding similarity between new bug text and existing open issues.',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Build semantic bug duplicate search endpoint using OpenAI text-embedding-3',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                sprintIndex: 2,
                desc: 'Suggest potential duplicate bugs as tester types bug description.',
                acceptance: ['Surfaces top 3 similar bugs with match percentage score'],
                subtasks: [
                  { title: 'Evaluate duplicate matching recall on past 500 historical bugs', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Recall evaluation' },
                ],
              },
              {
                title: 'AI severity and priority recommendation model integration',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Predict whether bug should be URGENT or MEDIUM based on impact keywords.',
                acceptance: ['Explains rationale in collapsible AI suggestion box'],
              },
              {
                title: 'OpenAI API rate limit error during bulk test run defect import',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                sprintIndex: 2,
                desc: 'Bulk import of 50 failed tests simultaneously exhausts LLM tokens/min quota.',
                acceptance: ['Throttle AI requests through rate-limited BullMQ worker queue'],
              },
            ],
          },
          {
            title: 'Automated Root Cause Failure Tagging',
            desc: 'Analyze stack trace and console logs to tag failure source (Backend API, UI, Network, DB).',
            sprintIndex: 2,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Implement regex & AST stack trace parser for stack trace categorization',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 2,
                desc: 'Extract crashing class, method name, and error code from raw stack dump.',
                acceptance: ['Tags bug automatically with offending microservice name'],
              },
            ],
          },
        ],
      },
      {
        title: 'Flaky Test Detection & QA Metrics',
        desc: 'Defect density, test execution velocity, automated flaky test detection, and release readiness.',
        stories: [
          {
            title: 'Automated Flaky Test Detection Worker',
            desc: 'Detect tests that alternate between Pass and Fail across runs without code changes.',
            sprintIndex: 3,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Develop flaky test score algorithm based on flip-flop frequency',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                sprintIndex: 3,
                desc: 'Flag tests with flip-flop rate > 20% over past 10 test execution runs.',
                acceptance: ['Excludes flaky tests from release blocking gate criteria'],
              },
              {
                title: 'Release readiness gate scoring dashboard',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                sprintIndex: 3,
                desc: 'Calculate overall Go/No-Go score based on test coverage and unresolved critical bugs.',
                acceptance: ['Clear green/red release readiness badge for release managers'],
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================================
  // PROJECT 15: LOAN APPLICATION ANALYSER (LOAN-ANALYSER) - KANBAN
  // =========================================================================
  {
    name: 'LOAN APPLICATION ANALYSER',
    code: 'LOAN-ANALYSER',
    description:
      'Continuous-flow loan underwriting intake, automated financial document OCR, income verification, policy rule engine, and loan officer disbursement queue.',
    methodology: ProjectMethodology.KANBAN,
    members: [
      { email: 'sivaram.s.alla@dailoqa.com', role: 'TECH_LEAD' },
      { email: 'peram.m.reddy@dailoqa.com', role: 'DEVELOPER' },
      { email: 'rudraraju.s.varma@dailoqa.com', role: 'DEVELOPER' },
      { email: 'penmetsa.h.varma@dailoqa.com', role: 'DEVELOPER' },
      { email: 'k.s.reddy@dailoqa.com', role: 'DEVELOPER' },
    ],
    epics: [
      {
        title: 'Loan Application Intake & Document OCR',
        desc: 'Multi-step application intake, Aadhaar/PAN KYC OCR, and tax return (ITR) parsing.',
        stories: [
          {
            title: 'Borrower Digital Intake & Document Upload Portal',
            desc: 'Multi-step wizard collecting personal details, loan purpose, and salary slips.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Develop secure multi-file document upload with virus scanning',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Stream uploaded borrower documents through ClamAV scanner before S3 storage.',
                acceptance: ['Quarantines infected files and rejects upload with 400'],
              },
              {
                title: 'Build OCR parser for Indian Income Tax Return (ITR-V) verification',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Extract Gross Total Income, Tax Paid, and Acknowledgement number from ITR-V PDF.',
                acceptance: ['Matches stated annual income within 5% tolerance'],
              },
            ],
          },
          {
            title: 'Automated Identity Verification & Liveness Check',
            desc: 'Verify PAN with NSDL and Aadhaar OTP verification via UIDAI partner gateway.',
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Connect NSDL PAN real-time verification API with name match score',
                type: WorkItemType.TASK,
                status: WorkItemStatus.COMPLETED,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Verify PAN validity and match applicant name against NSDL tax record.',
                acceptance: ['Returns verified status code and tax entity type'],
              },
            ],
          },
        ],
      },
      {
        title: 'Underwriting Rules Engine & Policy Decisioning',
        desc: 'Continuous Kanban underwriting board: APPLICATION_SUBMITTED -> OCR_VERIFIED -> UNDERWRITING_REVIEW -> SANCTIONED -> DISBURSED.',
        stories: [
          {
            title: 'Automated Rule-Based Eligibility Decisioning',
            desc: 'Evaluate minimum age, eligible loan amount multiplier, and existing liabilities.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            tasks: [
              {
                title: 'Implement lending policy rules engine using json-rules-engine',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 8,
                desc: 'Evaluate multi-condition lending rules: Min Income >= 25k, Min Age 21, DTI <= 55%.',
                acceptance: ['Generates automatic APPROVE, REFER, or REJECT recommendation'],
                subtasks: [
                  { title: 'Write tests for self-employed vs salaried policy rules variation', status: WorkItemStatus.IN_PROGRESS, sp: 2, desc: 'Policy variation testing' },
                ],
              },
              {
                title: 'Loan officer underwriting review dashboard with side-by-side document viewer',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_PROGRESS,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'View extracted OCR fields directly adjacent to original document PDF page.',
                acceptance: ['Allows loan officer to verify and correct parsed values'],
              },
              {
                title: 'Net monthly income calculation bug when bonus/incentives are present',
                type: WorkItemType.BUG,
                status: WorkItemStatus.BLOCKED,
                priority: WorkItemPriority.URGENT,
                sp: 5,
                desc: 'One-off annual bonus incorrectly treated as recurring monthly salary component.',
                acceptance: ['Amortize variable bonus over 12-month trailing window'],
              },
            ],
          },
          {
            title: 'Loan Sanction & Disbursement Management',
            desc: 'Generate sanction letter, record e-Sign verification, and initiate bank account penny drop.',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Connect automated penny drop bank account verification API',
                type: WorkItemType.TASK,
                status: WorkItemStatus.IN_REVIEW,
                priority: WorkItemPriority.HIGH,
                sp: 5,
                desc: 'Deposit 1 rupee into borrower account and verify beneficiary name matches application.',
                acceptance: ['Reconciles IMPS reference and account validity instantly'],
              },
              {
                title: 'Overdue high-value loan application review escalation',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.HIGH,
                sp: 3,
                desc: 'Notify senior credit manager on loan applications > 20 Lakhs pending review > 48h.',
                acceptance: ['Sends high-priority escalation ping with application reference'],
              },
            ],
          },
        ],
      },
      {
        title: 'Portfolio Audit & Regulatory Compliance',
        desc: 'Audit trails for credit decisions, fair lending compliance checks, and disbursement ledgers.',
        stories: [
          {
            title: 'Credit Decision Explainability & Audit Log',
            desc: 'Store full snapshot of applicant financials, rule evaluations, and underwriter notes.',
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            tasks: [
              {
                title: 'Compile immutable underwriting decision package archive',
                type: WorkItemType.TASK,
                status: WorkItemStatus.TODO,
                priority: WorkItemPriority.MEDIUM,
                sp: 5,
                desc: 'Bundle applicant docs, OCR extracts, and rule outcomes into cryptographically sealed zip.',
                acceptance: ['Compliant with RBI digital lending audit storage guidelines'],
              },
            ],
          },
        ],
      },
    ],
  },
];

