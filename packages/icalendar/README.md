# @happyvertical/icalendar

`@happyvertical/icalendar` provides a bounded, network-free RFC 5545 parsing
entry point. It delegates grammar and component handling to `ical.js`; callers
use the returned `ICAL.Component` to read standard properties.

## Usage

```ts
import { parseICalendar } from '@happyvertical/icalendar';

const calendar = parseICalendar(icsText);
const event = calendar.component.getFirstSubcomponent('vevent');
const uid = event?.getFirstPropertyValue('uid');
```

`parseICalendar` enforces input, physical-line, unfolded-line, and component
limits before returning a single `VCALENDAR` document. It does not fetch URLs,
apply a floating-time policy, expand recurrence, or persist calendar data.
