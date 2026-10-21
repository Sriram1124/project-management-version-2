import { formsService as centralFormsService, formatFormDeadline } from '../../../services/forms.service';

export { formatFormDeadline };

export const formsService = {
  ...centralFormsService,
  
  // Backwards compatibility for InternApp
  getAssignedForms: () => {
    return []; // Handled by loadForms now in InternApp
  },
  
  subscribe: (callback) => {
    // Basic polling or mock implementation to prevent crash
    let active = true;
    const load = async () => {
      try {
        const forms = await centralFormsService.getForms();
        if (active) callback(forms);
      } catch (e) { }
    };
    void load();
    return () => { active = false; };
  }
};
