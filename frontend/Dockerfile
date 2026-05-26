FROM node:18-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .

# Backend URL for API rewrites — set at build time
ARG NEXT_PUBLIC_API_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build for production (rewrites are baked into the build)
RUN npm run build

EXPOSE 8080

ENV PORT=8080

CMD ["npm", "start"]
