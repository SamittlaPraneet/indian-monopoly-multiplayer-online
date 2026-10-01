import { spawnSync } from "node:child_process";
const production = process.env.VERCEL_ENV === "production";
if (production) {
  for (const key of [
    "CONVEX_DEPLOY_KEY",
    "SESSION_SIGNING_KEY",
    "APP_ORIGIN",
  ]) {
    if (!process.env[key])
      throw new Error(
        `Production requires ${key}; frontend-only deployment is refused.`,
      );
  }
}
const command = production
  ? [
      "convex",
      "deploy",
      "--cmd",
      "npm run build",
      "--cmd-url-env-var-name",
      "NEXT_PUBLIC_CONVEX_URL",
    ]
  : ["next", "build"];
const result = spawnSync("npx", command, {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
