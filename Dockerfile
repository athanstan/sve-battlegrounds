# Development image: Node + pnpm. The source is bind-mounted by compose.yaml, so the image holds
# only the toolchain and never goes stale.
FROM node:22-slim

ENV PNPM_HOME=/pnpm \
    CI=true
ENV PATH="$PNPM_HOME:$PATH"

# Pin pnpm to the version the repository declares in package.json.
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app
