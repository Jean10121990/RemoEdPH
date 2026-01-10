# Use the official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /workspace

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies - use npm install if package-lock.json doesn't exist
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production; \
    else \
      npm install --only=production; \
    fi

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (Cloud Run sets PORT env variable)
EXPOSE 8080

# Health check (optional, Cloud Run uses its own)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Define the command to run the application
CMD ["npm", "start"]
