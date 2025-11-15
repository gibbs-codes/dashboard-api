# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first (for better caching)
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy the rest of the application code
COPY . .

# Set permissions for the non-root user
RUN chown -R nodejs:nodejs /usr/src/app

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health

# Define the command to run the app
CMD ["npm", "start"]
