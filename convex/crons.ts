import { anyApi, cronJobs } from "convex/server";
const crons = cronJobs();
crons.interval(
  "expire limiter metadata",
  { hours: 1 },
  anyApi.rooms.cleanupLimits,
  {},
);
export default crons;
