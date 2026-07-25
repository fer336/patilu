FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY patilu-web/package.json patilu-web/package.json
COPY patilu-cms/package.json patilu-cms/package.json
RUN npm ci

COPY patilu-cms ./patilu-cms
RUN npm --workspace patilu-cms run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY patilu-cms/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/patilu-cms/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
