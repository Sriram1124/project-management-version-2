import { TimesheetService } from '../src/services/timesheet.service';

async function main() {
  const policy = {
    office_start_time: '09:00',
    office_end_time: '17:30',
    break_start_time: '13:00',
    break_end_time: '14:00',
    lunch_break_minutes: 60,
    timezone: 'Asia/Kolkata',
  };

  const sessions = [{
    started_at: '2026-10-07T03:10:00.000Z',
    ended_at: '2026-10-07T12:40:00.000Z',
  }];

  const taskEntries = [
    { start_time: '2026-10-07T03:35:00.000Z', end_time: '2026-10-07T05:30:00.000Z', duration_minutes: 115 },
    { start_time: '2026-10-07T08:30:00.000Z', end_time: '2026-10-07T10:30:00.000Z', duration_minutes: 120 },
    { start_time: '2026-10-07T10:30:00.000Z', end_time: '2026-10-07T11:50:00.000Z', duration_minutes: 80 },
  ];

  const summary = TimesheetService.calculateDailySummary(policy, sessions, taskEntries, new Date('2026-10-07T00:00:00.000Z'));

  if (summary.gross_office_minutes !== 510) {
    throw new Error(`Expected gross office minutes 510, got ${summary.gross_office_minutes}`);
  }

  if (summary.break_minutes !== 60) {
    throw new Error(`Expected break minutes 60, got ${summary.break_minutes}`);
  }

  if (summary.net_working_minutes !== 450) {
    throw new Error(`Expected net working minutes 450, got ${summary.net_working_minutes}`);
  }

  if (summary.task_minutes !== 315) {
    throw new Error(`Expected task minutes 315, got ${summary.task_minutes}`);
  }

  if (summary.unallocated_minutes !== 135) {
    throw new Error(`Expected unallocated minutes 135, got ${summary.unallocated_minutes}`);
  }

  const overlappingSummary = TimesheetService.calculateDailySummary(
    policy,
    [
      { started_at: '2026-10-07T03:10:00.000Z', ended_at: '2026-10-07T08:00:00.000Z' },
      { started_at: '2026-10-07T07:00:00.000Z', ended_at: '2026-10-07T12:40:00.000Z' },
    ],
    [],
    new Date('2026-10-07T00:00:00.000Z')
  );

  if (overlappingSummary.attendance_minutes !== 510) {
    throw new Error(`Expected overlapping sessions to count once at 510 minutes, got ${overlappingSummary.attendance_minutes}`);
  }

  console.log('timesheet logic verification passed', summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
