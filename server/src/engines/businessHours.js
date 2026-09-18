const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const defaultConfig = {
  timezone: 'UTC',
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
  workStart: 9,
  workEnd: 18
};

function calculateBusinessHours(start, end, config = defaultConfig) {
  if (!start) return 0;
  let current = dayjs(start).tz(config.timezone);
  const target = end ? dayjs(end).tz(config.timezone) : dayjs().tz(config.timezone);

  if (current.isAfter(target)) return 0;

  let bizHours = 0;

  // Simple hour-by-hour stepping for robustness (can be optimized later)
  while (current.isBefore(target)) {
    const dayOfWeek = current.day();
    const hourOfDay = current.hour();

    if (
      config.workDays.includes(dayOfWeek) &&
      hourOfDay >= config.workStart &&
      hourOfDay < config.workEnd
    ) {
      bizHours += 1; // Count full hour.
    }
    current = current.add(1, 'hour');
  }

  // Refine for partial hours if needed, but for PR metrics, integer hours are usually fine.
  return bizHours;
}

module.exports = { calculateBusinessHours, defaultConfig };
