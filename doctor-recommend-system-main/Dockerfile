FROM python:3.10-slim

ENV PYTHONUNBUFFERED 1

RUN apt-get update -y && \
    apt-get install -y binutils libproj-dev gdal-bin

WORKDIR /backend-api

COPY requirements.txt /backend-api/
RUN python -m pip install --upgrade pip
RUN python -m pip install -r requirements.txt

COPY . /backend-api/

# Spacy models
RUN python -m spacy download en_core_web_md
RUN python -m pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.1/en_core_sci_md-0.5.1.tar.gz

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
