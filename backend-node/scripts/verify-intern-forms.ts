import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const BASE_URL = 'http://127.0.0.1:3001/api';

const ALLOWED_TEST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function safeEndpoint(baseUrl: string, ...segments: string[]): string {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Rejected unsafe protocol: ${parsed.protocol}`);
  }
  if (!ALLOWED_TEST_HOSTS.has(parsed.hostname)) {
    throw new Error(`Rejected unauthorized destination host: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Rejected embedded credentials in URL');
  }

  const basePrefix = parsed.pathname.replace(/\/+$/, '');
  const encodedSegments: string[] = [];

  for (const raw of segments) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
      throw new Error('Empty path segment rejected');
    }

    let decoded = trimmed;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      throw new Error(`Malformed URL segment encoding: ${trimmed}`);
    }

    if (
      decoded.includes('..') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('?') ||
      decoded.includes('#') ||
      /[\x00-\x1F\x7F]/.test(decoded) ||
      /^(https?:|file:|data:|javascript:|\/\/)/i.test(decoded)
    ) {
      throw new Error(`Potential SSRF or path traversal in segment: ${trimmed}`);
    }

    if (!/^[a-zA-Z0-9_\-\.:]+$/.test(decoded)) {
      throw new Error(`Segment contains disallowed characters: ${trimmed}`);
    }

    encodedSegments.push(encodeURIComponent(decoded));
  }

  parsed.pathname = `${basePrefix}/${encodedSegments.join('/')}`;
  parsed.search = '';
  parsed.hash = '';

  if (!parsed.pathname.startsWith(basePrefix)) {
    throw new Error('Resolved path escaped permitted boundary');
  }

  return parsed.toString();
}

function safeFormEndpoint(baseUrl: string, formId: string, subPath?: string): string {
  const subSegments = subPath ? subPath.split('/').filter(Boolean) : [];
  return safeEndpoint(baseUrl, 'forms', formId, ...subSegments);
}

