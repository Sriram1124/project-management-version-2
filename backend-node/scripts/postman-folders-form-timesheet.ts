import { makeUrl, jsonHeader, acceptHeader, bearerAuth, noAuth, testScript, prerequestScript } from './postman-helpers';

export function getFormTimesheetFolders(): any[] {
  const folders: any[] = [];

  // =========================================================================
  // 09. FORMS & EVALUATIONS MODULE
  // =========================================================================
  folders.push({
    name: '09. Forms & Evaluations',
    description: 'Dynamic form creation, question authoring, publishing lifecycle, intern responses, submissions review, overdue tracking, and CSV/Excel exports.',
    item: [
      {
        name: 'List Organization Forms (GET /api/forms)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms'),
          description: 'Lists forms filtered by user role and target cohort.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Captures existing formId if present", function () {',
            '    var data = pm.response.json();',
            '    var forms = data.forms || data.data || data;',
            '    if (Array.isArray(forms) && forms.length > 0) {',
            '        pm.collectionVariables.set("formId", forms[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Overdue Forms Summary (GET /api/forms/overdue/summary)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms/overdue/summary'),
          description: 'Aggregates non-compliant or overdue submissions per cohort.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Export Overdue Report CSV (GET /api/forms/overdue/export)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [{ key: 'Accept', value: 'text/csv' }],
          url: makeUrl('api/forms/overdue/export', [
            { key: 'format', value: 'csv' },
          ]),
          description: 'Generates and downloads CSV export of overdue members.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Create New Form (POST /api/forms)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              title: 'Weekly Progress Evaluation {{dynamicTimestamp}}',
              description: 'Weekly mandatory self-assessment form for technical interns.',
              target_roles: ['INTERN'],
              deadline: '2027-01-01T00:00:00.000Z',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/forms'),
          description: 'Manager authors a new DRAFT form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201", function () {',
            '    pm.response.to.have.status(201);',
            '});',
            'pm.test("Captures testFormId", function () {',
            '    var data = pm.response.json();',
            '    var id = data.id || (data.form && data.form.id);',
            '    pm.expect(id).to.be.ok;',
            '    pm.collectionVariables.set("testFormId", id);',
            '    pm.collectionVariables.set("formId", id);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Form by ID (GET /api/forms/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId'),
          description: 'Retrieves form definition including question list.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Add Question to Form (POST /api/forms/:id/questions)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              question_text: 'What major deliverables did you complete this week?',
              question_type: 'TEXT',
              is_required: true,
              order_index: 0,
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/forms/:testFormId/questions'),
          description: 'Adds a question field to the form in DRAFT status.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201", function () {',
            '    pm.response.to.have.status(201);',
            '});',
            'pm.test("Captures questionId", function () {',
            '    var data = pm.response.json();',
            '    var id = data.id || (data.question && data.question.id);',
            '    pm.expect(id).to.be.ok;',
            '    pm.collectionVariables.set("questionId", id);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Question (PATCH /api/forms/:id/questions/:questionId)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              question_text: 'Updated: What major engineering deliverables did you complete this week?',
              is_required: false,
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/forms/:testFormId/questions/:questionId'),
          description: 'Updates question prompt or constraints.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Form Metadata (PATCH /api/forms/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              title: 'Revised Weekly Progress Evaluation {{dynamicTimestamp}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/forms/:testFormId'),
          description: 'Updates form title, description, or target roles.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Publish Form (POST /api/forms/:id/publish)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/publish'),
          description: 'Transitions form to PUBLISHED, making it available for submission by target users.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Current User Form Submission (GET /api/forms/:id/submissions/my)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/submissions/my'),
          description: 'Checks if current authenticated user has already submitted this form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Submit Form Response (POST /api/forms/:id/submissions)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              answers: [
                {
                  question_id: '{{questionId}}',
                  value_text: 'Completed authentication test automation suite with zero regressions.',
                },
              ],
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/forms/:testFormId/submissions'),
          description: 'Submits user answers to the published form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 400 (if already submitted)", function () {',
            '    pm.expect([201, 400]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        var id = data.id || (data.submission && data.submission.id);',
            '        pm.collectionVariables.set("submissionId", id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'List Form Submissions (GET /api/forms/:id/submissions)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/submissions'),
          description: 'Manager reviews all submitted answers for the form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Revert Form to Draft (POST /api/forms/:id/revert)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/revert'),
          description: 'Reverts a published form back to DRAFT.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Unpublish Form Alias (POST /api/forms/:id/unpublish)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/unpublish'),
          description: 'Endpoint alias for unpublishing / reverting form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Archive Form (POST /api/forms/:id/archive)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/archive'),
          description: 'Archives form, preventing further edits or submissions.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Delete Question (DELETE /api/forms/:id/questions/:questionId)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'DELETE',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId/questions/:questionId'),
          description: 'Deletes question from form.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Delete Form (DELETE /api/forms/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'DELETE',
          header: [acceptHeader],
          url: makeUrl('api/forms/:testFormId'),
          description: 'Deletes temporary test form and cascades submissions.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Non-Existent Form (GET /api/forms/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/forms/00000000-0000-0000-0000-000000000000'),
          description: 'Ensures 404 is returned for invalid form ID.',
        },
        event: [
          testScript([
            'pm.test("Status code is 404", function () {',
            '    pm.response.to.have.status(404);',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 10. NOTIFICATIONS MODULE
  // =========================================================================
  folders.push({
    name: '10. Notifications',
    description: 'Notifications dispatching (Direct, Broadcast, System), unread count tracking, archiving, and read status.',
    item: [
      {
        name: 'List User Notifications (GET /api/notifications)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/notifications'),
          description: 'Lists all notifications received by the authenticated user.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Captures notificationId if available", function () {',
            '    var data = pm.response.json();',
            '    var notifs = data.notifications || data.data || data;',
            '    if (Array.isArray(notifs) && notifs.length > 0) {',
            '        pm.collectionVariables.set("notificationId", notifs[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Unread Count (GET /api/notifications/unread-count)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/notifications/unread-count'),
          description: 'Gets total unread badge count for authenticated user.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Unread count is a non-negative number", function () {',
            '    var data = pm.response.json();',
            '    pm.expect(data).to.have.property("count");',
            '    pm.expect(data.count).to.be.at.least(0);',
            '});',
          ]),
        ],
      },
      {
        name: 'Create Broadcast Notification (POST /api/notifications)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              title: 'Platform Maintenance Notice {{dynamicTimestamp}}',
              message: 'Automated Postman broadcast test notification: scheduled maintenance tonight.',
              type: 'BROADCAST',
              recipient_ids: ['ALL_INTERNS'],
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/notifications'),
          description: 'Manager creates broadcast notification dispatched to all organization interns.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201", function () {',
            '    pm.response.to.have.status(201);',
            '});',
            'pm.test("Captures notificationId", function () {',
            '    var data = pm.response.json();',
            '    var id = data.id || (data.notification && data.notification.id);',
            '    pm.expect(id).to.be.ok;',
            '    pm.collectionVariables.set("notificationId", id);',
            '});',
          ]),
        ],
      },
      {
        name: 'Mark Single Notification as Read (PATCH /api/notifications/:id/read)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [acceptHeader],
          url: makeUrl('api/notifications/:notificationId/read'),
          description: 'Marks a specific notification as read for current user.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Mark Notification Read Alias (PATCH /api/notifications/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [acceptHeader],
          url: makeUrl('api/notifications/:notificationId'),
          description: 'Alias route for marking notification as read.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Mark All Notifications as Read (PATCH /api/notifications/read-all)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [acceptHeader],
          url: makeUrl('api/notifications/read-all'),
          description: 'Marks all unread notifications as read for current user.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Archive Notification (PATCH /api/notifications/:id/archive)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [acceptHeader],
          url: makeUrl('api/notifications/:notificationId/archive'),
          description: 'Archives notification from active inbox.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Unarchive Notification (PATCH /api/notifications/:id/unarchive)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [acceptHeader],
          url: makeUrl('api/notifications/:notificationId/unarchive'),
          description: 'Restores notification back to inbox.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Create Notification Missing Title (POST /api/notifications)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              message: 'Missing title in payload',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/notifications'),
          description: 'Verifies missing title is rejected with 400/500 validation error.',
        },
        event: [
          testScript([
            'pm.test("Status code is 400 or 500", function () {',
            '    pm.expect([400, 500]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 11. TIMESHEETS & ATTENDANCE MODULE
  // =========================================================================
  folders.push({
    name: '11. Timesheets & Attendance',
    description: 'Work policy enforcement, clock in/out sessions, manual time entries, weekly/monthly timesheets, manager reviews, and time correction requests.',
    item: [
      {
        name: 'Get Organization Policy (GET /api/timesheet/organization-policy)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/organization-policy'),
          description: 'Retrieves organization working hours, cutoff time (6:15 PM IST), and lunch breaks.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Upsert Organization Policy (PUT /api/timesheet/organization-policy)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'PUT',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              office_start_time: '09:00',
              office_end_time: '18:15',
              break_start_time: '13:00',
              break_end_time: '14:00',
              lunch_break_minutes: 60,
              timezone: 'Asia/Kolkata',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/organization-policy'),
          description: 'Administrator updates daily office policy parameters.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403", function () {',
            '    pm.expect([200, 403]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Start Work Session (POST /api/timesheet/work-sessions/start)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              session_type: 'WORK',
              description: 'Active testing session started by Postman runner.',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/work-sessions/start'),
          description: 'Clocks user in and starts tracking session time.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201, 400, or 403", function () {',
            '    pm.expect([201, 400, 403]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Active Work Session (GET /api/timesheet/work-sessions/active)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/work-sessions/active'),
          description: 'Returns active session details if user is currently clocked in.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'End Work Session (POST /api/timesheet/work-sessions/end)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              notes: 'Testing session completed.',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/work-sessions/end'),
          description: 'Clocks user out and records duration.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200, 400, or 404", function () {',
            '    pm.expect([200, 400, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Create Manual Time Entry (POST /api/timesheet/time-entries)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              task_id: '{{internTaskId}}',
              duration_minutes: 120,
              description: 'Manual task time logged via automated Postman test.',
              date: new Date().toISOString().split('T')[0],
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/time-entries'),
          description: 'Logs manual time entry against user timesheet.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 400/403", function () {',
            '    pm.expect([201, 400, 403]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        var id = data.id || (data.entry && data.entry.id);',
            '        if (id) {',
            '            pm.collectionVariables.set("timeEntryId", id);',
            '            if (pm.environment) { pm.environment.set("timeEntryId", id); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Time Entry (PATCH /api/timesheet/time-entries/:id)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              duration_minutes: 150,
              description: 'Updated duration to 150 mins.',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/time-entries/:timeEntryId'),
          description: 'Updates manual time entry duration or notes.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 400/403/404", function () {',
            '    pm.expect([200, 400, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Task Time Entries (GET /api/timesheet/tasks/:taskId/entries)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/tasks/:internTaskId/entries'),
          description: 'Lists all time logged on a specific task.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Today Timesheet (GET /api/timesheet/today)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/today'),
          description: 'Calculates today hours worked, break times, and status.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Weekly Timesheet (GET /api/timesheet/weekly)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/weekly'),
          description: 'Computes Monday-Sunday weekly matrix of hours worked.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Monthly Timesheet (GET /api/timesheet/monthly)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/monthly'),
          description: 'Computes monthly hours and attendance compliance.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Task Time Summary (GET /api/timesheet/task-time)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/task-time'),
          description: 'Breaks down logged time across individual projects and tasks.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Intern Report (GET /api/timesheet/intern-report)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/intern-report'),
          description: 'Intern attendance and deliverables report.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Manager Report (GET /api/timesheet/manager-report)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/manager-report'),
          description: 'Organization team attendance summary report.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Review Timesheets (GET /api/timesheet/review)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/review', [
            { key: 'period', value: 'WEEK' },
          ]),
          description: 'Manager and Tech Lead oversight review table for team timesheets.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Request Time Correction (POST /api/timesheet/corrections/request)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              time_entry_id: '{{timeEntryId}}',
              corrected_duration_minutes: 90,
              reason: 'Accidental overtime running over lunch break.',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/corrections/request'),
          description: 'Intern submits request to adjust clock-in/out times.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 400", function () {',
            '    pm.expect([201, 400]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        var id = (data.request && (data.request.request_id || data.request.id)) || (data.correction && data.correction.id) || data.id;',
            '        if (id) {',
            '            pm.collectionVariables.set("timeCorrectionId", id);',
            '            if (pm.environment) { pm.environment.set("timeCorrectionId", id); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'List Time Correction Requests (GET /api/timesheet/corrections)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/corrections'),
          description: 'Lists pending and reviewed time correction requests.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Review Time Correction (POST /api/timesheet/corrections/:requestId/review)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              decision: 'APPROVE',
              decision_note: 'Approved based on verified standup presence.',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/timesheet/corrections/:timeCorrectionId/review'),
          description: 'Manager approves or rejects time correction request.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 400/404", function () {',
            '    pm.expect([200, 400, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Delete Time Entry (DELETE /api/timesheet/time-entries/:id)',
        request: {
          auth: bearerAuth('internToken'),
          method: 'DELETE',
          header: [acceptHeader],
          url: makeUrl('api/timesheet/time-entries/:timeEntryId'),
          description: 'Removes manual time entry.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200, 204 or 400/403/404", function () {',
            '    pm.expect([200, 204, 400, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 12. ACTION ITEMS MODULE
  // =========================================================================
  folders.push({
    name: '12. Action Items',
    description: 'Meeting minutes and retrospective action items: assignment, priority, status tracking, and deletion.',
    item: [
      {
        name: 'List Action Items (GET /api/action-items)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/action-items'),
          description: 'Lists all action items for the user organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Captures existing actionItemId if available", function () {',
            '    var data = pm.response.json();',
            '    if (Array.isArray(data) && data.length > 0) {',
            '        pm.collectionVariables.set("actionItemId", data[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Create Action Item (POST /api/action-items)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              title: 'Resolve CI/CD pipeline intermittent failure {{dynamicTimestamp}}',
              description: 'Follow-up action item from sprint retrospective.',
              project_id: '{{projectId}}',
              priority: 'HIGH',
              status: 'OPEN',
              due_date: '2027-01-01T00:00:00.000Z',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/action-items'),
          description: 'Creates a new action item associated with project.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201", function () {',
            '    pm.response.to.have.status(201);',
            '});',
            'pm.test("Captures created actionItemId", function () {',
            '    var data = pm.response.json();',
            '    var id = data.id || (data.item && data.item.id);',
            '    pm.expect(id).to.be.ok;',
            '    pm.collectionVariables.set("actionItemId", id);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Action Item by ID (GET /api/action-items/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/action-items/:actionItemId'),
          description: 'Fetches action item details and status.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Action Item (PATCH /api/action-items/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              status: 'COMPLETED',
              priority: 'URGENT',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/action-items/:actionItemId'),
          description: 'Updates action item status, priority, or assignee.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Delete Action Item (DELETE /api/action-items/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'DELETE',
          header: [acceptHeader],
          url: makeUrl('api/action-items/:actionItemId'),
          description: 'Removes action item from project.',
        },
        event: [
          testScript([
            'pm.test("Status code is 204 or 404", function () {',
            '    pm.expect([204, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Non-Existent Action Item (GET /api/action-items/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/action-items/00000000-0000-0000-0000-000000000000'),
          description: 'Ensures querying invalid action item returns 404 Not Found.',
        },
        event: [
          testScript([
            'pm.test("Status code is 404", function () {',
            '    pm.response.to.have.status(404);',
            '});',
          ]),
        ],
      },
    ],
  });

  return folders;
}
