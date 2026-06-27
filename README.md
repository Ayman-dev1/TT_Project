# Tabibi - Healthcare Platform

Tabibi is a comprehensive healthcare system integrating a React frontend, a Node.js/Express.js backend, and a Django-based Artificial Intelligence recommendation system that assists patients in identifying clinical specialties based on symptoms and matches them with available doctors.

---

## Project Structure

The project is organized into three primary directories:
- **/backend**: Express.js server providing the application API, MongoDB integration, and a Custom Security Layer (WAF, rate limiters, guards).
- **/frontend**: React web application bundled with Vite and styled using Tailwind CSS.
- **/doctor-recommend-system-main**: Django API running the medical NLP recommendation engine.
- **/Security_Layer**: Contains static assets and configuration for the Security Operations Center (SOC) dashboard.

---

## Prerequisites

Before running the application, make sure you have the following installed on your machine:
1. **Node.js** (v18.x or later recommended) & `npm`
2. **Python** (v3.10.x recommended) & `pip`
3. **MongoDB** (A local database instance or a MongoDB Atlas Cluster connection URI)
4. **SQLite3** (Usually bundled with Python)

---

## Step-by-Step Installation & Startup

### 1. Run the Backend (Node.js / Express)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up the `.env` file in the `/backend` folder. You can use the configuration detailed in the [Environment Variables](#environment-variables) section below.
4. Run the seed scripts to populate MongoDB with initial doctors, patients, and an admin user (optional, see [Database Setup & Seeding](#database-setup--seeding)):
   ```bash
   # Seed default admin account
   node scripts/seedAdmin.js
   
   # Seed sample doctors, patients, and appointments
   node scripts/seedData.js
   ```
5. Start the backend:
   - **Development**:
     ```bash
     npm run dev
     ```
   - **Production**:
     ```bash
     npm start
     ```
   The backend will run on **`http://localhost:5000`**.

---

### 2. Run the AI Recommendation System (Django)

1. Navigate to the Django directory:
   ```bash
   cd doctor-recommend-system-main
   ```
2. Create a Python virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   - **Windows (CMD/PowerShell)**:
     ```powershell
     .\venv\Scripts\activate
     ```
   - **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```
4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
6. Run the medical and doctor database seed scripts:
   ```bash
   # Seed specialties and keywords for Arabic/English deterministic lookup
   python seed_medical_data.py
   
   # Seed sample specialties and dummy doctors for ML fallback mapping
   python seed_data.py
   ```
7. Start the Django development server:
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```
   The Django server will run on **`http://localhost:8000`**.

---

### 3. Run the Frontend (React / Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will run on **`http://localhost:3000`**.

---

## Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

| Variable | Description | Example / Default Value |
|---|---|---|
| `PORT` | Port number on which the Node server listens. | `5000` |
| `MONGO_URI` | Connection URI for the MongoDB Database. | `mongodb+srv://...` or `mongodb://localhost:27017/tabibi` |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens (JWT). | `your-super-secret-key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name for media uploads. | `dmoh4dbxt` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key. | `979377684541113` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret. | `your-cloudinary-api-secret` |
| `SECURITY_LAYER_ENABLED` | Toggle to enable/disable the built-in WAF globally. | `true` |
| `SECURITY_WAF_ENABLED` | Toggle the Web Application Firewall. | `true` |
| `SECURITY_APPOINTMENT_GUARD_ENABLED`| Enable rate-limiting protection for bookings. | `true` |
| `SECURITY_RATING_GUARD_ENABLED` | Enable rate-limiting protection for doctor ratings. | `true` |
| `SECURITY_GEO_VELOCITY_ENABLED` | Enable geographically impossible login detection. | `true` |
| `SOC_REQUIRE_AUTH` | Force authentication to view the SOC dashboard (`/soc`). | `false` |
| `SOC_ADMIN_TOKEN` | Admin bearer token used for unblocking and operations. | `TABIBI-SOC-TOKEN-2026` |
| `RECOVERY_PASSWORD` | Passphrase used to recover or override security configurations. | `TABIBI-RECOVERY-2026` |
| `AUDIT_SIGN_KEY` | Secret key used to sign audit trails. | `tabibi-audit-sign-key-change-in-prod` |
| `PHI_SIGN_KEY` | Secret key used to cryptographically sign PHI records. | `tabibi-phi-sign-key-change-in-prod` |
| `SOC_ALARM_HEALTH` | The health threshold below which warning alarms fire. | `50` |
| `SOC_SHUTDOWN_HEALTH` | The critical health threshold below which panic mode locks down. | `40` |
| `SOC_MAX_LOG_ENTRIES` | Maximum number of threat logs stored in the local file. | `5000` |
| `SOC_AUDIT_SIGNING` | Toggle cryptographically signed audit logs. | `true` |
| `PHI_MAX_LOG_ENTRIES` | Maximum number of PHI access logs stored. | `10000` |
| `SOC_BRUTE_WINDOW_MS` | Time window (ms) for brute-force login checks. | `60000` (1 min) |
| `SOC_BRUTE_LIMIT` | Request limit within the brute-force window. | `10` |
| `SOC_LOGIN_BRUTE_LIMIT` | Failed login attempt limit before IP ban. | `3` |
| `SOC_ENDPOINT_WINDOW_MS` | General rate limit window (ms). | `60000` (1 min) |
| `SOC_ENDPOINT_LIMIT` | Maximum requests per IP in the general window. | `60` |
| `SOC_TEMPBAN_MS` | Duration (ms) for temporary IP ban on limit violation. | `600000` (10 mins) |
| `GUARD_USER_BOOK_LIMIT` | Maximum appointment bookings allowed per user per window. | `5` |
| `GUARD_USER_WINDOW_MS` | Booking window restriction duration (ms). | `3600000` (1 hour) |
| `GUARD_PAYMENT_TIMEOUT_MS` | Timeout for appointment payment (ms). | `600000` (10 mins) |
| `GUARD_RAPID_CANCEL_MS` | Time threshold (ms) to detect rapid booking cancellations. | `30000` (30 sec) |
| `GUARD_DOCTOR_TARGET_LIMIT` | Max appointment requests target per doctor. | `20` |
| `GUARD_SUBNET_LIMIT` | Subnet rate restriction for appointment creations. | `10` |
| `RATING_IP_LIMIT` | Maximum ratings allowed per IP address. | `3` |
| `RATING_SUBNET_LIMIT` | Maximum ratings allowed per subnet. | `8` |
| `RATING_USER_LIMIT` | Maximum ratings allowed per user. | `5` |
| `RATING_WINDOW_MS` | Time window (ms) for rating rate-limiting. | `3600000` (1 hour) |
| `SOC_ALLOWED_ORIGINS` | List of allowed CORS origins for the backend Socket.IO. | `http://localhost:3000,http://127.0.0.1:3000` |
| `TRUSTED_PROXIES` | Comma-separated list of trusted upstream proxies. | `""` |

---

## Database Setup & Seeding

### 1. MongoDB (Express Server)
Ensure MongoDB is running locally or configured through Atlas, and its URI is saved in your `/backend/.env` file.
Seeding commands:
* **`node scripts/seedAdmin.js`**: Creates a default system administrator account (`email: admin1@tabibi.com`, `password: tabibiAdmin2026_1`).
* **`node scripts/seedData.js`**: Creates sample patients (`ali@example.com`, `sara@example.com` - all passwords are `password123`), doctors, and appointments.

### 2. SQLite3 (Django recommendation server)
Ensure you apply standard migrations and seed both medical mapping keywords and doctor specialties:
```bash
python manage.py migrate
python seed_medical_data.py
python seed_data.py
```

---

## Common Startup Issues & Fixes

### 1. IP Blocked: Access Denied (`127.0.0.1`)
**Problem**: During testing or frontend interactions, the Web Application Firewall (WAF) blocks your localhost IP if malicious strings or repeated bad requests are detected, saving them in `backend/attacks.json`.
**Solution**: Unblock your IP by making a POST request to the unblock endpoint:
```bash
curl -X POST http://localhost:5000/api/unblock-ip -H "Content-Type: application/json" -d "{\"ip\": \"127.0.0.1\"}"
```
Alternatively, you can delete `backend/attacks.json` and restart the backend server.

### 2. Django Model Files Missing
**Problem**: The Django NLP Recommender system fails to load, complaining about missing models (`model_random_forest.pkl`, `label_encoder_disease.pkl`, etc.).
**Solution**: Check that the PKL files are in `doctor-recommend-system-main/ai_engine/`. If they are not found there, copy them into the fallback directory `d:\tabibi\output` as defined in `ai_engine/predictor.py`.

### 3. Socket.IO / CORS Block Errors
**Problem**: The frontend or SOC dashboard cannot connect to the backend Socket.IO instance.
**Solution**: Verify that `SOC_ALLOWED_ORIGINS` in `backend/.env` matches the frontend server URL (e.g., `http://localhost:3000` or `http://localhost:5173`).
