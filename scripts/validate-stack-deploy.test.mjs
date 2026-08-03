import { strict as assert } from "node:assert";
import { validateDeployProvenance, validateStackDeploy } from "./validate-stack-deploy.mjs";

const stack = `services:
  patilu:
    image: ghcr.io/fer336/patilu:production
    environment: unchanged
networks:
  network_public:
    external: true
`;

const previousStack = stack.replace("patilu:production", "patilu:v2.3.4");
const currentStack = stack.replace("patilu:production", "patilu:v2.3.5");

assert.equal(validateStackDeploy(previousStack, currentStack), "v2.3.5");
assert.throws(() => validateStackDeploy(previousStack, currentStack.replace("patilu:v2.3.5", "patilu:latest")), /stable SemVer/);
assert.throws(() => validateStackDeploy(previousStack, `${currentStack}\n# unrelated change\n`), /changed beyond/);
assert.throws(() => validateStackDeploy(currentStack, currentStack), /did not change/);

const release = { tagName: "v2.3.5", isDraft: false, isPrerelease: false };
assert.equal(validateDeployProvenance("v2.3.5", release, "ghcr.io/fer336/patilu:v2.3.5"), "v2.3.5");
assert.throws(() => validateDeployProvenance("v2.3.5", { ...release, tagName: "v2.3.4" }, "ghcr.io/fer336/patilu:v2.3.5"), /does not match/);
assert.throws(() => validateDeployProvenance("v2.3.5", { ...release, isPrerelease: true }, "ghcr.io/fer336/patilu:v2.3.5"), /published and stable/);
assert.throws(() => validateDeployProvenance("v2.3.5", release, "ghcr.io/fer336/patilu:v2.3.4"), /image reference/);

console.log("stack deploy validator passed");
