FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制所有 Python 文件
COPY *.py .

# 使用 main.py 作为入口点
CMD ["python", "main.py"]