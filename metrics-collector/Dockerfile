FROM ubuntu:18.04

RUN apt-get update -y
RUN apt-get install -y python3.6
RUN apt-get install -y python3-pip python-dev build-essential

COPY . /app
WORKDIR /app

RUN pip3 install --no-cache-dir -r /app/requirements.txt

ENTRYPOINT ["python3"]
CMD ["app.py"]


