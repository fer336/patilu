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

const webDockerfile = read("patilu-web/Dockerfile");
assertIncludes("patilu-web/Dockerfile", webDockerfile, /FROM node:.* AS build/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /npm ci/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /npm --workspace patilu-web run build/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /FROM node:.* AS runtime/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /EXPOSE 8080/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /COPY --from=build .*patilu-web\/dist/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /dist\/server\/entry\.mjs/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /USER node/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /node:net/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /port:8080/);
assertNotIncludes("patilu-web/Dockerfile", webDockerfile, /127\.0\.0\.1:8080\//);
assertNotIncludes("patilu-web/Dockerfile", webDockerfile, /fetch\(|\/healthz/);

const cmsDockerfile = read("patilu-cms/Dockerfile");
assertIncludes("patilu-cms/Dockerfile", cmsDockerfile, /FROM node:.* AS build/);
assertIncludes("patilu-cms/Dockerfile", cmsDockerfile, /npm ci/);
assertIncludes("patilu-cms/Dockerfile", cmsDockerfile, /npm --workspace patilu-cms run build/);
assertIncludes("patilu-cms/Dockerfile", cmsDockerfile, /FROM nginxinc\/nginx-unprivileged:/);
assertIncludes("patilu-cms/Dockerfile", cmsDockerfile, /EXPOSE 8080/);

const cmsNginx = read("patilu-cms/nginx.conf");
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /listen 8080/);
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /location = \/healthz/);
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /location \/assets\//);
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /try_files \$uri =404/);
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /try_files \$uri \$uri\/ \/index\.html/);
assertIncludes("patilu-cms/nginx.conf", cmsNginx, /immutable/);

const apiDockerfile = read("patilu-api/Dockerfile");
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /FROM python:3\.12-slim/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /useradd/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /USER app/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /EXPOSE 8000/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /uvicorn app\.main:app/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /python -m app\.database/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--proxy-headers/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--forwarded-allow-ips=\*/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--root-path \/api/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /HEALTHCHECK/);
assertNotIncludes("patilu-api/Dockerfile", apiDockerfile, /CORS|SECRET/);

