function validateEventStatus(currentStatus, newStatus) {
  const validTransitions = {
    scheduled: ["in_progress", "cancelled", "postponed"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    // Cannot transition from completed
    cancelled: ["scheduled"],
    // Can reschedule
    postponed: ["scheduled", "cancelled"]
  };
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}
function formatEventDateRange(startDate, endDate) {
  const start = startDate.toLocaleDateString();
  if (!endDate) {
    return start;
  }
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${start} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`;
  }
  return `${start} - ${endDate.toLocaleDateString()}`;
}
function generateEventSlug(name, date) {
  const namePart = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const datePart = date.toISOString().split("T")[0];
  return `${namePart}-${datePart}`;
}
function checkSchedulingConflict(event1Start, event1End, event2Start, event2End) {
  const e1End = event1End || event1Start;
  const e2End = event2End || event2Start;
  return event1Start < e2End && e1End > event2Start;
}
function parseRecurrencePattern(pattern) {
  if (!pattern) return null;
  if (typeof pattern === "string") {
    try {
      return JSON.parse(pattern);
    } catch {
      return null;
    }
  }
  return pattern;
}
function calculateNextOccurrence(pattern, fromDate) {
  const { frequency, interval = 1, until, count } = pattern;
  if (until && fromDate >= until) return null;
  const nextDate = new Date(fromDate);
  switch (frequency) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    case "weekly":
      nextDate.setDate(nextDate.getDate() + interval * 7);
      break;
    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    case "yearly":
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    default:
      return null;
  }
  if (until && nextDate > until) return null;
  return nextDate;
}
function calculateDuration(startDate, endDate) {
  return endDate.getTime() - startDate.getTime();
}
function formatDuration(durationMs) {
  const seconds = Math.floor(durationMs / 1e3);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
function isEventNow(startDate, endDate) {
  const now = /* @__PURE__ */ new Date();
  if (now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
}
function getEventStatusFromDates(startDate, endDate, currentStatus) {
  if (currentStatus === "cancelled" || currentStatus === "postponed") {
    return currentStatus;
  }
  const now = /* @__PURE__ */ new Date();
  if (now < startDate) {
    return "scheduled";
  }
  if (endDate && now > endDate) {
    return "completed";
  }
  return "in_progress";
}
function sortEventsByDate(events, ascending = true) {
  return events.sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    const diff = a.startDate.getTime() - b.startDate.getTime();
    return ascending ? diff : -diff;
  });
}
export {
  calculateDuration,
  calculateNextOccurrence,
  checkSchedulingConflict,
  formatDuration,
  formatEventDateRange,
  generateEventSlug,
  getEventStatusFromDates,
  isEventNow,
  parseRecurrencePattern,
  sortEventsByDate,
  validateEventStatus
};
//# sourceMappingURL=index10.js.map
