FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=5177
EXPOSE 5177
CMD ["node", "server.js"]
