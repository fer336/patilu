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
assertIncludes("patilu-web/Dockerfile", webDockerfile, /FROM nginxinc\/nginx-unprivileged:/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /EXPOSE 8080/);
assertIncludes("patilu-web/Dockerfile", webDockerfile, /COPY --from=build .*patilu-web\/dist/);

const webNginx = read("patilu-web/nginx.conf");
assertIncludes("patilu-web/nginx.conf", webNginx, /listen 8080/);
assertIncludes("patilu-web/nginx.conf", webNginx, /location = \/healthz/);
assertIncludes("patilu-web/nginx.conf", webNginx, /location \/_astro\//);
assertIncludes("patilu-web/nginx.conf", webNginx, /immutable/);
assertIncludes("patilu-web/nginx.conf", webNginx, /location ~\* \^\/assets\/.*\\\.webp\$/);
assertIncludes("patilu-web/nginx.conf", webNginx, /no-cache/);
assertNotIncludes("patilu-web/nginx.conf", webNginx, /try_files \$uri \/index\.html/);

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
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--proxy-headers/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--forwarded-allow-ips=\*/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /--root-path \/api/);
assertIncludes("patilu-api/Dockerfile", apiDockerfile, /HEALTHCHECK/);
assertNotIncludes("patilu-api/Dockerfile", apiDockerfile, /CORS|SECRET/);

const stack = read("docker-stack.yml");
for (const service of ["patilu-web", "patilu-cms", "patilu-api"]) {
  assertIncludes("docker-stack.yml", stack, new RegExp(`${service}:`));
}
for (const image of [
  "ghcr.io/fer336/patilu-web:production",
  "ghcr.io/fer336/patilu-cms:production",
  "ghcr.io/fer336/patilu-api:production",
]) {
  assertIncludes("docker-stack.yml", stack, new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assertIncludes("docker-stack.yml", stack, /external: true/);
assertIncludes("docker-stack.yml", stack, /network_public/);
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
assertIncludes(".github/workflows/deploy.yml", workflow, /workflow_dispatch:/);
assertIncludes(".github/workflows/deploy.yml", workflow, /branches: \[main\]/);
assertIncludes(".github/workflows/deploy.yml", workflow, /contents: read/);
assertIncludes(".github/workflows/deploy.yml", workflow, /packages: write/);
assertIncludes(".github/workflows/deploy.yml", workflow, /npm --workspace patilu-web test/);
assertIncludes(".github/workflows/deploy.yml", workflow, /node scripts\/deployment-contract\.test\.mjs/);
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
  assertIncludes(`${job} job`, buildJob, /:sha-\$\{\{ github\.sha \}\}/);
  assertNotIncludes(`${job} job`, buildJob, /:production/);
}

const promotion = jobSection(workflow, "promote", "deploy");
assertIncludes("promote job", promotion, /needs: \[build-web, build-cms, build-api\]/);
assertIncludes("promote job", promotion, /if: github\.ref == 'refs\/heads\/main'/);
assertIncludes("promote job", promotion, /images=\(patilu-web patilu-cms patilu-api\)/);
assertIncludes("promote job", promotion, /docker buildx imagetools inspect .*:sha-\$\{\{ github\.sha \}\}/);
assertIncludes("promote job", promotion, /docker buildx imagetools create --tag .*:production.*:sha-\$\{\{ github\.sha \}\}/);

const deploy = jobSection(workflow, "deploy");
assertIncludes("deploy job", deploy, /needs: promote/);
assertIncludes("deploy job", deploy, /if: github\.ref == 'refs\/heads\/main'/);
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
