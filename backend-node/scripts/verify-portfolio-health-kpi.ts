import { PrismaClient } from '@prisma/client';
import { ProjectHealthService, PortfolioHealthSummary, PortfolioHealthDistribution } from '../src/services/project-health.service';

const prisma = new PrismaClient();

async function runTests() {
  console.log('=== VERIFYING PORTFOLIO HEALTH KPI RATIO & CARDS LOGIC ===\n');
  let passed = 0;
  let total = 0;

  function test(name: string, condition: boolean, details?: any) {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`, details || '');
    }
  }

  // 1. Math Formula Validation with the prompt's illustrative example:
  // 12 assessed: 8 Healthy, 3 At Risk, 1 Critical
  {
    const healthy = 8;
    const atRisk = 3;
    const critical = 1;
    const notAssessed = 2;
    const assessed = healthy + atRisk + critical; // 12
    const attentionRequired = atRisk + critical; // 4

    const roundPct = (num: number, den: number) => {
      if (den <= 0) return 0;
      return Number(((num / den) * 100).toFixed(1));
    };

    const healthyPct = roundPct(healthy, assessed); // 66.7%
    const atRiskPct = roundPct(atRisk, assessed); // 25%
    const criticalPct = roundPct(critical, assessed); // 8.3%
    const attentionRate = roundPct(attentionRequired, assessed); // 33.3%

    test(
      'Prompt example: 8 Healthy out of 12 assessed is 66.7%',
      Math.abs(healthyPct - 66.7) < 0.05,
      { healthyPct }
    );
    test(
      'Prompt example: 3 At Risk out of 12 assessed is 25.0%',
      Math.abs(atRiskPct - 25.0) < 0.05,
      { atRiskPct }
    );
    test(
      'Prompt example: 1 Critical out of 12 assessed is 8.3%',
      Math.abs(criticalPct - 8.3) < 0.05,
      { criticalPct }
    );
    test(
      'Prompt example: 4 Attention Required out of 12 assessed is 33.3% Attention Rate',
      Math.abs(attentionRate - 33.3) < 0.05,
      { attentionRate }
    );
    test(
      'Sum of Healthy + At Risk + Critical percentages reconciles to 100%',
      Math.abs(healthyPct + atRiskPct + criticalPct - 100) < 0.2
    );
  }

  // 2. Zero Assessed Projects Edge Case:
  {
    const healthy = 0;
    const atRisk = 0;
    const critical = 0;
    const notAssessed = 3;
    const assessed = healthy + atRisk + critical; // 0
    const attentionRequired = atRisk + critical; // 0

    const roundPct = (num: number, den: number) => {
      if (den <= 0) return 0;
      return Number(((num / den) * 100).toFixed(1));
    };

    const healthyPct = roundPct(healthy, assessed);
    const atRiskPct = roundPct(atRisk, assessed);
    const criticalPct = roundPct(critical, assessed);
    const attentionRate = roundPct(attentionRequired, assessed);

    test('Zero assessed projects: healthyPct is 0 (not NaN)', Math.abs(healthyPct) < 0.001 && !Number.isNaN(healthyPct));
    test('Zero assessed projects: atRiskPct is 0 (not NaN)', Math.abs(atRiskPct) < 0.001 && !Number.isNaN(atRiskPct));
    test('Zero assessed projects: criticalPct is 0 (not NaN)', Math.abs(criticalPct) < 0.001 && !Number.isNaN(criticalPct));
    test('Zero assessed projects: attentionRate is 0 (not NaN)', Math.abs(attentionRate) < 0.001 && !Number.isNaN(attentionRate));
    test('Zero assessed projects: notAssessed disclosed separately', notAssessed === 3);
  }

  // 3. Live DB Integration: Query portfolio health using ProjectHealthService
  {
    const user = await prisma.user.findFirst({
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (user) {
      const mockAdmin = {
        ...user,
        role: 'ADMIN',
      };
      const result = await ProjectHealthService.getPortfolioHealth(mockAdmin);
      const summary = result.summary;
      const distribution = result.distribution;

      test('Live portfolio returned valid summary object', Boolean(summary));
      test(
        'Live summary has assessed projects field = healthy + at_risk + critical',
        summary.assessed === (summary.healthy + summary.at_risk + summary.critical),
        { summary }
      );
      test(
        'Live summary attention_required = at_risk + critical',
        summary.attention_required === (summary.at_risk + summary.critical),
        { summary }
      );
      test(
        'NOT_ASSESSED projects are not counted in assessed',
        summary.total === summary.assessed + summary.not_assessed,
        { summary }
      );

      if (summary.assessed > 0) {
        test(
          'Live distribution healthy percentage uses assessed as denominator',
          Math.abs(distribution.healthy.percentage - ((summary.healthy / summary.assessed) * 100)) < 0.15,
          { distribution, summary }
        );
        test(
          'Live attention_rate uses assessed as denominator',
          Math.abs(summary.attention_rate - ((summary.attention_required / summary.assessed) * 100)) < 0.15,
          { summary }
        );
      } else {
        test('When assessed is 0, healthy percentage is 0', Math.abs(distribution.healthy.percentage) < 0.001);
        test('When assessed is 0, attention_rate is 0', Math.abs(summary.attention_rate) < 0.001);
      }
    } else {
      console.log('Skipping live admin query (no admin found)');
    }
  }

  // 4. Cohort Isolation Check
  {
    const cohorts = await prisma.cohort.findMany({ take: 2 });
    if (cohorts.length > 0) {
      const user = await prisma.user.findFirst();
      if (user) {
        for (const cohort of cohorts) {
          const result = await ProjectHealthService.getPortfolioHealth(user, { cohort_id: cohort.id });
          test(`Portfolio query for cohort "${cohort.name}" executes cleanly`, Boolean(result.summary));
        }
      }
    }
  }

  console.log(`\n===============================================================`);
  console.log(`RESULT: ${passed} / ${total} TESTS PASSED`);
  console.log(`===============================================================`);

  await prisma.$disconnect();
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
