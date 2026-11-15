FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs schema.sql ./
EXPOSE 8080
CMD ["sh", "-c", "node --input-type=module -e \"import pg from 'pg'; import { readFile } from 'node:fs/promises'; const p=new pg.Pool({connectionString:process.env.DATABASE_URL}); await p.query(await readFile('/app/schema.sql','utf8')); await p.end();\" && node server.mjs"]
