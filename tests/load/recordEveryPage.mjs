// Runs recordEveryPage.spec.ts until every page is recorded: a page can leave
// the test process's app unable to mount anything after it, so the spec stops
// there and this starts it again in a fresh process from that page.
//   LOAD_COVERAGE=<api>/load/documents/coverage node tests/load/recordEveryPage.mjs
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const out = process.env.LOAD_COVERAGE;
if (!out) {
  console.error("LOAD_COVERAGE is not set; see api/load/README.md");
  process.exit(1);
}

for (let run = 0; run < 30; run++) {
  const env = { ...process.env, ...(run > 0 ? { LOAD_RESUME: "1" } : {}) };
  const { status } = spawnSync(
    "npx",
    ["vitest", "run", "tests/load/recordEveryPage.spec.ts"],
    {
      env,
      stdio: "inherit",
    },
  );
  const { next } = JSON.parse(readFileSync(join(out, "coverage.json"), "utf8"));
  if (!next) process.exit(status ?? 0);
  console.log(`\nstarting a fresh process at ${next}\n`);
}
console.error("still not done after 30 processes");
process.exit(1);
