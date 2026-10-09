import api from './api';

export const cohortsService = {
  /**
   * Get all active cohorts for the authenticated user's organization
   */
  async getCohorts() {
    return api.get('/cohorts');
  },
};

