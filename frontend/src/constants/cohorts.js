/**
 * InternHub Cohort and Project Owner Constants & Helpers
 */

export const COHORT_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

/**
 * Extracts and normalizes the cohort code (e.g. 'A1', 'D2') for an intern record.
 * Handles multiple schemas:
 * - Direct subbatch string (e.g. 'A1', 'D2')
 * - Batch + subbatch pair (e.g. batch='D', subbatch='D2' or '2')
 * - Regex extracted from string (e.g. 'D / D2', 'Cohort B1')
 * - Cohort nested object or code string (e.g. { code: 'C1' })
 */
export const getInternCohort = (intern) => {
  if (!intern) return null;
  const sub = (intern.subbatch || intern.sub_cohort || intern.subCohort || '').toString().trim().toUpperCase();
  const b = (intern.batch || intern.cohort_group || '').toString().trim().toUpperCase();

  // Direct match to A1-D2
  if (COHORT_OPTIONS.includes(sub)) return sub;

  // If sub is just 1 or 2, and batch is A/B/C/D
  if (b && (sub === '1' || sub === '2')) {
    const combined = `${b}${sub}`;
    if (COHORT_OPTIONS.includes(combined)) return combined;
  }

  // Regex check on sub (e.g. "D / D2" or "D2")
  const subMatch = sub.match(/([ABCD][12])/);
  if (subMatch && COHORT_OPTIONS.includes(subMatch[1])) return subMatch[1];

  // Regex check on batch
  const bMatch = b.match(/([ABCD][12])/);
  if (bMatch && COHORT_OPTIONS.includes(bMatch[1])) return bMatch[1];

  // Check cohort object or string (e.g. intern.cohort)
  if (intern.cohort) {
    const code = (typeof intern.cohort === 'string' ? intern.cohort : (intern.cohort.code || intern.cohort.name || '')).toUpperCase();
    const cMatch = code.match(/([ABCD][12])/);
    if (cMatch && COHORT_OPTIONS.includes(cMatch[1])) return cMatch[1];
  }

  return null;
};

/**
 * Multi-criteria filter for project members by selected cohorts and search term.
 * Guarantees that filtering does not alter underlying member selections.
 */
export const filterInterns = ({ interns = [], selectedCohorts = [], searchQuery = '' }) => {
  return interns.filter((u) => {
    // 1. Cohort filter: if one or more cohorts are selected, user must match one
    if (selectedCohorts && selectedCohorts.length > 0) {
      const userCohort = getInternCohort(u);
      if (!userCohort || !selectedCohorts.includes(userCohort)) {
        return false;
      }
    }

    // 2. Name or email search filter
    if (searchQuery && searchQuery.trim()) {
      const term = searchQuery.toLowerCase().trim();
      const matchesName = u.name && u.name.toLowerCase().includes(term);
      const matchesEmail = u.email && u.email.toLowerCase().includes(term);
      if (!matchesName && !matchesEmail) return false;
    }

    return true;
  });
};

/**
 * Computes primary owner and owner payload for project update/creation.
 * Retains existing primary owner if still selected, otherwise defaults to first selected owner.
 */
export const getPrimaryOwnerId = ({ ownerIds = [], existingPrimaryOwnerId = null }) => {
  if (!ownerIds || ownerIds.length === 0) return null;
  if (existingPrimaryOwnerId && ownerIds.includes(existingPrimaryOwnerId)) {
    return existingPrimaryOwnerId;
  }
  return ownerIds[0];
};

/**
 * Formats multiple owners for compact display.
 */
export const formatOwnersDisplay = ({ owners = [], primaryOwner = null }) => {
  if (Array.isArray(owners) && owners.length > 0) {
    return {
      names: owners.map((o) => o.name || o.email).join(', '),
      primaryName: owners[0]?.name || owners[0]?.email || 'Owner',
      count: owners.length,
      hasMultiple: owners.length > 1,
    };
  }
  if (primaryOwner) {
    const name = primaryOwner.name || primaryOwner.email || 'Owner';
    return {
      names: name,
      primaryName: name,
      count: 1,
      hasMultiple: false,
    };
  }
  return {
    names: 'Unassigned',
    primaryName: 'Unassigned',
    count: 0,
    hasMultiple: false,
  };
};

