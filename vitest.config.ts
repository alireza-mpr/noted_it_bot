import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY must be set in the environment");
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
        bindings: {
          GEMINI_API_KEY: geminiApiKey,
          ...(process.env.GROQ_API_KEY && { GROQ_API_KEY: process.env.GROQ_API_KEY }),
          // How many calls tests/manual/quotaFill.test.ts fires at once.
          ...(quotaFillCalls && { QUOTA_FILL_CALLS: quotaFillCalls }),
        },
      },
    }),
  ],
  test: manual
    ? { include: ["tests/manual/**/*.test.ts"] }
    : { exclude: [...configDefaults.exclude, "tests/manual/**"] },
});
