import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Channel Audience Card Removal Test Suite', () => {
  const managerChannelViewPath = path.join(__dirname, '../components/channels/TeamsChannelView.jsx');
  const internAssignedFormsPath = path.join(__dirname, '../features/intern/components/AssignedFormsTab.jsx');

  const managerChannelContent = fs.readFileSync(managerChannelViewPath, 'utf8');
  const internAssignedFormsContent = fs.readFileSync(internAssignedFormsPath, 'utf8');

  test('1. Manager Dashboard TeamsChannelView does not render Channel Audience card', () => {
    assert.doesNotMatch(
      managerChannelContent,
      /Channel Audience/i,
      'Manager TeamsChannelView must not contain "Channel Audience" heading or text'
    );
    assert.doesNotMatch(
      managerChannelContent,
      /Forms posted by the Manager are visible to active/i,
      'Manager TeamsChannelView must not contain Channel Audience descriptive text'
    );
    assert.doesNotMatch(
      managerChannelContent,
      /Target Cohort Info/i,
      'Target Cohort Info comment/card must be removed'
    );
  });

  test('2. Intern Dashboard AssignedFormsTab does not render Channel Audience card', () => {
    assert.doesNotMatch(
      internAssignedFormsContent,
      /Channel Audience/i,
      'Intern AssignedFormsTab must not contain "Channel Audience" heading or text'
    );
    assert.doesNotMatch(
      internAssignedFormsContent,
      /Forms posted by the Manager are visible to active/i,
      'Intern AssignedFormsTab must not contain Channel Audience descriptive text'
    );
    assert.doesNotMatch(
      internAssignedFormsContent,
      /Target Cohort Info/i,
      'Target Cohort Info comment/card must be removed'
    );
  });

  test('3. Cohort scoping and core forms functionality remain preserved', () => {
    // Manager side preserves cohort parameter handling
    assert.match(
      managerChannelContent,
      /selectedCohortId/,
      'Manager TeamsChannelView must preserve selectedCohortId'
    );
    assert.match(
      managerChannelContent,
      /formsService\.getForms\(selectedCohortId\)/,
      'Manager TeamsChannelView must preserve forms fetching with cohort scope'
    );

    // Intern side preserves forms rendering and channel switching
    assert.match(
      internAssignedFormsContent,
      /activeChannel/,
      'Intern AssignedFormsTab must preserve active channel state'
    );
    assert.match(
      internAssignedFormsContent,
      /forms-and-surveys/,
      'Intern AssignedFormsTab must preserve forms-and-surveys channel'
    );
  });
});

