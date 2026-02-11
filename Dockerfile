FROM python:3.9-slim

WORKDIR /app

# 复制项目文件
COPY server.py .
COPY index.html .
COPY assets ./assets

# 创建数据卷挂载点
VOLUME /app/data

# 暴露端口
EXPOSE 80

# 启动服务
CMD ["python", "server.py"]
