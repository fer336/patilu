import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";

const root = new URL("..", import.meta.url).pathname;

function read(path) {
  const fullPath = join(root, path);
  assert.equal(existsSync(fullPath), true, `${path} must exist`);
  return readFileSync(fullPath, "utf8");
}

function assertIncludes(file, content, expected) {
  assert.match(content, expected, `${file} must include ${expected}`);
}

function assertNotIncludes(file, content, unexpected) {
  assert.doesNotMatch(content, unexpected, `${file} must not include ${unexpected}`);
}

function jobSection(workflow, job, nextJob) {
  const start = workflow.indexOf(`  ${job}:`);
  const end = nextJob ? workflow.indexOf(`  ${nextJob}:`, start) : workflow.length;
  assert.notEqual(start, -1, `${job} job must exist`);
  assert.notEqual(end, -1, `${nextJob} job must exist after ${job}`);
  return workflow.slice(start, end);
}

const dockerignore = read(".dockerignore");
for (const pattern of [
  ".git",
  ".env",
  "node_modules",
  "dist",
  ".astro",
  ".vite",
  ".pytest_cache",
  "__pycache__",
  "patilu-html",
  "screenshots",
  "*.png",
]) {
  assertIncludes(".dockerignore", dockerignore, new RegExp(`(^|\\n)${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\n)`));
}
assertNotIncludes(".dockerignore", dockerignore, /package-lock\.json/);

