import { ensureCalendarInventoryProjections } from '../creator-calendar/population/sync.js';

const from = new Date();
from.setDate(from.getDate() - 1);
const to = new Date();
to.setDate(to.getDate() + 60);

const report = await ensureCalendarInventoryProjections(from, to);
console.log(JSON.stringify(report, null, 2));
