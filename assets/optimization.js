
// ==========================================
// 山科智能科研管理系统 - 核心增强脚本 (v3.0)
// 功能：标准化认证、全业务数据持久化、文件附件管理
// ==========================================

(function() {
    // --- 配置常量 ---
    // 动态获取当前主机地址，适配不同的运行环境 (localhost, 127.0.0.1, IP)
    const getBaseUrl = () => {
        const port = 8089; // 后端固定端口
        const hostname = window.location.hostname;
        return `http://${hostname}:${port}`;
    };
    
    const BASE_URL = getBaseUrl();

    const CONFIG = {
        API: {
            LOGIN: `${BASE_URL}/api/auth/login`,
            LOGOUT: `${BASE_URL}/api/auth/logout`,
            PASS: `${BASE_URL}/api/auth/password`,
            CHECK: `${BASE_URL}/api/auth/check`,
            UPLOAD: `${BASE_URL}/api/upload`,
            COPYRIGHTS: `${BASE_URL}/api/copyrights`,
            PAPERS: `${BASE_URL}/api/papers`,
            PATENTS: `${BASE_URL}/api/patents`
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
                    await DataManager.syncDown(); 
                    
                    // 登录成功后，不再只依靠 reload，而是尝试手动触发 React 路由跳转
                    // 假设 React 使用的是 HashRouter，我们直接修改 Hash
                    window.location.hash = '/'; 
                    window.location.reload(); 
                } else {
                    throw new Error(data.error || '登录失败');
                }
            } catch (e) {
                // 如果是 DOM 劫持模式，这里应该把错误反馈给原表单（如果需要）
                // 但目前我们还是全权接管，所以使用 Alert 或自定义 UI
                alert(e.message); 
                // 重新抛出以便 UI 层恢复按钮状态
                throw e;
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
            
            // 1. 设置我们的持久化 Token
            State.originalSetItem.call(localStorage, 'auth_token', token);
            State.originalSetItem.call(localStorage, 'auth_user', username);
            
            // 2. 注入原 React 应用所需的 Key，使其认为已登录
            // 根据逆向工程发现的 Key: KEYS.CURRENT_USER = "ipms_current_user", KEYS.USER = "ipms_user"
            State.originalSetItem.call(localStorage, 'ipms_current_user', username);
            
            // 尝试构造 ipms_user (可能包含用户列表或当前用户详情)
            // 为了安全起见，我们构造一个包含当前用户的对象/数组
            // 增加 name 字段以防止 .trim() 错误
            const userInfo = { 
                username: username, 
                name: username, // 兼容性：某些系统可能使用 name
                role: 'admin', 
                lastLogin: new Date().toISOString() 
            };
            // 如果原系统将其视为用户库(Array)，我们先读取旧的
            try {
                const oldUsers = JSON.parse(localStorage.getItem('ipms_user') || '[]');
                if (Array.isArray(oldUsers)) {
                    // 更新或添加当前用户
                    const idx = oldUsers.findIndex(u => u.username === username);
                    if (idx > -1) oldUsers[idx] = userInfo;
                    else oldUsers.push(userInfo);
                    State.originalSetItem.call(localStorage, 'ipms_user', JSON.stringify(oldUsers));
                } else {
                    // 如果不是数组，可能就是单个对象
                     State.originalSetItem.call(localStorage, 'ipms_user', JSON.stringify(userInfo));
                }
            } catch(e) {
                 State.originalSetItem.call(localStorage, 'ipms_user', JSON.stringify([userInfo]));
            }
        }

        static clearSession() {
            State.token = null;
            State.username = null;
            State.originalRemoveItem.call(localStorage, 'auth_token');
            State.originalRemoveItem.call(localStorage, 'auth_user');
            
            // 清除原系统 Key
            State.originalRemoveItem.call(localStorage, 'ipms_current_user');
            // ipms_user 这里的处理有争议：是否要清空整个用户库？
            // 安全起见，只清除 current_user 应该足以触发登出
            
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
                this.writeToStorage('ipms_softwares', this.normalizeData(copyrights, 'copyrights'));
                this.writeToStorage('ipms_papers', this.normalizeData(papers, 'papers'));
                this.writeToStorage('ipms_patents', this.normalizeData(patents, 'patents'));
                
                console.log('[Sync] Pull complete.');
            } catch (e) {
                console.error('[Sync] Pull failed:', e);
            }
        }

        static normalizeData(list, type) {
            if (!Array.isArray(list)) return [];
            return list.map(item => {
                const newItem = { ...item };
                // 兼容性处理：前端可能统一使用 name 字段，而数据库中论文/专利使用 title
                if (!newItem.name && newItem.title) {
                    newItem.name = newItem.title;
                }
                // 反之亦然，确保双向兼容
                if (!newItem.title && newItem.name) {
                    newItem.title = newItem.name;
                }
                
                // 确保关键字符串字段不为 null/undefined，防止 .trim() 报错
                ['name', 'title', 'username'].forEach(key => {
                    if (newItem[key] === null || newItem[key] === undefined) {
                        newItem[key] = '';
                    }
                });
                return newItem;
            });
        }

        static async fetchList(url) {
            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${State.token}` }
                });
                if (res.status === 401) {
                    console.error('[Auth] 401 Unauthorized in fetchList');
                    AuthService.clearSession();
                    UI.showLogin();
                    // 不要抛出错误，而是返回空数组，避免阻塞后续 Promise.all
                    return [];
                }
                if (!res.ok) {
                    console.error(`[Sync] Fetch failed: ${res.status} ${res.statusText}`);
                    return [];
                }
                return await res.json();
            } catch (e) {
                console.error(`[Sync] Network error for ${url}:`, e);
                return [];
            }
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
            // 预处理：确保字段兼容性 (name <-> title)
            const normalizedList = this.normalizeData(list, type);
            
            const processedList = await Promise.all(normalizedList.map(item => this.processItemFiles(type, item)));
            
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

    // --- 3. UI 管理与 DOM 劫持 (UI Manager & Hijacker) ---
    class UI {
        static init() {
            this.setupInterceptors();
            this.hijackLogin(); // 启动 DOM 劫持
            
            if (State.token) {
                // 验证 Token 有效性
                fetch(CONFIG.API.CHECK, {
                    headers: { 'Authorization': `Bearer ${State.token}` }
                }).then(res => {
                    if (!res.ok) AuthService.logout();
                    else DataManager.syncDown();
                }).catch(() => {});
                
                // 只有在确定不在登录页时才显示 Logout
                this.checkAndShowLogout();
            }
        }
        
        static checkAndShowLogout() {
             const observer = new MutationObserver(() => {
                 const isLoginPage = document.querySelector('input[type="password"]') !== null;
                 const trigger = document.getElementById('sys-trigger');
                 if (isLoginPage) {
                     if (trigger) trigger.style.display = 'none';
                 } else {
                     if (trigger) trigger.style.display = 'block';
                     else this.addLogoutButton();
                 }
             });
             observer.observe(document.body, { childList: true, subtree: true });
        }

        // 核心：劫持原生登录逻辑
        static hijackLogin() {
            const observer = new MutationObserver(() => {
                // 寻找登录按钮（根据类名或结构特征）
                // 假设是那个绿色的 "登录" 按钮
                const loginBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登录'));
                if (loginBtn && !loginBtn.dataset.hijacked) {
                    console.log('[Hijack] Login button found, taking control...');
                    loginBtn.dataset.hijacked = 'true';
                    
                    // 克隆按钮以移除 React 事件绑定
                    const newBtn = loginBtn.cloneNode(true);
                    loginBtn.parentNode.replaceChild(newBtn, loginBtn);
                    
                    // 绑定我们自己的逻辑
                    newBtn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 获取输入框的值
                        // 1. 尝试寻找父级 Form
                        let form = newBtn.closest('form');
                        if (!form) {
                            // 2. 如果没有 Form，尝试寻找最近的公共容器
                            form = newBtn.closest('.login-box') || newBtn.closest('.card') || document.body;
                        }
                        
                        const inputs = form.querySelectorAll('input');
                        let username = '', password = '';
                        
                        // 优先寻找显式的 name 属性
                        inputs.forEach(input => {
                            const name = (input.name || '').toLowerCase();
                            const type = (input.type || '').toLowerCase();
                            const placeholder = (input.placeholder || '').toLowerCase();
                            
                            // 用户名匹配规则
                            if (name.includes('user') || name.includes('account') || placeholder.includes('用户名') || placeholder.includes('账号')) {
                                username = input.value;
                            } else if (type === 'text' && !username) {
                                // 如果没有明确标识，取第一个 text
                                username = input.value;
                            }
                            
                            // 密码匹配规则
                            if (type === 'password') {
                                password = input.value;
                            }
                        });

                        // 如果还是没找到，尝试全局搜索 visible 的 input
                        if (!username || !password) {
                             const allInputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null); // 只找可见的
                             allInputs.forEach(input => {
                                if (input.type === 'text' && !username) username = input.value;
                                if (input.type === 'password' && !password) password = input.value;
                             });
                        }

                        if (!username || !password) {
                            alert('请输入用户名和密码');
                            return;
                        }

                        // 修改按钮状态
                        const originalText = newBtn.textContent;
                        newBtn.textContent = '登录中...';
                        newBtn.disabled = true;

                        try {
                            await AuthService.login(username, password);
                        } catch (err) {
                            newBtn.textContent = originalText;
                            newBtn.disabled = false;
                        }
                    };
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        static hideLogin() {
            // DOM 劫持模式下，没有 overlay 需要隐藏，只需要状态更新
            // 这里可以做一些善后工作
            this.addLogoutButton();
        }

        static showLogin() {
            // DOM 劫持模式下，我们依赖原页面的登录框，所以这里不需要做任何事
            // 如果已经在登录页，就等待用户操作
            // 如果不在登录页，理论上应该跳转到登录页，但这是 React 的事
            if (!window.location.href.includes('login') && !State.token) {
                // 可选：强制跳回登录页
                // window.location.href = '/#/login'; 
            }
        }

        static addLogoutButton() {
            if (document.getElementById('sys-trigger')) return;
            const div = document.createElement('div');
            div.id = 'sys-trigger';
            div.className = 'sys-trigger';
            // 移除 "修改密码"
            div.innerHTML = `
                <span>${State.username || 'User'}</span> | 
                <span id="btn-logout">退出</span>
            `;
            document.body.appendChild(div);

            document.getElementById('btn-logout').onclick = () => AuthService.logout();
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

                // 如果内容包含原登录页特征，才隐藏
                if (root.innerText.includes('用户登录') || root.innerText.includes('请输入您的账号和密码')) {
                    if (State.token) {
                         // 已登录但显示登录页 -> 隐藏并跳转
                         root.classList.add('hidden');
                         root.style.display = 'none';
                         // 暴力清除 URL Hash
                         if (window.location.hash.includes('login') || window.location.pathname.includes('login')) {
                             console.log('[RouterGuard] Cleaning URL...');
                             window.history.pushState({}, '', '/'); // 使用 pushState 无刷新修改 URL
                             window.location.href = '/'; // 强制刷新跳转
                         } else {
                             // 如果 URL 看起来正常但还是渲染了登录页，可能是 React 内部状态问题
                             // 尝试点击页面上的 "Logo" 或其他导航元素（如果有）
                             // 或者直接重载
                             window.location.href = '/';
                         }
                    } else {
                         // 未登录 -> 隐藏原登录页 (显示我们的 Overlay)
                         root.classList.add('hidden');
                    }
                } else {
                    // 只要不是登录页内容，无论是否登录，都显示
                    // (未登录时，Overlay 会盖在上面；已登录时，显示主页)
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

    // 最后的保险：3秒后如果Token存在，强制移除 hidden 类，防止误判
    setTimeout(() => {
        if (State.token) {
             const root = document.getElementById('root');
             if (root) {
                 root.classList.remove('hidden');
                 root.style.display = 'block';
             }
        }
    }, 3000);
})();
