import * as fs from 'fs';
import * as path from 'path';

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: {
    method: string;
    url: { raw: string; host: string[]; path: string[]; query?: any[] };
    header: { key: string; value: string }[];
    body?: { mode: string; raw?: string; formdata?: any[] };
    auth?: { type: string; bearer?: { key: string; value: string }[] };
  };
}

async function main() {
  console.log('===============================================================');
  console.log('EXECUTING POSTMAN COLLECTION TEST RUNNER AGAINST LOCAL BACKEND');
  console.log('===============================================================\n');

  const rootDir = path.resolve(__dirname, '../../');
  const collPath = path.join(rootDir, 'postman', 'InternHub_API_Collection.json');
  const envPath = path.join(rootDir, 'postman', 'InternHub_Local.postman_environment.json');

  const collection = JSON.parse(fs.readFileSync(collPath, 'utf8'));
  const envData = JSON.parse(fs.readFileSync(envPath, 'utf8'));

  const variables = new Map<string, string>();
  for (const v of envData.values) {
    variables.set(v.key, v.value);
  }

  function resolveVars(template: string): string {
    return template.replace(/\{\{([a-zA-Z0-9_$]+)\}\}/g, (_, key) => {
      if (key === '$timestamp' || key === 'timestamp' || key === 'dynamicTimestamp') {
        return Date.now().toString();
      }
      return variables.get(key) || `{{${key}}}`;
    });
  }

  let totalExecuted = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const skippedList: string[] = [];

  async function executeRequest(item: PostmanItem) {
    if (!item.request) return;

    let rawUrl = resolveVars(item.request.url.raw);
    if (rawUrl.includes('{{')) {
      // Unresolved variable in URL
      skippedList.push(`${item.name} (Prerequisite variable unpopulated: ${rawUrl})`);
      return;
    }

    const headers: Record<string, string> = {};
    for (const h of item.request.header) {
      headers[h.key] = resolveVars(h.value);
    }

    if (item.request.auth?.type === 'bearer') {
      const tokenVar = item.request.auth.bearer?.[0]?.value || '{{accessToken}}';
      const resolvedToken = resolveVars(tokenVar);
      if (resolvedToken && !resolvedToken.includes('{{')) {
        headers['Authorization'] = `Bearer ${resolvedToken}`;
      }
    }

    let body: string | undefined = undefined;
    if (item.request.body?.mode === 'raw' && item.request.body.raw) {
      body = resolveVars(item.request.body.raw);
    }

    totalExecuted++;
    try {
      const res = await fetch(rawUrl, {
        method: item.request.method,
        headers,
        body: ['GET', 'HEAD'].includes(item.request.method) ? undefined : body,
      });

      const contentType = res.headers.get('content-type') || '';
      let json: any = null;
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
      }

      // Check if status is acceptable (2xx, or expected negative 4xx)
      const isNegativeTest = item.name.toLowerCase().includes('negative');
      const isExpected = isNegativeTest ? res.status >= 400 && res.status < 500 : res.status >= 200 && res.status < 300;

      if (isExpected) {
        totalPassed++;
        console.log(`[PASS] [${res.status}] ${item.request.method} ${item.name}`);
      } else {
        totalFailed++;
        console.log(`[WARN] [${res.status}] ${item.request.method} ${item.name} - Message: ${json?.error || res.statusText}`);
      }

      // Auto-extract dynamic variables
      if (json && res.status >= 200 && res.status < 300) {
        if (item.name.includes('Super Admin') && json.accessToken) {
          variables.set('superAdminToken', json.accessToken);
        } else if (item.name.includes('Intern') && json.accessToken) {
          variables.set('internToken', json.accessToken);
        } else if (json.accessToken) {
          variables.set('accessToken', json.accessToken);
        }

        if (json.refreshToken) variables.set('refreshToken', json.refreshToken);
        if (json.sessionId) variables.set('sessionId', json.sessionId);
        if (json.user?.id) variables.set('managerUserId', json.user.id);
        if (json.user?.organization_id) variables.set('organizationId', json.user.organization_id);

        if (json.organizations && Array.isArray(json.organizations) && json.organizations.length > 0) {
          variables.set('testOrgId', json.organizations[0].id);
        }
        if (item.name.includes('Create Organization')) {
          const orgId = json.id || json.organization?.id;
          if (orgId) variables.set('testOrgId', orgId);
          if (json.manager?.id) variables.set('testManagerId', json.manager.id);
        }

        if (json.projects && Array.isArray(json.projects) && json.projects.length > 0) {
          variables.set('projectId', json.projects[0].id);
        }
        if (item.name.includes('Create Temporary Project')) {
          const id = json.id || json.project?.id;
          if (id) variables.set('testProjectId', id);
        }

        if (json.sprints && Array.isArray(json.sprints) && json.sprints.length > 0) {
          variables.set('sprintId', json.sprints[0].id);
        }
        if (item.name.includes('Create New Sprint')) {
          const id = json.id || json.sprint?.id;
          if (id) variables.set('testSprintId', id);
        }

        if (json.work_items && Array.isArray(json.work_items) && json.work_items.length > 0) {
          variables.set('workItemId', json.work_items[0].id);
        }
        if (item.name.includes('Create EPIC')) {
          const id = json.id || json.work_item?.id;
          if (id) {
            variables.set('epicId', id);
            variables.set('workItemId', id);
          }
        }
        if (item.name.includes('Create STORY')) {
          const id = json.id || json.work_item?.id;
          if (id) variables.set('storyId', id);
        }
        if (item.name.includes('Create Intern Personal Task')) {
          const id = json.id || json.work_item?.id;
          if (id) {
            variables.set('internTaskId', id);
          }
        }
        if (item.name.includes('Create TASK')) {
          const id = json.id || json.work_item?.id;
          if (id) {
            variables.set('taskId', id);
            variables.set('workItemId', id);
          }
        }
        if (item.name.includes('Create SUBTASK')) {
          const id = json.id || json.work_item?.id;
          if (id) variables.set('subtaskId', id);
        }

        if (json.users && Array.isArray(json.users) && json.users.length > 0) {
          variables.set('internUserId', json.users[0].id);
        }
        if (item.name.includes('Provision Single Intern')) {
          const id = json.id || json.user?.id;
          if (id) variables.set('createdUserId', id);
        }

        if (json.forms && Array.isArray(json.forms) && json.forms.length > 0) {
          variables.set('formId', json.forms[0].id);
        }
        if (item.name.includes('Create New Form')) {
          const id = json.id || json.form?.id;
          if (id) {
            variables.set('testFormId', id);
            variables.set('formId', id);
          }
        }
        if (item.name.includes('Add Question')) {
          const id = json.id || json.question?.id;
          if (id) variables.set('questionId', id);
        }

        if (json.notifications && Array.isArray(json.notifications) && json.notifications.length > 0) {
          variables.set('notificationId', json.notifications[0].id);
        }
        if (item.name.includes('Create Broadcast Notification')) {
          const id = json.id || json.notification?.id;
          if (id) variables.set('notificationId', id);
        }

        if (item.name.includes('Create Manual Time Entry')) {
          const id = json.id || json.entry?.id;
          if (id) variables.set('timeEntryId', id);
        }
        if (item.name.includes('Request Time Correction')) {
          const id = json.id || json.correction?.id || json.request?.request_id || json.request?.id;
          if (id) variables.set('timeCorrectionId', id);
        }

        if (json.action_items && Array.isArray(json.action_items) && json.action_items.length > 0) {
          variables.set('actionItemId', json.action_items[0].id);
        }
        if (item.name.includes('Create Action Item')) {
          const id = json.id || json.item?.id;
          if (id) variables.set('actionItemId', id);
        }
      }
    } catch (err: any) {
      totalFailed++;
      console.error(`[FAIL] ${item.request.method} ${item.name} - Exception: ${err.message}`);
    }
  }

  async function walk(folder: PostmanItem) {
    if (folder.item) {
      console.log(`\n--- Folder: ${folder.name} ---`);
      for (const child of folder.item) {
        await walk(child);
      }
    } else {
      await executeRequest(folder);
    }
  }

  for (const topFolder of collection.item) {
    await walk(topFolder);
  }

  console.log('\n===============================================================');
  console.log('EXECUTION SUMMARY');
  console.log('===============================================================');
  console.log(`Total Requests Tested: ${totalExecuted}`);
  console.log(`Passed / Expected: ${totalPassed}`);
  console.log(`Failed / Unexpected: ${totalFailed}`);
  console.log(`Prerequisite Skipped: ${skippedList.length}`);
  if (skippedList.length > 0) {
    console.log('\nSkipped Requests (Dependent on prior optional resource creation):');
    skippedList.slice(0, 10).forEach((s) => console.log(' - ' + s));
    if (skippedList.length > 10) console.log(` ... and ${skippedList.length - 10} more`);
  }
  console.log('===============================================================\n');
}

main().catch(console.error);
