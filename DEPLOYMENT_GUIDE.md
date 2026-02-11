# 山科智能科研管理系统 - Linux Docker 部署手册

本手册指导如何在 Linux 服务器上使用 Docker 部署本系统，并集成 OpenClaw 服务。

---

## 1. 部署架构说明

我们采用 **Docker Compose** 进行容器化部署，以实现服务隔离和统一管理。

*   **服务 A (本项目)**: `kimi-agent-app`
    *   **端口**: `9527` (已调整，避免冲突)
    *   **功能**: 前端页面托管 + 数据持久化后端
    *   **安全**: 内置登录认证，默认密码保护

*   **服务 B (OpenClaw)**: `openclaw-app`
    *   **端口**: `3000` (默认，可调整)
    *   **注意**: `docker-compose.yml` 中包含示例配置，请根据 OpenClaw 官方文档替换镜像名称。

---

## 2. 环境准备

在 Linux 服务器（Ubuntu/CentOS）上安装 Docker：

```bash
# Ubuntu
sudo apt-get update
sudo apt-get install docker.io docker-compose -y

# CentOS
sudo yum install docker docker-compose -y
sudo systemctl start docker
sudo systemctl enable docker
```

---

## 3. 部署步骤

### 3.1 上传文件
将项目文件夹 `Kimi_Agent_Deployment_v7` 上传至服务器，例如 `/opt/kimi-agent`。

### 3.2 启动服务
进入目录并启动容器：

```bash
cd /opt/kimi-agent
sudo docker-compose up -d --build
```

### 3.3 验证部署
1.  **访问本项目**: 浏览器打开 `http://服务器IP:9527`
2.  **访问 OpenClaw**: 浏览器打开 `http://服务器IP:3000`

---

## 4. 安全配置指南 (重要)

### 4.1 初始登录
为防止未授权的数据修改，系统启用了强制身份验证。
*   **默认管理员密码**: `KimiAgent@2026`
*   **登录方式**: 首次打开页面时，会弹出登录框，请输入上述密码。

### 4.2 修改密码 (强烈推荐)
部署完成后，请立即修改默认密码：
1.  登录成功后，点击页面右下角的 **“修改密码”** 按钮。
2.  输入旧密码 (`KimiAgent@2026`) 和新密码。
3.  提交后系统会自动注销，请使用新密码重新登录。

### 4.3 数据备份
所有业务数据存储在 `app_data.db` 文件中。
*   **备份**: 复制该文件即可 `cp app_data.db backup_2026.db`
*   **恢复**: 停止容器，覆盖该文件，重启容器。

---

## 5. 常见问题

**Q: 为什么页面提示 "Unauthorized"？**
A: 您可能未登录或 Token 已过期。请刷新页面重新登录。

**Q: 如何查看服务日志？**
A: 运行 `sudo docker-compose logs -f kimi-agent`

**Q: OpenClaw 无法启动？**
A: 请检查 `docker-compose.yml` 中的 `openclaw` 服务配置，确保 `image` 名称正确（需参考 OpenClaw 官方文档获取真实镜像名）。
