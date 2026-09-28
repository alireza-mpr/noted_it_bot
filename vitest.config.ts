import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

// An environment variable wins; otherwise the local, gitignored secrets/dev.json
// (see the README), whose keys use the same names.
function secret(name: string): string | undefined {
  if (process.env[name]) {
    return process.env[name];
  }
  try {
    const value = JSON.parse(readFileSync("secrets/dev.json", "utf8"))[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

const geminiApiKey = secret("GEMINI_API_KEY");
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY must be set in the environment or in secrets/dev.json");
}

// tests/manual/ burns real quota on purpose, so it runs only on demand
// (`npm run test:quota-fill`), never in `npm test` or CI.
const manual = process.env.QUOTA_FILL === "1";
const quotaFillCalls = process.env.QUOTA_FILL_CALLS;
if (manual && !quotaFillCalls) {
  throw new Error("QUOTA_FILL_CALLS must be set for the quota-fill test");
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml", environment: "dev" },
      remoteBindings: true,
      miniflare: {
        // Local only, so repository tests run real SQL without touching the remote dev database.
        d1Databases: ["TEST_DB"],
        bindings: {
          GEMINI_API_KEY: geminiApiKey,
          ...(secret("GROQ_API_KEY") && { GROQ_API_KEY: secret("GROQ_API_KEY") }),
          // How many calls tests/manual/quota-fill.test.ts fires at once.
          ...(quotaFillCalls && { QUOTA_FILL_CALLS: quotaFillCalls }),
        },
      },
    }),
  ],
  test: manual
    ? { include: ["tests/manual/**/*.test.ts"] }
    : { exclude: [...configDefaults.exclude, "tests/manual/**"] },
});
