FROM node:24-bookworm-slim AS dependencies
RUN npm install --global npm@11.20.0
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM dependencies AS backend
COPY --chown=node:node . .
# The world's durable result outbox lives here (a volume in compose.yml); it must belong to the runtime user.
RUN mkdir -p /app/.data/world && chown node:node /app/.data/world
USER node
ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "@bar/api"]

FROM dependencies AS web-build
COPY . .
ARG VITE_GAME_URL=/game
ENV VITE_GAME_URL=$VITE_GAME_URL
RUN npm run build -w @bar/web

FROM nginx:1.28-alpine AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