const dockerfile = read("patilu/Dockerfile");
assertIncludes("patilu/Dockerfile", dockerfile, /FROM node:.* AS build/);
assertIncludes("patilu/Dockerfile", dockerfile, /npm ci/);
assertIncludes("patilu/Dockerfile", dockerfile, /npm --workspace patilu run build/);
assertIncludes("patilu/Dockerfile", dockerfile, /FROM node:.* AS runtime/);
assertIncludes("patilu/Dockerfile", dockerfile, /EXPOSE 8080/);
assertIncludes("patilu/Dockerfile", dockerfile, /USER node/);
assertIncludes("patilu/Dockerfile", dockerfile, /node:net/);
assertIncludes("patilu/Dockerfile", dockerfile, /port:8080/);
assertIncludes("patilu/Dockerfile", dockerfile, /\/workspace\/patilu\/dist/);
assertNotIncludes("patilu/Dockerfile", dockerfile, /127\.0\.0\.1:8080\//);
assertNotIncludes("patilu/Dockerfile", dockerfile, /fetch\(|\/healthz/);

const stack = read("docker-stack.yml");
assertIncludes("docker-stack.yml", stack, /patilu:/);
assertNotIncludes("docker-stack.yml", stack, /patilu-web:/);
assertNotIncludes("docker-stack.yml", stack, /patilu-cms:/);
assertNotIncludes("docker-stack.yml", stack, /patilu-api:/);
assertNotIncludes("docker-stack.yml", stack, /^ {2}postgres:/m);
const stackImages = [...stack.matchAll(/ghcr\.io\/fer336\/patilu:(\S+)/g)];
assert.equal(stackImages.length, 1, "docker-stack.yml must contain exactly one Patilu image");
assert.match(stackImages[0][1], /^(?:production|v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/);
assertNotIncludes("docker-stack.yml", stack, /ghcr\.io\/fer336\/patilu:latest/);
assertIncludes("docker-stack.yml", stack, /external: true/);
assertIncludes("docker-stack.yml", stack, /network_public/);
assertNotIncludes("docker-stack.yml", stack, /network_internal/);
assertNotIncludes("docker-stack.yml", stack, /postgres_data/);
assertNotIncludes("docker-stack.yml", stack, /patilu_postgres_password/);
assertNotIncludes("docker-stack.yml", stack, /patilu_backend_env/);
assertNotIncludes("docker-stack.yml", stack, /API_INTERNAL_URL/);
assertNotIncludes("docker-stack.yml", stack, /CORS_ORIGINS/);
assertNotIncludes("docker-stack.yml", stack, /MEDIA_PUBLIC_URL/);
assertNotIncludes("docker-stack.yml", stack, /stripprefix/);
assertNotIncludes("docker-stack.yml", stack, /PathPrefix/);
assertNotIncludes("docker-stack.yml", stack, /priority=100/);
assertNotIncludes("docker-stack.yml", stack, /cms-patilu\.qeva\.xyz/);
assertIncludes("docker-stack.yml", stack, /Host\(`patilu\.qeva.xyz`\)/);
assertNotIncludes("docker-stack.yml", stack, /ports:/);
assertNotIncludes("docker-stack.yml", stack, /build:/);

const workflow = read(".github/workflows/deploy.yml");
assertIncludes(".github/workflows/deploy.yml", workflow, /on:/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /branches: \[main\]/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /tags: \["v\*"\]/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /release:\n    types: \[published\]/);
  assertNotIncludes(".github/workflows/deploy.yml", workflow, /workflow_dispatch:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /contents: read/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/deployment-contract\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/set-stack-version\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu test/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu run typecheck/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu run build/);
assertIncludes(".github/workflows/deploy.yml", workflow, /docker\/build-push-action@v6/);
assertIncludes(".github/workflows/deploy.yml", workflow, /platforms: linux\/amd64/);
assertIncludes(".github/workflows/deploy.yml", workflow, /sha-\$\{\{ github\.sha \}\}/);
assertIncludes(".github/workflows/deploy.yml", workflow, /PORTAINER_WEBHOOK: \$\{\{ secrets\.PORTAINER_WEBHOOK \}\}/);
assertIncludes(".github/workflows/deploy.yml", workflow, /test -n "\$\{PORTAINER_WEBHOOK:-\}"/);
assertIncludes(".github/workflows/deploy.yml", workflow, /--url "\$PORTAINER_WEBHOOK"/);
assertNotIncludes(".github/workflows/deploy.yml", workflow, /PORTAINER_WEBHOOK_URL/);

const buildJob = jobSection(workflow, "build", "promote");
assertIncludes("build job", buildJob, /if: github\.event_name == 'release' && github\.event\.action == 'published'/);
assertIncludes("build job", buildJob, /:sha-\$\{\{ github\.sha \}\}/);
assertNotIncludes("build job", buildJob, /:production/);
assertNotIncludes("build job", buildJob, /:latest/);
assertIncludes("build job", buildJob, /file: patilu\/Dockerfile/);

const validation = jobSection(workflow, "release-validation", "build");
assertIncludes("release-validation job", validation, /\^v\(0\|\[1-9\]\[0-9\]\*\)/);
assertIncludes("release-validation job", validation, /git rev-parse origin\/main/);
assertIncludes("release-validation job", validation, /release_sha.*main_sha/);
assertIncludes("release-validation job", validation, /node scripts\/set-stack-version\.mjs --validate-release-lineage/);
assertIncludes("release-validation job", validation, /git diff-tree --no-commit-id --name-only/);

const promote = jobSection(workflow, "promote", "update-stack");
assertIncludes("promote job", promote, /needs: \[release-validation, build\]/);
assertIncludes("promote job", promote, /if: github\.event_name == 'release' && github\.event\.action == 'published'/);
assertIncludes("promote job", promote, /source="\$\{REGISTRY\}\/\$\{IMAGE_OWNER\}\/patilu:sha-\$\{\{ github\.sha \}\}"/);
assertIncludes("promote job", promote, /docker buildx imagetools inspect "\$source"/);
assertIncludes("promote job", promote, /github\.event\.release\.tag_name/);
assertNotIncludes("promote job", promote, /:(?:latest|production)/);

const updateStack = jobSection(workflow, "update-stack", "deploy");
assertIncludes("update-stack job", updateStack, /needs: \[release-validation, promote\]/);
assertIncludes("update-stack job", updateStack, /contents: write/);
assertIncludes("update-stack job", updateStack, /git rev-parse HEAD/);
assertIncludes("update-stack job", updateStack, /git rev-parse origin\/main/);
assertIncludes("update-stack job", updateStack, /node scripts\/set-stack-version\.mjs/);
assertIncludes("update-stack job", updateStack, /git add docker-stack\.yml/);
assertIncludes("update-stack job", updateStack, /git push origin main/);
assertIncludes("update-stack job", updateStack, /EXPECTED_MAIN_SHA:.*main_sha/);
assertIncludes("update-stack job", updateStack, /stack_sha=.*git rev-parse HEAD/);
assertNotIncludes("update-stack job", updateStack, /--force/);
assertNotIncludes("update-stack job", updateStack, /exit 0/);

assert.equal((workflow.match(/contents: write/g) ?? []).length, 2, "only update-stack and tag-deploy may write contents");
for (const mutationJob of [promote, updateStack, jobSection(workflow, "deploy")]) {
  assertIncludes("mutation job", mutationJob, /if: github\.event_name == 'release'/);
}

const deploy = jobSection(workflow, "deploy");
assertIncludes("deploy job", deploy, /needs: \[release-validation, update-stack\]/);
assertIncludes("deploy job", deploy, /github\.event\.action == 'published'/);
assertIncludes("deploy job", deploy, /needs\.release-validation\.result == 'success'/);
assertIncludes("deploy job", deploy, /permissions:\n      contents: read/);
assertIncludes("deploy job", deploy, /ref: \$\{\{ needs\.update-stack\.outputs\.stack_sha \}\}/);
assertIncludes("deploy job", deploy, /git rev-parse origin\/main.*needs\.update-stack\.outputs\.stack_sha/);
assertNotIncludes("deploy job", deploy, /needs: \[build\]/);
  for (const option of [
    /--connect-timeout 10/,
    /--max-time 30/,
    /--retry 2/,
    /--retry-delay 2/,
    /--retry-max-time 60/,
    /--retry-all-errors/,
  ]) {
    assertIncludes("deploy job", deploy, option);
  }

const tagDeploy = jobSection(workflow, "tag-deploy", "");
assertIncludes("tag-deploy job", tagDeploy, /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
assertIncludes("tag-deploy job", tagDeploy, /docker\/build-push-action@v6/);
assertIncludes("tag-deploy job", tagDeploy, /context: \./);
assertIncludes("tag-deploy job", tagDeploy, /file: patilu\/Dockerfile/);
assertIncludes("tag-deploy job", tagDeploy, /platforms: linux\/amd64/);
assertIncludes("tag-deploy job", tagDeploy, /github\.ref_name/);
assertIncludes("tag-deploy job", tagDeploy, /node scripts\/set-stack-version\.mjs/);
assertIncludes("tag-deploy job", tagDeploy, /git add docker-stack\.yml/);
assertIncludes("tag-deploy job", tagDeploy, /git push origin main/);
assertIncludes("tag-deploy job", tagDeploy, /PORTAINER_WEBHOOK: \$\{\{ secrets\.PORTAINER_WEBHOOK \}\}/);
assertIncludes("tag-deploy job", tagDeploy, /--url "\$PORTAINER_WEBHOOK"/);
assertIncludes("tag-deploy job", tagDeploy, /contents: write/);

const readme = read("README.md");
const outOfScope = readme.slice(readme.indexOf("## Out of scope"), readme.indexOf("## Required external inputs"));
assertNotIncludes("README out-of-scope section", outOfScope, /\bdeployment\b/i);
assertIncludes("README.md", readme, /## Deployment foundation/);

const dependabot = read(".github/dependabot.yml");
for (const directory of ["/", "/patilu"]) {
  assertIncludes(".github/dependabot.yml", dependabot, new RegExp(`directory: "${directory}"`));
}
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-api/);
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-web/);
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-cms/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "github-actions"/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "docker"/);
assertIncludes(".github/dependabot.yml", dependabot, /groups:/);

const astroConfig = read("patilu/astro.config.mjs");
assertIncludes("patilu/astro.config.mjs", astroConfig, /site: "https:\/\/patilu\.qeva\.xyz"/);

console.log("deployment contract passed");
