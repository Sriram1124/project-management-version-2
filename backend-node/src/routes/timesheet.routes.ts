import { Router } from 'express';
import { TimesheetController } from '../controllers/timesheet.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/organization-policy', TimesheetController.getOrganizationPolicy);
router.put('/organization-policy', TimesheetController.upsertOrganizationPolicy);
router.post('/work-sessions/start', TimesheetController.startSession);
router.post('/work-sessions/end', TimesheetController.endSession);
router.get('/work-sessions/active', TimesheetController.getActiveTaskSession);
router.post('/time-entries', TimesheetController.createTimeEntry);
router.patch('/time-entries/:id', TimesheetController.updateTimeEntry);
router.delete('/time-entries/:id', TimesheetController.deleteTimeEntry);
router.get('/today', TimesheetController.getTodayTimesheet);
router.get('/weekly', TimesheetController.getWeeklyTimesheet);
router.get('/monthly', TimesheetController.getMonthlyTimesheet);
router.get('/task-time', TimesheetController.getTaskTime);
router.get('/intern-report', TimesheetController.getInternReport);
router.get('/manager-report', TimesheetController.getManagerReport);

export { router as timesheetRouter };
