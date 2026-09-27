// TODO: decide where this belongs, then move it and delete this file. The
// options:
// A. the domain, as before;
// B. config, passed into createCalendarEvent;
// C. the models adapter, which declines a low-confidence repeat itself. Then
//    CalendarEventDraft.confidence is removed too.
// Until then, nothing uses it: the new code does not decline a
// low-confidence repeat. The old code in src/legacy/ still does.

// A repeat below this confidence is declined.
export const MIN_REPEAT_CONFIDENCE = 0.7;
