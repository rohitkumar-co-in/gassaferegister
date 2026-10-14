# Multi-stage or single standard Apify Playwright container
FROM apify/actor-node-playwright-chrome:20

# Copy package definition files
COPY package*.json ./

# Install production dependencies without running audit or funding scripts
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional \
 && echo "Installed NPM packages:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# Copy actor source files
COPY . ./

# Start actor
CMD ["npm", "start"]
