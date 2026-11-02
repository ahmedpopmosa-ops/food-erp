# API image: build in a full Node image, run as an unprivileged user with production dependencies only.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @ros/api --include-workspace-root=false --ignore-scripts
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN npm run build -w @ros/contracts -w @ros/domain \
 && npx --workspace @ros/api prisma generate \
 && npm run build -w @ros/api \
 && npm prune --omit=dev --workspace @ros/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/
USER node
EXPOSE 4000
# Migrations are a separate release step run with the owner role: `npm run db:migrate -w @ros/api`.
CMD ["node", "apps/api/dist/src/main.js"]
