import { strict as assert } from "node:assert";
import { validateDeployProvenance, validateStackDeploy } from "./validate-stack-deploy.mjs";

const stack = `services:
  patilu:
    image: ghcr.io/fer336/patilu:production
  patilu-api:
    image: ghcr.io/fer336/patilu-api:production
  patilu-cms:
    image: ghcr.io/fer336/patilu-cms:production
    environment: unchanged
networks:
  network_public:
    external: true
`;

const previousStack = stack.replaceAll(":production", ":v2.3.4");
const currentStack = stack.replaceAll(":production", ":v2.3.5");

assert.equal(validateStackDeploy(previousStack, currentStack), "v2.3.5");
assert.throws(() => validateStackDeploy(previousStack, currentStack.replace("patilu:v2.3.5", "patilu:latest")), /coherent/);
assert.throws(() => validateStackDeploy(previousStack, `${currentStack}\n# unrelated change\n`), /changed beyond/);
assert.throws(() => validateStackDeploy(currentStack, currentStack), /did not change/);

const release = { tagName: "v2.3.5", isDraft: false, isPrerelease: false };
const images = "ghcr.io/fer336/patilu:v2.3.5,ghcr.io/fer336/patilu-api:v2.3.5,ghcr.io/fer336/patilu-cms:v2.3.5";
assert.equal(validateDeployProvenance("v2.3.5", release, images), "v2.3.5");
assert.throws(() => validateDeployProvenance("v2.3.5", { ...release, tagName: "v2.3.4" }, images), /does not match/);
assert.throws(() => validateDeployProvenance("v2.3.5", { ...release, isPrerelease: true }, images), /published and stable/);
assert.throws(() => validateDeployProvenance("v2.3.5", release, images.replace("patilu-cms:v2.3.5", "patilu-cms:v2.3.4")), /image references/);

console.log("stack deploy validator passed");
