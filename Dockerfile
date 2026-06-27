# Use a stable, pre-bundled Node.js and Python Debian-based image
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory to the root-level project folder inside the container
WORKDIR /app/doctor-recommend-system-main

# Copy dependency files first from the respective paths to leverage Docker layer caching
COPY doctor-recommend-system-main/backend/package*.json ./backend/
COPY doctor-recommend-system-main/requirements.txt ./

# Install Node.js dependencies
RUN cd backend && npm install --production=false

# Install Python dependencies
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the entire workspace code into the container
COPY . /app

# Expose ports for Node.js (5000) and Django (8000)
EXPOSE 5000
EXPOSE 8000

# Run migrations, seed the medical database, start Django in the background, and launch Node.js in the foreground
CMD ["sh", "-c", "python HospitalManagement/manage.py migrate && python HospitalManagement/seed_medical_data.py && python HospitalManagement/seed_data.py && (python HospitalManagement/manage.py runserver 0.0.0.0:8000 &) && cd backend && node server.js"]
