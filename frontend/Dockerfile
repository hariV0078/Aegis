FROM node:22-alpine

WORKDIR /app/frontend

COPY frontend/package.json /app/frontend/package.json
RUN npm install

COPY frontend /app/frontend

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
