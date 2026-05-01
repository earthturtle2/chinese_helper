const config = require('../config');

const DATE_FORMATTER_CACHE = new Map();

function getDateFormatter(timeZone) {
  const tz = timeZone || config.appTimeZone || 'Asia/Shanghai';
  if (!DATE_FORMATTER_CACHE.has(tz)) {
    DATE_FORMATTER_CACHE.set(
      tz,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    );
  }
  return DATE_FORMATTER_CACHE.get(tz);
}

function localDateString(date = new Date(), timeZone = config.appTimeZone) {
  try {
    return getDateFormatter(timeZone).format(date);
  } catch {
    return getDateFormatter('Asia/Shanghai').format(date);
  }
}

function localDateDaysAgo(days, timeZone = config.appTimeZone) {
  return localDateString(new Date(Date.now() - days * 86400000), timeZone);
}

module.exports = { localDateString, localDateDaysAgo };
