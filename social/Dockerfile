# Imagem para hospedar o Jarvis Social em qualquer serviço com Docker (Railway, Fly.io, VPS).
# Monte um volume em /data para não perder o banco e as mídias.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN node build.mjs
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
