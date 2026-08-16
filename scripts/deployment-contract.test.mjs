import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { validateStackDeploy } from "./validate-stack-deploy.mjs";

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

const dockerfile = read("apps/www/Dockerfile");
assertIncludes("apps/www/Dockerfile", dockerfile, /FROM node:.* AS build/);
assertIncludes("apps/www/Dockerfile", dockerfile, /WORKDIR \/workspace\/patilu/);
assertIncludes("apps/www/Dockerfile", dockerfile, /COPY apps\/www\/package\.json \.\/package\.json/);
assertIncludes("apps/www/Dockerfile", dockerfile, /npm install/);
assertIncludes("apps/www/Dockerfile", dockerfile, /COPY apps\/www\/ \.\//);
assertIncludes("apps/www/Dockerfile", dockerfile, /npm run build/);
assertIncludes("apps/www/Dockerfile", dockerfile, /FROM node:.* AS runtime/);
assertIncludes("apps/www/Dockerfile", dockerfile, /EXPOSE 8080/);
assertIncludes("apps/www/Dockerfile", dockerfile, /USER node/);
assertIncludes("apps/www/Dockerfile", dockerfile, /node:net/);
assertIncludes("apps/www/Dockerfile", dockerfile, /port:8080/);
assertIncludes("apps/www/Dockerfile", dockerfile, /WORKDIR \/workspace\/patilu/);
assertIncludes("apps/www/Dockerfile", dockerfile, /\/workspace\/patilu\/node_modules/);
assertIncludes("apps/www/Dockerfile", dockerfile, /\/workspace\/patilu\/dist/);
assertNotIncludes("apps/www/Dockerfile", dockerfile, /127\.0\.0\.1:8080\//);
assertNotIncludes("apps/www/Dockerfile", dockerfile, /fetch\(|\/healthz/);

const stackDeployValidator = read("scripts/validate-stack-deploy.mjs");
assertIncludes("scripts/validate-stack-deploy.mjs", stackDeployValidator, /setStackVersion/);
assertIncludes("scripts/validate-stack-deploy.mjs", stackDeployValidator, /changed beyond the release image pin/);
assertIncludes("scripts/validate-stack-deploy.mjs", stackDeployValidator, /stable SemVer/);
assertIncludes("scripts/validate-stack-deploy.mjs", stackDeployValidator, /validateDeployProvenance/);

const stack = read("docker-stack.yml");
assertIncludes("docker-stack.yml", stack, /patilu:/);
assertNotIncludes("docker-stack.yml", stack, /patilu-web:/);
assertIncludes("docker-stack.yml", stack, /patilu-cms:/);
assertIncludes("docker-stack.yml", stack, /patilu-api:/);
assertNotIncludes("docker-stack.yml", stack, /^ {2}postgres:/m);
const stackImages = [...stack.matchAll(/ghcr\.io\/fer336\/(patilu(?:-api|-cms)?):(\S+)/g)];
assert.equal(stackImages.length, 3, "docker-stack.yml must contain exactly three Patilu images");
assert.deepEqual(stackImages.map((match) => match[1]).sort(), ["patilu", "patilu-api", "patilu-cms"]);
const stackTags = new Set(stackImages.map((match) => match[2]));
assert.equal(stackTags.size, 1, "docker-stack.yml Patilu images must use one coherent tag");
assert.match([...stackTags][0], /^(?:production|v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/);
assertNotIncludes("docker-stack.yml", stack, /ghcr\.io\/fer336\/patilu:latest/);
assertIncludes("docker-stack.yml", stack, /external: true/);
assertIncludes("docker-stack.yml", stack, /network_public/);
assertNotIncludes("docker-stack.yml", stack, /network_internal/);
assertNotIncludes("docker-stack.yml", stack, /postgres_data/);
assertNotIncludes("docker-stack.yml", stack, /patilu_postgres_password/);
assertIncludes("docker-stack.yml", stack, /patilu_backend_env:/);
assertIncludes("docker-stack.yml", stack, /target: backend\.env/);
assertNotIncludes("docker-stack.yml", stack, /API_INTERNAL_URL/);
assertNotIncludes("docker-stack.yml", stack, /CORS_ORIGINS/);
assertNotIncludes("docker-stack.yml", stack, /MEDIA_PUBLIC_URL/);
assertIncludes("docker-stack.yml", stack, /stripprefix\.prefixes=\/api/);
assertIncludes("docker-stack.yml", stack, /PathPrefix\(`\/api`\)/);
assertIncludes("docker-stack.yml", stack, /priority=100/);
assertNotIncludes("docker-stack.yml", stack, /cms-patilu\.qeva\.xyz/);
assertNotIncludes("docker-stack.yml", stack, /patilu\.qeva\.xyz/);
assertIncludes("docker-stack.yml", stack, /Host\(`patilulu\.com`\)/);
assertIncludes("docker-stack.yml", stack, /Host\(`patilulu\.com`\) && PathPrefix\(`\/api`\)/);
assertIncludes("docker-stack.yml", stack, /Host\(`cms-patilulu\.com`\)/);
assertIncludes("docker-stack.yml", stack, /Host\(`www\.patilulu\.com`\)/);
assertIncludes("docker-stack.yml", stack, /redirectregex\.replacement=https:\/\/patilulu\.com\/\$\$\{1\}/);
assertIncludes("docker-stack.yml", stack, /redirectregex\.permanent=true/);
assertIncludes("docker-stack.yml", stack, /patilu-api\.loadbalancer\.server\.port=8000/);
assertIncludes("docker-stack.yml", stack, /patilu-cms\.loadbalancer\.server\.port=8080/);
assertNotIncludes("docker-stack.yml", stack, /ports:/);
assertNotIncludes("docker-stack.yml", stack, /build:/);

const previousStackFixture = stack.replace(/:(?:production|v\d+\.\d+\.\d+)/g, ":v8.9.10");
const currentStackFixture = stack.replace(/:(?:production|v\d+\.\d+\.\d+)/g, ":v8.9.11");
assert.equal(validateStackDeploy(previousStackFixture, currentStackFixture), "v8.9.11");
assert.throws(() => validateStackDeploy(previousStackFixture, currentStackFixture.replace("patilu:v8.9.11", "patilu:latest")), /coherent|stable SemVer/);
assert.throws(() => validateStackDeploy(previousStackFixture, `${currentStackFixture}\n# unrelated change\n`), /changed beyond/);
assert.throws(() => validateStackDeploy(currentStackFixture, currentStackFixture), /did not change/);

const workflow = read(".github/workflows/deploy.yml");
assertIncludes(".github/workflows/deploy.yml", workflow, /on:/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /branches: \[main\]/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /tags: \["v\*"\]/);
  assertIncludes(".github/workflows/deploy.yml", workflow, /release:\n    types: \[published\]/);
  assertNotIncludes(".github/workflows/deploy.yml", workflow, /workflow_dispatch:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /contents: read/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/deployment-contract\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/set-stack-version\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/validate-stack-deploy\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace apps\/www test/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace apps\/www run typecheck/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace apps\/www run build/);
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
assertIncludes("build job", buildJob, /file: apps\/www\/Dockerfile/);
assertIncludes("build job", buildJob, /file: \$\{\{ matrix\.dockerfile \}\}/);
assertIncludes("build job", buildJob, /context: \$\{\{ matrix\.context \}\}/);
assertIncludes("build job", buildJob, /image: patilu-api/);
assertIncludes("build job", buildJob, /context: apps\/api/);
assertIncludes("build job", buildJob, /dockerfile: Dockerfile/);
assertIncludes("build job", buildJob, /image: patilu-cms/);
assertIncludes("build job", buildJob, /dockerfile: apps\/cms\/Dockerfile/);
assertIncludes("build job", buildJob, /VITE_API_BASE_URL=https:\/\/patilulu\.com\/api/);

const validation = jobSection(workflow, "release-validation", "build");
assertIncludes("release-validation job", validation, /\^v\(0\|\[1-9\]\[0-9\]\*\)/);
assertIncludes("release-validation job", validation, /git rev-parse origin\/main/);
assertIncludes("release-validation job", validation, /release_sha.*main_sha/);
assertIncludes("release-validation job", validation, /merge-base --is-ancestor "\$release_sha" "\$main_sha"/);
assertIncludes("release-validation job", validation, /RELEASE_IS_ANCESTOR/);
assertIncludes("release-validation job", validation, /node scripts\/set-stack-version\.mjs --validate-release-lineage/);
assertIncludes("release-validation job", validation, /git diff --name-only "\$release_sha" "\$main_sha"/);
assertNotIncludes("release-validation job", validation, /COMMIT_SUBJECT|AUTHOR_NAME|COMMITTER_NAME|PARENT_SHAS/);

const promote = jobSection(workflow, "promote", "update-stack");
assertIncludes("promote job", promote, /needs: \[release-validation, build\]/);
assertIncludes("promote job", promote, /if: github\.event_name == 'release' && github\.event\.action == 'published'/);
assertIncludes("promote job", promote, /for image in patilu patilu-api patilu-cms/);
assertIncludes("promote job", promote, /source="\$\{REGISTRY\}\/\$\{IMAGE_OWNER\}\/\$\{image\}:sha-\$\{\{ github\.sha \}\}"/);
assertIncludes("promote job", promote, /docker buildx imagetools inspect "\$source"/);
assertIncludes("promote job", promote, /github\.event\.release\.tag_name/);
assertNotIncludes("promote job", promote, /:(?:latest|production)/);

const updateStack = jobSection(workflow, "update-stack", "deploy");
assertIncludes("update-stack job", updateStack, /needs: \[release-validation, promote\]/);
assertIncludes("update-stack job", updateStack, /contents: write/);
assertIncludes("update-stack job", updateStack, /pull-requests: write/);
assertIncludes("update-stack job", updateStack, /git rev-parse HEAD/);
assertIncludes("update-stack job", updateStack, /git rev-parse origin\/main/);
assertIncludes("update-stack job", updateStack, /node scripts\/set-stack-version\.mjs/);
assertIncludes("update-stack job", updateStack, /persist-credentials: false/);
assertIncludes("update-stack job", updateStack, /GH_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}/);
assertIncludes("update-stack job", updateStack, /RELEASE_PR_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}/);
assertIncludes("update-stack job", updateStack, /test -n "\$\{RELEASE_PR_TOKEN:-\}"/);
assertIncludes("update-stack job", updateStack, /git remote set-url origin "https:\/\/x-access-token:\$\{RELEASE_PR_TOKEN\}@github\.com\/\$\{\{ github\.repository \}\}\.git"/);
assertIncludes("update-stack job", updateStack, /STACK_BRANCH: chore\/pin-stack-\$\{\{ github\.event\.release\.tag_name \}\}/);
assertIncludes("update-stack job", updateStack, /git fetch origin "refs\/heads\/\$STACK_BRANCH:refs\/remotes\/origin\/\$STACK_BRANCH" \|\| true/);
assertIncludes("update-stack job", updateStack, /remote_stack_sha=.*refs\/remotes\/origin\/\$STACK_BRANCH/);
assertIncludes("update-stack job", updateStack, /git add docker-stack\.yml/);
assertIncludes("update-stack job", updateStack, /git push --force-with-lease="refs\/heads\/\$STACK_BRANCH:\$remote_stack_sha" origin "HEAD:refs\/heads\/\$STACK_BRANCH"/);
assertIncludes("update-stack job", updateStack, /git push origin "HEAD:refs\/heads\/\$STACK_BRANCH"/);
assertIncludes("update-stack job", updateStack, /gh pr list --head "\$STACK_BRANCH" --base main/);
assertIncludes("update-stack job", updateStack, /gh pr create --head "\$STACK_BRANCH" --base main/);
assertIncludes("update-stack job", updateStack, /gh pr edit "\$pr_url"/);
assertIncludes("update-stack job", updateStack, /body-file "\$body_file"/);
assertIncludes("update-stack job", updateStack, /EXPECTED_MAIN_SHA:.*main_sha/);
assertIncludes("update-stack job", updateStack, /pr_url=.*GITHUB_OUTPUT/);
assertNotIncludes("update-stack job", updateStack, /git push origin main/);
assertNotIncludes("update-stack job", updateStack, /exit 0/);

assert.equal((workflow.match(/contents: write/g) ?? []).length, 1, "only update-stack may write contents");
assertNotIncludes("workflow", workflow, /git push origin main/);
for (const mutationJob of [promote, updateStack]) {
  assertIncludes("mutation job", mutationJob, /if: github\.event_name == 'release'/);
}

const deploy = jobSection(workflow, "deploy");
assertIncludes("deploy job", deploy, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
assertIncludes("deploy job", deploy, /needs: \[checks\]/);
assertIncludes("deploy job", deploy, /permissions:\n      contents: read\n      packages: read/);
assertIncludes("deploy job", deploy, /Detect stack-only SemVer pin/);
assertIncludes("deploy job", deploy, /github\.event\.before/);
assertIncludes("deploy job", deploy, /changed_files.*docker-stack\.yml/);
assertIncludes("deploy job", deploy, /git show "\$\{\{ github\.event\.before \}\}:docker-stack\.yml"/);
assertIncludes("deploy job", deploy, /node scripts\/validate-stack-deploy\.mjs --before/);
assertIncludes("deploy job", deploy, /stack_tag=.*GITHUB_OUTPUT/);
assertIncludes("deploy job", deploy, /deploy_stack=true/);
assertIncludes("deploy job", deploy, /steps\.stack-pin\.outputs\.deploy_stack == 'true'/);
assertIncludes("deploy job", deploy, /gh release view "\$\{\{ steps\.stack-pin\.outputs\.stack_tag \}\}" --json tagName,isDraft,isPrerelease/);
assertIncludes("deploy job", deploy, /docker\/login-action@v3/);
assertIncludes("deploy job", deploy, /docker\/setup-buildx-action@v3/);
assertIncludes("deploy job", deploy, /for image in patilu patilu-api patilu-cms/);
assertIncludes("deploy job", deploy, /image_reference="\$\{REGISTRY\}\/\$\{IMAGE_OWNER\}\/\$\{image\}:\$\{\{ steps\.stack-pin\.outputs\.stack_tag \}\}"/);
assertIncludes("deploy job", deploy, /docker buildx imagetools inspect "\$image_reference"/);
assertIncludes("deploy job", deploy, /node scripts\/validate-stack-deploy\.mjs/);
assertIncludes("deploy job", deploy, /--release-metadata "\$RUNNER_TEMP\/release\.json"/);
assertIncludes("deploy job", deploy, /--image-reference "\$image_references"/);
assertNotIncludes("deploy job", deploy, /github\.event\.action == 'published'/);
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
assertIncludes("tag-deploy job", tagDeploy, /context: \$\{\{ matrix\.context \}\}/);
assertIncludes("tag-deploy job", tagDeploy, /file: apps\/www\/Dockerfile/);
assertIncludes("tag-deploy job", tagDeploy, /file: \$\{\{ matrix\.dockerfile \}\}/);
assertIncludes("tag-deploy job", tagDeploy, /image: patilu-api/);
assertIncludes("tag-deploy job", tagDeploy, /image: patilu-cms/);
assertIncludes("tag-deploy job", tagDeploy, /platforms: linux\/amd64/);
assertIncludes("tag-deploy job", tagDeploy, /github\.ref_name/);
assertIncludes("tag-deploy job", tagDeploy, /contents: read/);
assertNotIncludes("tag-deploy job", tagDeploy, /node scripts\/set-stack-version\.mjs/);
assertNotIncludes("tag-deploy job", tagDeploy, /git add docker-stack\.yml/);
assertNotIncludes("tag-deploy job", tagDeploy, /git push origin main/);
assertNotIncludes("tag-deploy job", tagDeploy, /PORTAINER_WEBHOOK: \$\{\{ secrets\.PORTAINER_WEBHOOK \}\}/);

const readme = read("README.md");
const outOfScope = readme.slice(readme.indexOf("## Out of scope"), readme.indexOf("## Required external inputs"));
assertNotIncludes("README out-of-scope section", outOfScope, /\bdeployment\b/i);
assertIncludes("README.md", readme, /## Deployment foundation/);

const dependabot = read(".github/dependabot.yml");
for (const directory of ["/", "/apps/www"]) {
  assertIncludes(".github/dependabot.yml", dependabot, new RegExp(`directory: "${directory}"`));
}
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-api/);
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-web/);
assertNotIncludes(".github/dependabot.yml", dependabot, /patilu-cms/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "github-actions"/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "docker"/);
assertIncludes(".github/dependabot.yml", dependabot, /groups:/);

const astroConfig = read("apps/www/astro.config.mjs");
assertIncludes("apps/www/astro.config.mjs", astroConfig, /site: "https:\/\/patilulu\.com"/);
assertNotIncludes("apps/www/astro.config.mjs", astroConfig, /patilu\.qeva\.xyz/);

console.log("deployment contract passed");
