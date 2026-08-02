import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setStackVersion, validateReleaseLineage } from "./set-stack-version.mjs";

const stack = `services:
  patilu:
    image: ghcr.io/fer336/patilu:production
    environment: unchanged
networks:
  network_public:
    external: true
`;

for (const invalid of ["1.2.3", "v1.2", "v1.2.3-rc.1", "v01.2.3", "latest", "production"]) {
  assert.throws(() => setStackVersion(stack, invalid), /stable SemVer/);
}

const updated = setStackVersion(stack, "v1.2.3");
assert.equal((updated.match(/:v1\.2\.3/g) ?? []).length, 1);
assert.doesNotMatch(updated, /:(?:latest|production)\b/);
assert.match(updated, /environment: unchanged/);
assert.equal(setStackVersion(updated, "v1.2.3"), updated);
assert.equal(setStackVersion(updated, "v2.0.0").match(/:v2\.0\.0/g)?.length, 1);

const stableCurrent = stack.replace("patilu:production", "patilu:v1.0.0");
assert.equal(setStackVersion(stableCurrent, "v1.0.1").match(/:v1\.0\.1/g)?.length, 1);

const mutable = stack.replaceAll(":production", ":latest");
assert.throws(() => setStackVersion(mutable, "v1.0.0"), /bootstrap production or stable SemVer/);

const duplicate = stack.replace("    environment: unchanged\n", "    image: ghcr.io/fer336/patilu:production\n");
assert.throws(() => setStackVersion(duplicate, "v1.0.0"), /exactly one reference/);

const unknown = stack.replace("patilu:production", "patilu-worker:production");
assert.throws(() => setStackVersion(unknown, "v1.0.0"), /exactly one reference/);

const releaseSha = "a".repeat(40);
const childSha = "b".repeat(40);
const lineage = {
  tag: "v1.2.3", eventSha: releaseSha, releaseSha, mainSha: releaseSha,
  parentShas: "", subject: "", authorName: "", authorEmail: "",
  committerName: "", committerEmail: "", changedFiles: "",
  releaseStack: stack, mainStack: stack,
};
assert.equal(validateReleaseLineage(lineage), "initial");

const recovery = {
  ...lineage,
  mainSha: childSha,
  parentShas: releaseSha,
  subject: "chore(deploy): pin stack to v1.2.3",
  authorName: "github-actions[bot]",
  authorEmail: "41898282+github-actions[bot]@users.noreply.github.com",
  committerName: "github-actions[bot]",
  committerEmail: "41898282+github-actions[bot]@users.noreply.github.com",
  changedFiles: "docker-stack.yml",
  mainStack: updated,
};
assert.equal(validateReleaseLineage(recovery), "recovery");
assert.equal(validateReleaseLineage({ ...recovery, subject: "chore(deploy): pin stack to v1.2.3 (#40)" }), "recovery");
assert.throws(() => validateReleaseLineage({ ...recovery, eventSha: childSha }), /event SHA/);
assert.throws(() => validateReleaseLineage({ ...recovery, subject: "fix: unrelated" }), /expected stack-pin/);
assert.throws(() => validateReleaseLineage({ ...recovery, authorName: "Not Actions" }), /identity/);
assert.throws(() => validateReleaseLineage({ ...recovery, changedFiles: "README.md\ndocker-stack.yml" }), /unexpected files/);
assert.throws(() => validateReleaseLineage({ ...recovery, parentShas: childSha }), /direct child/);
assert.throws(() => validateReleaseLineage({ ...recovery, parentShas: `${releaseSha} ${childSha}` }), /direct child/);
assert.throws(() => validateReleaseLineage({ ...recovery, mainStack: updated.replace("patilu:v1.2.3", "patilu:v1.2.4") }), /exact release pin/);
assert.throws(() => validateReleaseLineage({ ...recovery, mainStack: updated.replaceAll("v1.2.3", "v1.2.4") }), /exact release pin/);
assert.throws(() => validateReleaseLineage({ ...recovery, tag: "v1.2.3-rc.1" }), /stable SemVer/);

const script = fileURLToPath(new URL("./set-stack-version.mjs", import.meta.url));
for (const args of [[], ["v1.0.0", "v1.0.1"]]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "CLI must accept exactly one argument");
  assert.match(result.stderr, /Usage:/);
}

console.log("stack version updater passed");