async function main() {
  console.log('================================================================');
  console.log('INTERN FORMS: QUESTION FIELD EDITING & SUBMISSION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Setup Organization, Manager, and Intern
  console.log('1. Setup Org, Manager & Intern');
  let org = await prisma.organization.findFirst({
    where: { name: { contains: 'Dailoqa', mode: 'insensitive' } }
  });
  if (!org) {
    org = await prisma.organization.findFirst();
  }
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'Dailoqa' } });
  }

  // Authenticate Manager
  const mgrLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@dailoqa.com',
      password: 'password123',
      organization_id: org.id,
    }),
  });
  const mgrData: any = await mgrLoginRes.json();
  const mgrToken = mgrData.accessToken;
  assert(Boolean(mgrToken), 'Manager authenticated');

  // Authenticate or Create Intern
  let internPassword = 'password123';
  let intern = await prisma.user.findFirst({
    where: { organization_id: org.id, roles: { some: { role: { name: 'INTERN' } } }, is_active: true }
  });
  if (!intern) {
    const internRole = await prisma.role.findFirst({ where: { name: 'INTERN' } });
    intern = await prisma.user.create({
      data: {
        email: `intern.forms.${Date.now()}@dailoqa.com`,
        name: 'Forms Test Intern',
        password_hash: await argon2.hash(internPassword),
        organization_id: org.id,
        user_code: `INT-${Date.now().toString().slice(-4)}`,
        is_active: true,
        must_change_password: false,
        roles: internRole ? { create: { role_id: internRole.id } } : undefined
      }
    });
  } else {
    // Reset password so login is guaranteed
    await prisma.user.update({
      where: { id: intern.id },
      data: {
        password_hash: await argon2.hash(internPassword),
        must_change_password: false,
      }
    });
  }

  const internLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: intern.email,
      password: internPassword,
      organization_id: org.id,
    }),
  });
  const internData: any = await internLoginRes.json();
  const internToken = internData.accessToken;
  assert(Boolean(internToken), 'Intern authenticated');

  const mgrHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mgrToken}` };
  const internHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internToken}` };

  // 2. Manager creates form with questions
  console.log('\n2. Manager Creates Form with Questions');
  const createFormRes = await fetch(`${BASE_URL}/forms`, {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      title: 'Sprint Retrospective & Skill Survey',
      description: 'Please answer all fields accurately.',
      target_roles: ['INTERN'],
      deadline: new Date(Date.now() + 86400000).toISOString()
    })
  });
  const createFormData: any = await createFormRes.json();
  const formId = createFormData.form.id;
  assert(createFormRes.status === 201 && Boolean(formId), 'Manager created draft form');

  // Add questions
  const q1Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'SHORT_TEXT',
      text: 'What was your primary achievement this week?',
      is_required: true,
    })
  });
  const q1 = (await q1Res.json()).question;

  const q2Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'LONG_TEXT',
      text: 'Describe any technical blockers or architecture challenges you faced:',
      is_required: false,
    })
  });
  const q2 = (await q2Res.json()).question;

  const q3Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'SINGLE_SELECT',
      text: 'Preferred Standup Time',
      options: ['9:30 AM', '11:00 AM', '2:00 PM'],
      is_required: true,
    })
  });
  const q3 = (await q3Res.json()).question;

  const q4Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'MULTI_SELECT',
      text: 'Technologies utilized this sprint',
      options: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
      is_required: true,
    })
  });
  const q4 = (await q4Res.json()).question;

  const q5Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'BOOLEAN',
      text: 'Were all assigned tickets merged and reviewed?',
      is_required: true,
    })
  });
  const q5 = (await q5Res.json()).question;

  const q6Res = await fetch(safeFormEndpoint(BASE_URL, formId, 'questions'), {
    method: 'POST',
    headers: mgrHeaders,
    body: JSON.stringify({
      type: 'NUMBER',
      text: 'Estimated hours spent on code review',
      is_required: false,
    })
  });
  const q6 = (await q6Res.json()).question;

  assert(Boolean(q1 && q2 && q3 && q4 && q5 && q6), 'All 6 question types added successfully');

  // Publish Form
  const pubRes = await fetch(safeFormEndpoint(BASE_URL, formId, 'publish'), {
    method: 'POST',
    headers: mgrHeaders,
  });
  assert(pubRes.status === 200, 'Form published by manager');

  // 3. Intern queries forms and gets questions
  console.log('\n3. Intern Queries Forms List (Questions Must Be Present)');
  const internFormsRes = await fetch(`${BASE_URL}/forms`, { headers: internHeaders });
  const internFormsData: any = await internFormsRes.json();
  const fetchedForm = internFormsData.forms.find((f: any) => f.id === formId);

  assert(Boolean(fetchedForm), 'Intern can see the published form');
  assert(Array.isArray(fetchedForm?.questions), 'Form contains questions array');
  assert(fetchedForm?.questions?.length === 6, 'Form contains all 6 configured questions');
  assert(fetchedForm.questions[0].text === 'What was your primary achievement this week?', 'Question text is properly loaded');
  assert(Array.isArray(fetchedForm.questions[2].options) && fetchedForm.questions[2].options.length === 3, 'SINGLE_SELECT options loaded');
  assert(Array.isArray(fetchedForm.questions[3].options) && fetchedForm.questions[3].options.length === 5, 'MULTI_SELECT options loaded');

  // 4. Intern Submits Field Answers
  console.log('\n4. Intern Submits Answers to All Question Types');
  const submitAnswersPayload = [
    {
      question_id: q1.id,
      value_string: 'Completed and verified user management deactivation module',
    },
    {
      question_id: q2.id,
      value_string: 'Initial test setup required tsx instead of ts-node, resolved cleanly.',
    },
    {
      question_id: q3.id,
      value_string: '11:00 AM',
    },
    {
      question_id: q4.id,
      value_array: ['React', 'TypeScript', 'Node.js'],
    },
    {
      question_id: q5.id,
      value_boolean: true,
    },
    {
      question_id: q6.id,
      value_number: 4.5,
    },
  ];

  const submitRes = await fetch(safeFormEndpoint(BASE_URL, formId, 'submissions'), {
    method: 'POST',
    headers: internHeaders,
    body: JSON.stringify({ answers: submitAnswersPayload })
  });
  const submitData: any = await submitRes.json();
  assert(submitRes.status === 201 && Boolean(submitData.submission), 'Intern submitted answers successfully');

  // 5. Verify Submissions in DB
  console.log('\n5. Verify Submission Content & Lock State');
  const mySubRes = await fetch(safeFormEndpoint(BASE_URL, formId, 'submissions/my'), { headers: internHeaders });
  const mySubData: any = await mySubRes.json();
  assert(Boolean(mySubData.submission), 'GET /forms/:id/submissions/my returns saved submission');
  const savedAnswers = mySubData.submission.answers;
  assert(savedAnswers.length === 6, 'All 6 answers persisted in submission');

  const savedQ1 = savedAnswers.find((a: any) => a.question_id === q1.id);
  assert(savedQ1?.value_string === 'Completed and verified user management deactivation module', 'Q1 SHORT_TEXT answer verified');

  const savedQ4 = savedAnswers.find((a: any) => a.question_id === q4.id);
  assert(Array.isArray(savedQ4?.value_array) && savedQ4.value_array.includes('React'), 'Q4 MULTI_SELECT array answer verified');

  const savedQ5 = savedAnswers.find((a: any) => a.question_id === q5.id);
  assert(savedQ5?.value_boolean === true, 'Q5 BOOLEAN answer verified');

  const savedQ6 = savedAnswers.find((a: any) => a.question_id === q6.id);
  assert(savedQ6?.value_number === 4.5, 'Q6 NUMBER answer verified');

  // 6. Duplicate Submission Protection
  console.log('\n6. Duplicate Submission Prevention');
  const dupSubmitRes = await fetch(safeFormEndpoint(BASE_URL, formId, 'submissions'), {
    method: 'POST',
    headers: internHeaders,
    body: JSON.stringify({ answers: submitAnswersPayload })
  });
  assert(dupSubmitRes.status === 400, 'Duplicate submission correctly rejected with 400 Bad Request');

  // 7. Cleanup
  console.log('\n7. Cleanup Test Records');
  await prisma.submissionAnswer.deleteMany({ where: { submission: { form_id: formId } } });
  await prisma.formSubmission.deleteMany({ where: { form_id: formId } });
  await prisma.formQuestion.deleteMany({ where: { form_id: formId } });
  await prisma.form.delete({ where: { id: formId } });
  console.log('   Cleaned up test form and submissions.');

  console.log('\n================================================================');
  console.log(`INTERN FORMS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error('Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
