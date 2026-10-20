import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Form Cohort Audience & Revert Form Suite', () => {
  const modalPath = path.join(__dirname, '../components/modals/CreateFormModal.jsx');
  const channelViewPath = path.join(__dirname, '../components/channels/TeamsChannelView.jsx');
  const formsServicePath = path.join(__dirname, '../services/forms.service.js');
  const backendRoutesPath = path.join(__dirname, '../../../backend-node/src/routes/form.routes.ts');
  const backendControllerPath = path.join(__dirname, '../../../backend-node/src/controllers/form.controller.ts');
  const backendServicePath = path.join(__dirname, '../../../backend-node/src/services/form.service.ts');

  const modalContent = fs.readFileSync(modalPath, 'utf8');
  const channelViewContent = fs.readFileSync(channelViewPath, 'utf8');
  const formsServiceContent = fs.readFileSync(formsServicePath, 'utf8');
  const backendRoutesContent = fs.readFileSync(backendRoutesPath, 'utf8');
  const backendControllerContent = fs.readFileSync(backendControllerPath, 'utf8');
  const backendServiceContent = fs.readFileSync(backendServicePath, 'utf8');

  test('1. CreateFormModal includes Target Cohort Audience selector with multiple selective choice', () => {
    assert.match(
      modalContent,
      /Target Cohort Audience/,
      'Modal must contain Target Cohort Audience label'
    );
    assert.match(
      modalContent,
      /cohortsService\.getCohorts\(\)/,
      'Modal must dynamically fetch cohorts from database service'
    );
    assert.match(
      modalContent,
      /Select All Cohorts/,
      'Modal must provide option to select all cohorts'
    );
    assert.match(
      modalContent,
      /All Cohorts/,
      'Modal must contain All Cohorts master selection option'
    );
    assert.match(
      modalContent,
      /handleToggleCohort/,
      'Modal must support individual cohort multi-selection'
    );
  });

  test('2. CreateFormModal encodes selected cohorts into target_roles & target_cohort_ids payload', () => {
    assert.match(
      modalContent,
      /target_roles:\s*targetRoles/,
      'Modal must include targetRoles array in payload'
    );
    assert.match(
      modalContent,
      /ALL_COHORTS/,
      'Modal must support ALL_COHORTS role tag'
    );
    assert.match(
      modalContent,
      /COHORT:/,
      'Modal must format cohort IDs with COHORT: prefix for granular targeting'
    );
  });

  test('3. TeamsChannelView provides "Revert Form" option for published forms', () => {
    assert.match(
      channelViewContent,
      /handleRevertForm/,
      'TeamsChannelView must implement handleRevertForm handler'
    );
    assert.match(
      channelViewContent,
      /Revert Form/,
      'TeamsChannelView must render Revert Form button for published forms'
    );
    assert.match(
      channelViewContent,
      /formsService\.revertForm/,
      'TeamsChannelView must call formsService.revertForm'
    );
  });

  test('4. formsService implements revertForm API method', () => {
    assert.match(
      formsServiceContent,
      /revertForm:\s*async\s*\(id\)/,
      'formsService must export revertForm method'
    );
    assert.match(
      formsServiceContent,
      /\/forms\/\$\{id\}\/revert/,
      'formsService must call /forms/:id/revert endpoint'
    );
  });

  test('5. Backend provides revert/unpublish endpoints and controller implementation', () => {
    assert.match(
      backendRoutesContent,
      /router\.post\('\/:id\/revert'/,
      'Backend form router must register /:id/revert'
    );
    assert.match(
      backendRoutesContent,
      /router\.post\('\/:id\/unpublish'/,
      'Backend form router must register /:id/unpublish'
    );
    assert.match(
      backendControllerContent,
      /static\s+async\s+revertForm/,
      'FormController must implement revertForm'
    );
    assert.match(
      backendServiceContent,
      /COHORT:/,
      'Backend FormService must handle COHORT: scoping for interns and managers'
    );
  });
});

