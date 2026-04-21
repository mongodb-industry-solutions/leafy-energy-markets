FROM node:18-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build for production
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
