FROM node:24-alpine AS build

WORKDIR /workspace

ARG VITE_API_BASE_URL=https://patilulu.com/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
COPY apps/cms/package.json apps/cms/package.json
RUN npm ci

COPY apps/cms ./apps/cms
RUN npm --workspace apps/cms run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY apps/cms/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/cms/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
