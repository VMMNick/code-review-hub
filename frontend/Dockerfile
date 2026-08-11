# Build stage — compiles the React app to static assets
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Serve stage — nginx serves the static build and proxies API/WS calls to
# the backend service (see nginx.conf), same shape as the Vite dev proxy.
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
