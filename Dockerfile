# Use a stable, pre-bundled Node.js + Python Debian-based image
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory
WORKDIR /app

# ── خطوة إجبارية: نسخ الفولدرات بشكل صريح عشان نتفادى الـ .dockerignore ──
COPY backend/ /app/backend/
COPY HospitalManagement/ /app/HospitalManagement/
COPY requirements.txt* start.sh* /app/

# ── تنزيل مكتبات البايثون ──
RUN pip install --upgrade pip && \
    find /app -name "requirements.txt" -not -path "*/node_modules/*" | head -1 | xargs pip install -r

# ── تنزيل مكتبات الـ Node ──
RUN cd /app/backend && npm install --production=false

# ── تظبيط صلاحيات سكريبت التشغيل ──
RUN chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]