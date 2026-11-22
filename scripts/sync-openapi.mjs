// Copies the backend API contract into the built dashboard so it can be downloaded from
// the documentation page. The frontend CI cannot see the sibling backend repository, so
// the generated file is committed; run this after changing api/openapi.yaml.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.cwd(), "../realmstack-backend/api/openapi.yaml");
const target = resolve(process.cwd(), "public/openapi.yaml");

let contract;
try {
  contract = await readFile(source, "utf8");
} catch {
  console.error(`Could not read ${source}.`);
  console.error("Keep the two repositories side by side, or run this from realmstack-frontend/.");
  process.exit(1);
}

const header = [
  "# RealmStack API contract (OpenAPI 3).",
  "# Copied from realmstack-backend/api/openapi.yaml by `npm run sync:openapi`.",
  "# The backend contract is authoritative; do not edit this copy.",
  "",
].join("\n");

// `--check` verifies the committed copy instead of writing it, so a contract change that was
// never synced fails loudly (run it locally with both repositories checked out).
if (process.argv.includes("--check")) {
  const committed = await readFile(target, "utf8").catch(() => "");
  const normalise = (text) => text.replace(/\r\n/g, "\n");
  if (normalise(committed) !== normalise(header + contract)) {
    console.error("public/openapi.yaml is out of date. Run `npm run sync:openapi` and commit the result.");
    process.exit(1);
  }
  console.log("public/openapi.yaml matches the backend contract.");
} else {
  await writeFile(target, header + contract, "utf8");
  console.log(`Wrote ${target} (${contract.split("\n").length} contract lines).`);
}
