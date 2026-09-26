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

function normalizeConfig(config) {
  let parsed = config;
  while (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      break;
    }
  }
  return {
    timezone: parsed?.timezone || defaultConfig.timezone,
    workDays: Array.isArray(parsed?.workDays)
      ? [...new Set(parsed.workDays.map(Number).filter(d => !isNaN(d) && d >= 0 && d <= 6))]
      : defaultConfig.workDays,
    workStart: parsed?.workStart !== undefined && !isNaN(Number(parsed.workStart)) ? Number(parsed.workStart) : defaultConfig.workStart,
    workEnd: parsed?.workEnd !== undefined && !isNaN(Number(parsed.workEnd)) ? Number(parsed.workEnd) : defaultConfig.workEnd,
  };
}

function calculateBusinessHours(start, end, rawConfig = defaultConfig) {
  if (!start) return 0;
  const config = normalizeConfig(rawConfig);
  const dailyHours = Math.max(0, config.workEnd - config.workStart);
  if (dailyHours === 0 || !Array.isArray(config.workDays) || config.workDays.length === 0) return 0;

  const s = dayjs(start).tz(config.timezone);
  const t = (end ? dayjs(end) : dayjs()).tz(config.timezone);

  if (s.isAfter(t)) return 0;

  const sDay = s.startOf('day');
  const tDay = t.startOf('day');

  // Same calendar day
  if (sDay.isSame(tDay)) {
    if (!config.workDays.includes(s.day())) return 0;
    const startH = Math.max(config.workStart, s.hour());
    const endH = Math.min(config.workEnd, t.hour());
    return Math.max(0, endH - startH);
  }

  let hours = 0;

  // First day hours
  if (config.workDays.includes(s.day())) {
    const startH = Math.max(config.workStart, s.hour());
    if (startH < config.workEnd) {
      hours += (config.workEnd - startH);
    }
  }

  // Last day hours
  if (config.workDays.includes(t.day())) {
    const endH = Math.min(config.workEnd, t.hour());
    if (endH > config.workStart) {
      hours += (endH - config.workStart);
    }
  }

  // Full calendar days in between
  const nextDay = sDay.add(1, 'day');
  const daysInBetween = tDay.diff(nextDay, 'day');
  if (daysInBetween > 0) {
    const fullWeeks = Math.floor(daysInBetween / 7);
    hours += fullWeeks * config.workDays.length * dailyHours;

    const remDays = daysInBetween % 7;
    const startDow = nextDay.day();
    for (let i = 0; i < remDays; i++) {
      const dow = (startDow + fullWeeks * 7 + i) % 7;
      if (config.workDays.includes(dow)) {
        hours += dailyHours;
      }
    }
  }

  return hours;
}

module.exports = { calculateBusinessHours, normalizeConfig, defaultConfig };
