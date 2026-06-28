# Use a stable, pre-bundled Debian image containing Node 20 and Python 3.10
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory inside the container
WORKDIR /app

# Copy dependency definition files to leverage Docker layer caching
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY requirements.txt ./

# Install Node.js backend dependencies
RUN cd backend && npm install --production=false

# Install Node.js frontend dependencies
RUN cd frontend && npm install --production=false

# Install Python requirements
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the rest of the application files
COPY . .

# Compile Frontend (always runs cleanly when frontend files change)
RUN cd frontend && rm -rf dist && npm run build

# Make the startup script executable
RUN chmod +x start.sh

# Expose Django port internally (Node.js binds to $PORT dynamically)
EXPOSE 8000

# Start script orchestrator
CMD ["./start.sh"]