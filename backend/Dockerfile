FROM mcr.microsoft.com/playwright:v1.58.1-jammy

WORKDIR /app

# Install dependencies for Prisma
RUN apt-get update -y && apt-get install -y openssl curl

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
