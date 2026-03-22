FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production=false

# Copy source
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# Install PM2 globally
RUN npm install -g pm2 ts-node

EXPOSE 3000

# Start with PM2 inside container
CMD ["pm2-runtime", "ecosystem.config.js"]
