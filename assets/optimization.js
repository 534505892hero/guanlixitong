
// ==========================================
// 山科智能科研管理系统 - 核心增强脚本 (v3.0)
// 功能：标准化认证、全业务数据持久化、文件附件管理
// ==========================================

(function() {
    // --- 配置常量 ---
    const CONFIG = {
        API: {
            LOGIN: '/api/auth/login',
            LOGOUT: '/api/auth/logout',
            PASS: '/api/auth/password',
            CHECK: '/api/auth/check',
            UPLOAD: '/api/upload',
            COPYRIGHTS: '/api/copyrights',
            PAPERS: '/api/papers',
            PATENTS: '/api/patents'
        },
        // 自动识别数据的特征字段
        SCHEMA_SIGNATURES: {
            copyrights: ['registration_no', 'develop_date', 'owner'],
            papers: ['journal', 'authors', 'publish_date'],
            patents: ['application_no', 'inventors', 'application_date']
        }
    };

    // --- 状态管理 ---
    const State = {
        token: localStorage.getItem('auth_token'),
        username: localStorage.getItem('auth_user'),
        isLocked: false,
        syncQueue: new Map(), // 防抖队列
        originalSetItem: localStorage.setItem,
        originalRemoveItem: localStorage.removeItem
    };

    // --- 1. 认证服务 (Auth Service) ---
    class AuthService {
        static async login(username, password) {
            try {
                const res = await fetch(CONFIG.API.LOGIN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (res.ok) {
                    this.setSession(data.token, data.username);
                    await DataManager.syncDown(); // 登录后立即拉取数据
                    UI.hideLogin();
                    // 延迟刷新，确保数据写入和 UI 状态更新
                    setTimeout(() => {
                        window.location.reload(); 
                    }, 500);
                } else {
                    throw new Error(data.error || '登录失败');
                }
            } catch (e) {
                UI.showError(e.message);
            }
        }

        static async logout() {
            if (State.token) {
                try {
                    await fetch(CONFIG.API.LOGOUT, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${State.token}` }
                    });
                } catch(e) {}
            }
            this.clearSession();
            UI.showLogin();
        }

        static setSession(token, username) {
            State.token = token;
            State.username = username;
            State.originalSetItem.call(localStorage, 'auth_token', token);
            State.originalSetItem.call(localStorage, 'auth_user', username);
        }

        static clearSession() {
            State.token = null;
            State.username = null;
            State.originalRemoveItem.call(localStorage, 'auth_token');
            State.originalRemoveItem.call(localStorage, 'auth_user');
            // 清除业务数据防止泄露
            localStorage.clear();
        }

        static async changePassword(oldPass, newPass) {
            const res = await fetch(CONFIG.API.PASS, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${State.token}` 
                },
                body: JSON.stringify({ old_password: oldPass, new_password: newPass })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return data;
        }
    }

    // --- 2. 数据管理与文件处理 (Data & File Manager) ---
    class DataManager {
        // 下行同步：从服务器拉取 -> 写入 LocalStorage
        static async syncDown() {
            if (!State.token) return;
            console.log('[Sync] Pulling data from server...');
            
            try {
                // 并行拉取三类数据
                const [copyrights, papers, patents] = await Promise.all([
                    this.fetchList(CONFIG.API.COPYRIGHTS),
                    this.fetchList(CONFIG.API.PAPERS),
                    this.fetchList(CONFIG.API.PATENTS)
                ]);

                // 智能写入 LocalStorage
                // 注意：由于我们不知道前端具体的 Key，这里需要一种反向映射机制
                // 或者我们假设前端会读取我们写入的 Key。
                // 更好的策略：我们通过"特征识别"在 syncUp 时记录了 Key 的名称，
                // 但如果是首次登录，我们不知道 Key。
                // 妥协方案：尝试写入常见的 Key 名称，React 应用通常会读取。
                // 如果是存量系统，LocalStorage 可能已有数据。
                // *关键策略*：我们将数据写入到"推测"的 Key，并覆盖可能的旧数据。
                
                // 假设前端使用的 Key (根据常见习惯猜测，后续可根据实际情况调整)
                this.writeToStorage('softwareList', copyrights);
                this.writeToStorage('paperList', papers);
                this.writeToStorage('patentList', patents);
                
                console.log('[Sync] Pull complete.');
            } catch (e) {
                console.error('[Sync] Pull failed:', e);
            }
        }

        static async fetchList(url) {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${State.token}` }
            });
            if (res.status === 401) {
                AuthService.clearSession();
                UI.showLogin();
                throw new Error('Unauthorized');
            }
            return res.ok ? await res.json() : [];
        }

        static writeToStorage(key, data) {
            if (data && data.length > 0) {
                State.originalSetItem.call(localStorage, key, JSON.stringify(data));
            }
        }

        // 上行同步：LocalStorage 变更 -> 识别类型 -> 上传附件 -> 推送服务器
        static handleStorageChange(key, valueStr) {
            if (!State.token || !valueStr) return;
            if (key.startsWith('debug_') || key === 'auth_token' || key === 'auth_user') return;

            try {
                const data = JSON.parse(valueStr);
                if (!Array.isArray(data)) return; // 只处理列表数据

                // 识别数据类型
                const type = this.detectType(data);
                if (!type) return;

                console.log(`[Sync] Detected change in ${type} (Key: ${key})`);

                // 防抖处理
                if (State.syncQueue.has(key)) clearTimeout(State.syncQueue.get(key));
                State.syncQueue.set(key, setTimeout(() => {
                    this.processAndPush(type, data);
                }, 1000)); // 1秒防抖
            } catch (e) {
                // Ignore parse errors
            }
        }

        static detectType(list) {
            if (list.length === 0) return null;
            const item = list[0];
            // 特征匹配
            if (item.registration_no || item.develop_date) return 'copyrights';
            if (item.journal && item.authors) return 'papers';
            if (item.application_no && item.inventors) return 'patents';
            return null;
        }

        static async processAndPush(type, list) {
            console.log(`[Sync] Processing ${type}...`);
            const processedList = await Promise.all(list.map(item => this.processItemFiles(type, item)));
            
            let url = '';
            if (type === 'copyrights') url = CONFIG.API.COPYRIGHTS;
            if (type === 'papers') url = CONFIG.API.PAPERS;
            if (type === 'patents') url = CONFIG.API.PATENTS;

            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${State.token}`
                    },
                    body: JSON.stringify(processedList)
                });
                console.log(`[Sync] ${type} pushed successfully.`);
            } catch (e) {
                console.error(`[Sync] Push ${type} failed:`, e);
            }
        }

        // 处理单个条目中的附件 (Base64 -> URL)
        static async processItemFiles(type, item) {
            const newItem = { ...item };
            
            // 定义需要处理的文件字段
            const fileFields = [];
            if (type === 'copyrights') fileFields.push('file_path');
            if (type === 'papers') fileFields.push('file_path');
            if (type === 'patents') fileFields.push('application_file', 'certificate_file');

            for (const field of fileFields) {
                const val = newItem[field];
                // 检查是否为 Base64 (简单的特征检查)
                if (val && typeof val === 'string' && val.startsWith('data:')) {
                    console.log(`[Upload] Uploading file for ${field}...`);
                    const url = await this.uploadBase64(val);
                    if (url) {
                        newItem[field] = url; // 替换为服务器 URL
                    }
                }
            }
            return newItem;
        }

        static async uploadBase64(base64Str) {
            try {
                // DataURL 转 Blob
                const arr = base64Str.split(',');
                const mime = arr[0].match(/:(.*?);/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                const ext = mime.split('/')[1];
                const filename = `upload.${ext}`; // 后端会重命名，这里文件名不重要

                const formData = new FormData();
                formData.append('file', blob, filename);

                const res = await fetch(CONFIG.API.UPLOAD, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${State.token}` },
                    body: formData
                });
                
                if (res.ok) {
                    const data = await res.json();
                    return data.url;
                }
            } catch (e) {
                console.error('[Upload] Failed:', e);
            }
            return null;
        }
    }

    // --- 3. UI 管理 (UI Manager) ---
    class UI {
        static init() {
            this.injectStyles();
            this.setupInterceptors();
            this.setupRouterGuard();
            
            if (!State.token) {
                this.showLogin();
            } else {
                // 验证 Token 有效性
                fetch(CONFIG.API.CHECK, {
                    headers: { 'Authorization': `Bearer ${State.token}` }
                }).then(res => {
                    if (!res.ok) AuthService.logout();
                    else DataManager.syncDown(); // 每次刷新都拉取一次最新数据
                }).catch(() => {}); // 网络错误暂不处理
                
                this.addLogoutButton();
            }
        }

        static injectStyles() {
            const css = `
                :root { --tech-blue: #3b82f6; --tech-dark: #0f172a; }
                #login-overlay { position: fixed; inset: 0; background: #0f172a; z-index: 99999; display: flex; justify-content: center; align-items: center; }
                .login-box { background: rgba(30,41,59,0.8); padding: 40px; border-radius: 16px; width: 400px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); color: white; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .login-input { width: 100%; padding: 12px; margin: 10px 0; background: rgba(0,0,0,0.2); border: 1px solid #334155; color: white; border-radius: 8px; box-sizing: border-box; }
                .login-btn { width: 100%; padding: 12px; background: var(--tech-blue); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 20px; transition: 0.2s; }
                .login-btn:hover { background: #2563eb; }
                .sys-trigger { position: fixed; bottom: 20px; right: 20px; z-index: 1000; background: white; padding: 8px 15px; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); cursor: pointer; font-size: 14px; color: #333; }
                .sys-trigger span:hover { color: var(--tech-blue); text-decoration: underline; }
                #root.hidden { display: none !important; }
            `;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }

        static showLogin() {
            if (document.getElementById('login-overlay')) return;
            document.body.classList.add('is-locked');
            
            // 隐藏主应用
            const root = document.getElementById('root');
            if (root) root.classList.add('hidden');

            const div = document.createElement('div');
            div.id = 'login-overlay';
            div.innerHTML = `
                <div class="login-box">
                    <h2 style="margin-bottom: 20px;">山科智能科研管理系统</h2>
                    <form id="login-form">
                        <input type="text" id="u-name" class="login-input" placeholder="用户名" required>
                        <input type="password" id="u-pass" class="login-input" placeholder="密码" required>
                        <button type="submit" class="login-btn">登 录</button>
                        <div id="l-msg" style="color: #fca5a5; margin-top: 15px; font-size: 14px;"></div>
                    </form>
                </div>
            `;
            document.body.appendChild(div);

            document.getElementById('login-form').onsubmit = (e) => {
                e.preventDefault();
                const u = document.getElementById('u-name').value;
                const p = document.getElementById('u-pass').value;
                document.querySelector('.login-btn').textContent = '登录中...';
                AuthService.login(u, p);
            };
        }

        static hideLogin() {
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.remove();
            document.body.classList.remove('is-locked');
            const root = document.getElementById('root');
            if (root) root.classList.remove('hidden');
            // Ensure root is visible
            if (root) root.style.display = 'block';
            this.addLogoutButton();
        }

        static showError(msg) {
            const el = document.getElementById('l-msg');
            if (el) el.textContent = msg;
            const btn = document.querySelector('.login-btn');
            if (btn) btn.textContent = '登 录';
        }

        static addLogoutButton() {
            if (document.getElementById('sys-trigger')) return;
            const div = document.createElement('div');
            div.id = 'sys-trigger';
            div.className = 'sys-trigger';
            div.innerHTML = `
                <span>${State.username || 'User'}</span> | 
                <span id="btn-cp">修改密码</span> | 
                <span id="btn-logout">退出</span>
            `;
            document.body.appendChild(div);

            document.getElementById('btn-logout').onclick = () => AuthService.logout();
            document.getElementById('btn-cp').onclick = () => this.showChangePass();
        }

        static showChangePass() {
             const div = document.createElement('div');
             div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;justify-content:center;align-items:center';
             div.innerHTML = `
                <div class="login-box" style="position:relative">
                    <button onclick="this.parentElement.parentElement.remove()" style="position:absolute;right:15px;top:10px;background:none;border:none;color:white;cursor:pointer">✕</button>
                    <h3>修改密码</h3>
                    <form id="cp-form">
                        <input type="password" id="cp-old" class="login-input" placeholder="旧密码" required>
                        <input type="password" id="cp-new" class="login-input" placeholder="新密码" required>
                        <button type="submit" class="login-btn">确认修改</button>
                        <div id="cp-msg" style="margin-top:10px"></div>
                    </form>
                </div>
             `;
             document.body.appendChild(div);
             
             document.getElementById('cp-form').onsubmit = async (e) => {
                 e.preventDefault();
                 const oldP = document.getElementById('cp-old').value;
                 const newP = document.getElementById('cp-new').value;
                 const msg = document.getElementById('cp-msg');
                 try {
                     await AuthService.changePassword(oldP, newP);
                     msg.style.color = 'lightgreen';
                     msg.textContent = '修改成功，请重新登录';
                     setTimeout(() => {
                         AuthService.logout();
                     }, 1500);
                 } catch(err) {
                     msg.style.color = '#fca5a5';
                     msg.textContent = err.message;
                 }
             };
        }

        static setupInterceptors() {
            // 劫持 LocalStorage
            localStorage.setItem = function(key, value) {
                State.originalSetItem.call(this, key, value);
                DataManager.handleStorageChange(key, value);
            };
        }

        static setupRouterGuard() {
            // 简单的路由守卫，防止 URL 访问登录页
            if (State.token && window.location.href.includes('login')) {
                window.location.href = '/';
            }
            
            // 监控 DOM，移除原登录页
            const observer = new MutationObserver(() => {
                const root = document.getElementById('root');
                if (!root) return;

                // 增加防御性检查，防止死循环隐藏
                if (root.classList.contains('hidden') && State.token && !root.innerText.includes('用户登录')) {
                    root.classList.remove('hidden');
                    root.style.display = 'block';
                }

                if (root.innerText.includes('用户登录') || root.innerText.includes('请输入您的账号和密码')) {
                     if (State.token) {
                         root.classList.add('hidden');
                         // 强制跳转主页
                         if (!window.location.href.endsWith('/')) {
                             console.log('[RouterGuard] Redirecting to root...');
                             window.location.href = '/';
                         }
                     } else {
                         // 未登录时，我们的 Overlay 应该在上面，所以不需要隐藏 root，
                         // 但为了防止样式冲突，还是隐藏好
                         root.classList.add('hidden');
                     }
                } else if (State.token) {
                    root.classList.remove('hidden');
                    root.style.display = 'block';
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // --- 启动 ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UI.init());
    } else {
        UI.init();
    }
})();
