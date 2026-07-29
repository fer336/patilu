FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY patilu-web/package.json patilu-web/package.json
COPY patilu-cms/package.json patilu-cms/package.json
RUN npm ci
COPY patilu-web ./patilu-web
RUN npm --workspace patilu-web run build

FROM node:24-alpine AS runtime
ENV HOST=0.0.0 PORT=8080 NODE_ENV=production
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/patilu-web/dist ./patilu-web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "const net=require('node:net');const socket=net.connect({host:'127.0.0.1',port:8080});socket.setTimeout(2000);socket.once('connect',()=>{socket.end();process.exit(0)});socket.once('timeout',()=>{socket.destroy();process.exit(1)});socket.once('error',()=>process.exit(1));"
CMD ["node", "patilu-web/dist/server/entry.mjs"]
