import { readFileSync, writeFileSync } from "node:fs";

const STABLE_SEMVER = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const IMAGE_PREFIX = "ghcr.io/fer336/";
const EXPECTED_IMAGES = ["patilu-web"];
const PATILU_IMAGE = /ghcr\.io\/fer336\/(patilu-[a-z0-9-]+):([^\s"']+)/g;
const BOT_NAME = "github-actions[bot]";
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

export function setStackVersion(stack, requestedTag) {
  if (!STABLE_SEMVER.test(requestedTag)) {
    throw new Error("Version must be stable SemVer in vMAJOR.MINOR.PATCH format.");
  }

  const matches = [...stack.matchAll(PATILU_IMAGE)];
  const names = matches.map((match) => match[1]);
  if (
    matches.length !== EXPECTED_IMAGES.length ||
    EXPECTED_IMAGES.some((image) => names.filter((name) => name === image).length !== 1) ||
    names.some((name) => !EXPECTED_IMAGES.includes(name))
  ) {
    throw new Error("Stack must contain exactly one reference for each expected Patilu image.");
  }

  const currentTags = new Set(matches.map((match) => match[2]));
  if (currentTags.size !== 1) {
    throw new Error("Patilu stack image tags must be coherent.");
  }

  const [currentTag] = currentTags;
  if (currentTag !== "production" && !STABLE_SEMVER.test(currentTag)) {
    throw new Error("Current stack tag must be bootstrap production or stable SemVer.");
  }

  return stack.replace(PATILU_IMAGE, (_reference, image) => `${IMAGE_PREFIX}${image}:${requestedTag}`);
}

export function validateReleaseLineage(input) {
  if (!STABLE_SEMVER.test(input.tag)) throw new Error("Release tag must be stable SemVer.");
  if (input.releaseSha !== input.eventSha) throw new Error("Release event SHA does not match its tag.");
  if (input.mainSha === input.releaseSha) return "initial";

  const expectedSubject = `chore(deploy): pin stack to ${input.tag}`;
  if (input.parentShas !== input.releaseSha) throw new Error("Main is not the release commit's direct child.");
  if (input.subject !== expectedSubject) throw new Error("Main child is not the expected stack-pin commit.");
  if (input.authorName !== BOT_NAME || input.committerName !== BOT_NAME ||
      input.authorEmail !== BOT_EMAIL || input.committerEmail !== BOT_EMAIL) {
    throw new Error("Stack-pin commit identity is not GitHub Actions.");
  }
  if (input.changedFiles !== "docker-stack.yml") throw new Error("Stack-pin commit changed unexpected files.");
  if (input.mainStack !== setStackVersion(input.releaseStack, input.tag)) {
    throw new Error("Current main stack is not the exact release pin update.");
  }
  return "recovery";
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--validate-release-lineage") {
    console.log(validateReleaseLineage({
      tag: process.env.RELEASE_TAG,
      eventSha: process.env.EVENT_SHA,
      releaseSha: process.env.RELEASE_SHA,
      mainSha: process.env.MAIN_SHA,
      parentShas: process.env.PARENT_SHAS,
      subject: process.env.COMMIT_SUBJECT,
      authorName: process.env.AUTHOR_NAME,
      authorEmail: process.env.AUTHOR_EMAIL,
      committerName: process.env.COMMITTER_NAME,
      committerEmail: process.env.COMMITTER_EMAIL,
      changedFiles: process.env.CHANGED_FILES,
      releaseStack: readFileSync(new URL("../docker-stack.yml", import.meta.url), "utf8"),
      mainStack: readFileSync(args[1], "utf8"),
    }));
    return;
  }
  if (args.length !== 1) {
    throw new Error("Usage: node scripts/set-stack-version.mjs vMAJOR.MINOR.PATCH | --validate-release-lineage FILE");
  }

  const stackUrl = new URL("../docker-stack.yml", import.meta.url);
  const current = readFileSync(stackUrl, "utf8");
  const updated = setStackVersion(current, args[0]);
  if (updated !== current) {
    writeFileSync(stackUrl, updated);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