const stack = read("docker-stack.yml");
const webService = stack.slice(stack.indexOf("  patilu-web:"), stack.indexOf("  patilu-cms:"));
for (const service of ["patilu-web", "patilu-cms", "patilu-api"]) {
  assertIncludes("docker-stack.yml", stack, new RegExp(`${service}:`));
}
for (const service of ["postgres", "minio"]) {
  assertIncludes("docker-stack.yml", stack, new RegExp(`${service}:`));
}
const stackImages = [...stack.matchAll(/ghcr\.io\/fer336\/(patilu-(?:web|cms|api)):(\S+)/g)];
assert.equal(stackImages.length, 3, "docker-stack.yml must contain exactly three Patilu images");
assert.deepEqual(new Set(stackImages.map((match) => match[1])), new Set(["patilu-web", "patilu-cms", "patilu-api"]));
assert.equal(new Set(stackImages.map((match) => match[2])).size, 1, "stack image tags must be coherent");
assert.match(stackImages[0][2], /^(?:production|v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/);
assertNotIncludes("docker-stack.yml", stack, /ghcr\.io\/fer336\/patilu-(?:web|cms|api):latest/);
assertIncludes("docker-stack.yml", stack, /external: true/);
assertIncludes("docker-stack.yml", stack, /network_public/);
assertIncludes("docker-stack.yml", stack, /network_internal/);
assertIncludes("docker-stack.yml", stack, /postgres_data/);
assertIncludes("docker-stack.yml", stack, /minio_data/);
assertIncludes("docker-stack.yml", stack, /POSTGRES_PASSWORD_FILE: \/run\/secrets\/patilu_postgres_password/);
assertIncludes("docker-stack.yml", stack, /MINIO_ROOT_USER_FILE: \/run\/secrets\/patilu_minio_root_user/);
assertIncludes("docker-stack.yml", stack, /MINIO_ROOT_PASSWORD_FILE: \/run\/secrets\/patilu_minio_root_password/);
assertIncludes("docker-stack.yml", stack, /patilu_backend_env/);
assertIncludes("docker-stack.yml", stack, /target: \/run\/secrets\/backend\.env/);
assertNotIncludes("docker-stack.yml", stack, /\$\{[A-Z_]+:\?/);
assertNotIncludes("docker-stack.yml", stack, /API_ADMIN_TOKEN: \$/);
assertIncludes("docker-stack.yml", stack, /start_period: 75s/);
assertIncludes("docker-stack.yml", stack, /API_INTERNAL_URL/);
assertIncludes("docker-stack.yml patilu-web service", webService, /node:net/);
assertIncludes("docker-stack.yml patilu-web service", webService, /port:8080/);
assertNotIncludes("docker-stack.yml patilu-web service", webService, /127\.0\.0\.1:8080\//);
assertNotIncludes("docker-stack.yml patilu-web service", webService, /fetch\(|\/healthz/);
assertIncludes("docker-stack.yml", stack, /media-patilu\.qeva\.xyz/);
assertIncludes("docker-stack.yml", stack, /Host\(`patilu\.qeva\.xyz`\)/);
assertIncludes("docker-stack.yml", stack, /Host\(`cms-patilu\.qeva\.xyz`\)/);
assertIncludes("docker-stack.yml", stack, /PathPrefix\(`\/api`\)/);
assertIncludes("docker-stack.yml", stack, /stripprefix/);
assertIncludes("docker-stack.yml", stack, /priority=100/);
assertIncludes("docker-stack.yml", stack, /websecure/);
assertIncludes("docker-stack.yml", stack, /letsencryptresolver/);
assertNotIncludes("docker-stack.yml", stack, /ports:/);
assertNotIncludes("docker-stack.yml", stack, /build:/);

const workflow = read(".github/workflows/deploy.yml");
assertIncludes(".github/workflows/deploy.yml", workflow, /on:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /branches: \[main\]/);
assertIncludes(".github/workflows/deploy.yml", workflow, /pull_request:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /release:\n    types: \[published\]/);
assertNotIncludes(".github/workflows/deploy.yml", workflow, /workflow_dispatch:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /contents: read/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu-web test/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/deployment-contract\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/set-stack-version\.test\.mjs/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu-cms run typecheck/);
assertIncludes(".github/workflows/deploy.yml", workflow, /python -m pytest/);
assertIncludes(".github/workflows/deploy.yml", workflow, /docker\/build-push-action@v6/);
assertIncludes(".github/workflows/deploy.yml", workflow, /platforms: linux\/amd64/);
assertIncludes(".github/workflows/deploy.yml", workflow, /sha-\$\{\{ github\.sha \}\}/);
assertIncludes(".github/workflows/deploy.yml", workflow, /PORTAINER_WEBHOOK: \$\{\{ secrets\.PORTAINER_WEBHOOK \}\}/);
assertIncludes(".github/workflows/deploy.yml", workflow, /test -n "\$\{PORTAINER_WEBHOOK:-\}"/);
assertIncludes(".github/workflows/deploy.yml", workflow, /--url "\$PORTAINER_WEBHOOK"/);
assertNotIncludes(".github/workflows/deploy.yml", workflow, /PORTAINER_WEBHOOK_URL/);

for (const [job, nextJob] of [["build-web", "build-cms"], ["build-cms", "build-api"], ["build-api", "promote"]]) {
  const buildJob = jobSection(workflow, job, nextJob);
  assertIncludes(`${job} job`, buildJob, /if: github\.event_name == 'release' && github\.event\.action == 'published'/);
  assertIncludes(`${job} job`, buildJob, /:sha-\$\{\{ github\.sha \}\}/);
  assertNotIncludes(`${job} job`, buildJob, /:production/);
  assertNotIncludes(`${job} job`, buildJob, /:latest/);
}

const validation = jobSection(workflow, "release-validation", "build-web");
assertIncludes("release-validation job", validation, /\^v\(0\|\[1-9\]\[0-9\]\*\)/);
assertIncludes("release-validation job", validation, /git rev-parse origin\/main/);
assertIncludes("release-validation job", validation, /release_sha.*main_sha/);
assertIncludes("release-validation job", validation, /node scripts\/set-stack-version\.mjs --validate-release-lineage/);
assertIncludes("release-validation job", validation, /git diff-tree --no-commit-id --name-only/);

const promotion = jobSection(workflow, "promote", "update-stack");
assertIncludes("promote job", promotion, /needs: \[release-validation, build-web, build-cms, build-api\]/);
assertIncludes("promote job", promotion, /if: github\.event_name == 'release' && github\.event\.action == 'published'/);
assertIncludes("promote job", promotion, /images=\(patilu-web patilu-cms patilu-api\)/);
assertIncludes("promote job", promotion, /source=.*:sha-\$\{\{ github\.sha \}\}/);
assertIncludes("promote job", promotion, /docker buildx imagetools inspect "\$source"/);
assertIncludes("promote job", promotion, /github\.event\.release\.tag_name/);
assertNotIncludes("promote job", promotion, /:(?:latest|production)/);

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

assert.equal((workflow.match(/contents: write/g) ?? []).length, 1, "only update-stack may write contents");
for (const mutationJob of [promotion, updateStack, jobSection(workflow, "deploy")]) {
  assertIncludes("mutation job", mutationJob, /if: github\.event_name == 'release'/);
}

const deploy = jobSection(workflow, "deploy");
assertIncludes("deploy job", deploy, /needs: \[release-validation, update-stack\]/);
assertIncludes("deploy job", deploy, /github\.event\.action == 'published'/);
assertIncludes("deploy job", deploy, /needs\.release-validation\.result == 'success'/);
assertIncludes("deploy job", deploy, /permissions:\n      contents: read/);
assertIncludes("deploy job", deploy, /ref: \$\{\{ needs\.update-stack\.outputs\.stack_sha \}\}/);
assertIncludes("deploy job", deploy, /git rev-parse origin\/main.*needs\.update-stack\.outputs\.stack_sha/);
assertNotIncludes("deploy job", deploy, /needs: \[build-web, build-cms, build-api\]/);
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

const readme = read("README.md");
const outOfScope = readme.slice(readme.indexOf("## Out of scope"), readme.indexOf("## Required external inputs"));
assertNotIncludes("README out-of-scope section", outOfScope, /\bdeployment\b/i);
assertIncludes("README.md", readme, /## Deployment foundation/);

const dependabot = read(".github/dependabot.yml");
for (const directory of ["/", "/patilu-api", "/patilu-web", "/patilu-cms"]) {
  assertIncludes(".github/dependabot.yml", dependabot, new RegExp(`directory: "${directory}"`));
}
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "github-actions"/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "docker"/);
assertIncludes(".github/dependabot.yml", dependabot, /package-ecosystem: "uv"/);
assertIncludes(".github/dependabot.yml", dependabot, /groups:/);

const astroConfig = read("patilu-web/astro.config.mjs");
assertIncludes("patilu-web/astro.config.mjs", astroConfig, /site: "https:\/\/patilu\.qeva\.xyz"/);

console.log("deployment contract passed");
