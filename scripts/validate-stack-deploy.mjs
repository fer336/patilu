import { readFileSync } from "node:fs";
import { PATILU_IMAGE_REPOSITORY, STABLE_SEMVER, setStackVersion } from "./set-stack-version.mjs";

const PATILU_IMAGE = new RegExp(`${PATILU_IMAGE_REPOSITORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\S+)`);

function usage() {
  throw new Error("Usage: node scripts/validate-stack-deploy.mjs --before <path> --current <path> | --tag <tag> --release-metadata <path> --image-reference <image>");
}

function parseArgs(argv) {
  const args = { before: "", current: "", tag: "", releaseMetadata: "", imageReference: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value) usage();
    if (name === "--before") args.before = value;
    else if (name === "--current") args.current = value;
    else if (name === "--tag") args.tag = value;
    else if (name === "--release-metadata") args.releaseMetadata = value;
    else if (name === "--image-reference") args.imageReference = value;
    else usage();
  }
  const stackMode = args.before && args.current && !args.tag && !args.releaseMetadata && !args.imageReference;
  const provenanceMode = args.tag && args.releaseMetadata && args.imageReference && !args.before && !args.current;
  if (!stackMode && !provenanceMode) usage();
  return args;
}

export function validateDeployProvenance(tag, releaseMetadata, imageReference) {
  if (!STABLE_SEMVER.test(tag)) throw new Error("Deployment tag must be stable SemVer.");
  if (releaseMetadata.tagName !== tag) throw new Error("GitHub release metadata does not match the stack tag.");
  if (releaseMetadata.isDraft || releaseMetadata.isPrerelease) {
    throw new Error("GitHub release must be published and stable before deployment.");
  }

  if (imageReference !== `${PATILU_IMAGE_REPOSITORY}:${tag}`) {
    throw new Error("Promoted image reference does not match the stack tag.");
  }

  return tag;
}

export function validateStackDeploy(previousStack, currentStack) {
  if (previousStack === currentStack) throw new Error("docker-stack.yml did not change the release image pin.");

  const match = currentStack.match(PATILU_IMAGE);
  if (!match) throw new Error("docker-stack.yml does not contain the Patilu image tag.");

  const tag = match[1];
  if (!STABLE_SEMVER.test(tag)) throw new Error("docker-stack.yml is not pinned to a stable SemVer tag.");

  if (setStackVersion(previousStack, tag) !== currentStack) {
    throw new Error("docker-stack.yml changed beyond the release image pin.");
  }

  return tag;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const tag = args.before
    ? validateStackDeploy(readFileSync(args.before, "utf8"), readFileSync(args.current, "utf8"))
    : validateDeployProvenance(
      args.tag,
      JSON.parse(readFileSync(args.releaseMetadata, "utf8")),
      args.imageReference,
    );
  console.log(tag);
}
