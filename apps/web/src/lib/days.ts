// Showing days. A `YYYY-MM-DD` day is formatted at noon UTC, read in UTC, so no local offset can
// turn it into its neighbour.

const long = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Tuesday, November 3" */
export const formatDayLong = (day: string) => long.format(new Date(`${day}T12:00:00Z`));
