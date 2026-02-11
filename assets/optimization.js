
// ==========================================
// 数据库持久化同步脚本 (Database Persistence)
// ==========================================
(function() {
    const API_BASE = '/api';
    const LOGIN_API = `${API_BASE}/login`;
    const DATA_API = `${API_BASE}/data`;
    const CHANGE_PASS_API = `${API_BASE}/change_password`;

    // 样式注入：简洁登录页面
    const authStyle = document.createElement('style');
    authStyle.textContent = `
        #login-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: #f3f4f6;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
        }
        .login-card {
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
        }
        .login-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .login-header h2 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #111827;
            margin: 0;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-group label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            color: #374151;
            margin-bottom: 0.5rem;
        }
        .form-input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        .form-input:focus {
            border-color: #2563eb;
            ring: 2px solid #2563eb;
        }
        .login-btn {
            width: 100%;
            padding: 0.75rem;
            background-color: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .login-btn:hover {
            background-color: #1d4ed8;
        }
        .error-msg {
            color: #dc2626;
            font-size: 0.875rem;
            margin-top: 1rem;
            text-align: center;
            display: none;
        }
        /* 隐藏主应用内容 */
        body.is-locked > *:not(#login-overlay) {
            filter: blur(5px);
            pointer-events: none;
        }
        
        #change-pass-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
            z-index: 1000;
        }
    `;
    document.head.appendChild(authStyle);

    let token = localStorage.getItem('auth_token');

    // 显示全屏登录页
    function showLoginPage() {
        if (document.getElementById('login-overlay')) return;

        // 锁定主页面
        document.body.classList.add('is-locked');

        const overlay = document.createElement('div');
        overlay.id = 'login-overlay';
        
        overlay.innerHTML = `
            <div class="login-card">
                <div class="login-header">
                    <h2>山科智能科研管理系统</h2>
                </div>
                <form id="login-form" onsubmit="handleLoginSubmit(event)">
                    <div class="form-group">
                        <label for="username">用户名</label>
                        <input type="text" id="username" class="form-input" placeholder="请输入用户名" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="password">密码</label>
                        <input type="password" id="password" class="form-input" placeholder="请输入密码" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="login-btn">登 录</button>
                    <div id="login-error" class="error-msg"></div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        // 全局暴露处理函数
        window.handleLoginSubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('login-error');
            
            errorDiv.style.display = 'none';
            
            try {
                const res = await fetch(LOGIN_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    token = data.token;
                    localStorage.setItem('auth_token', token);
                    // 销毁登录页
                    overlay.remove();
                    document.body.classList.remove('is-locked');
                    restoreData(); // 开始同步数据
                } else {
                    errorDiv.textContent = data.error || '用户名或密码错误';
                    errorDiv.style.display = 'block';
                }
            } catch (err) {
                errorDiv.textContent = '网络连接失败，请稍后重试';
                errorDiv.style.display = 'block';
            }
        };
    }

    // 显示修改密码界面 (简单复用登录样式，实际项目可做单独页面)
    function showChangePassModal() {
        if (!token) return;
        
        const existing = document.getElementById('change-pass-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'change-pass-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 20001;
        `;
        
        overlay.innerHTML = `
            <div class="login-card" style="position: relative;">
                <button onclick="this.closest('#change-pass-overlay').remove()" style="position: absolute; right: 15px; top: 10px; border: none; background: none; font-size: 20px; cursor: pointer;">&times;</button>
                <div class="login-header">
                    <h2>修改密码</h2>
                </div>
                <form onsubmit="handleChangePassSubmit(event)">
                    <div class="form-group">
                        <label>旧密码</label>
                        <input type="password" id="old-pass" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <input type="password" id="new-pass" class="form-input" required minlength="6">
                    </div>
                    <button type="submit" class="login-btn">确认修改</button>
                    <div id="cp-error" class="error-msg"></div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        window.handleChangePassSubmit = async (e) => {
            e.preventDefault();
            const oldPass = document.getElementById('old-pass').value;
            const newPass = document.getElementById('new-pass').value;
            const errorDiv = document.getElementById('cp-error');

            try {
                const res = await fetch(CHANGE_PASS_API, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ old_password: oldPass, new_password: newPass })
                });

                const data = await res.json();
                
                if (res.ok) {
                    alert('密码修改成功，请重新登录');
                    logout();
                } else {
                    errorDiv.textContent = data.error || '修改失败';
                    errorDiv.style.display = 'block';
                }
            } catch (err) {
                errorDiv.textContent = '网络错误';
                errorDiv.style.display = 'block';
            }
        };
    }

    function logout() {
        token = null;
        localStorage.removeItem('auth_token');
        document.getElementById('change-pass-overlay')?.remove();
        showLoginPage();
    }

    // 添加修改密码入口
    function addChangePassTrigger() {
        const trigger = document.createElement('div');
        trigger.id = 'change-pass-trigger';
        trigger.innerHTML = `<span onclick="showChangePassModal()">修改密码</span> | <span onclick="logout()">退出登录</span>`;
        // 仅在登录后显示
        if (token) document.body.appendChild(trigger);
        
        // 监听 Token 变化以更新 UI
        const originalSetItem = localStorage.setItem;
        const originalRemoveItem = localStorage.removeItem;
        
        // 简单 Hack：覆写 removeItem 以移除按钮
        localStorage.removeItem = function(key) {
            originalRemoveItem.apply(this, arguments);
            if (key === 'auth_token') trigger.remove();
        }
    }

    // 数据恢复逻辑
    async function restoreData() {
        if (!token) {
            showLoginPage();
            return;
        }
        
        // 确保修改密码按钮存在
        if (!document.getElementById('change-pass-trigger')) {
            addChangePassTrigger();
        }

        try {
            const response = await fetch(DATA_API, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401) {
                logout();
                return;
            }

            if (response.ok) {
                const data = await response.json();
                // console.log('[DB Sync] Restoring data...', Object.keys(data).length);
                Object.keys(data).forEach(key => {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                });
            }
        } catch (e) {
            console.error('[DB Sync] Failed:', e);
        }
    }

    // 拦截存储
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);

        if (!key.startsWith('debug_') && key !== 'auth_token') {
            if (!token) return;

            fetch(DATA_API, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ [key]: JSON.parse(value) })
            }).catch(() => {});
        }
    };

    // 初始化
    const init = () => {
        // 如果没有 token，立即显示登录页
        if (!token) {
            showLoginPage();
        } else {
            restoreData();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ==========================================
// UI 优化脚本 (List & Tooltip Optimization)
// ==========================================
(function() {
    // 1. 注入 CSS 样式
    const style = document.createElement('style');
    style.textContent = `
        /* 限制行高为 2 行，超出显示省略号 */
        .opt-line-clamp {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.5; /* 约 24px -> 2行 48px */
            max-height: 3em;  /* 备用限制 */
            white-space: normal !important; /* 强制覆盖可能得 nowrap */
        }
        
        /* 针对表格单元格的特殊处理 */
        td.opt-line-clamp {
             /* 确保单元格内部 div 生效 */
             max-width: 300px; /* 限制宽度以触发换行 */
        }
        
        /* 简单的 Tooltip 样式 (利用原生 title 属性，或者自定义) */
        /* 这里增强原生 title 的显示效果需要 JS 配合或使用 data-tooltip 属性 + 伪元素 */
        [data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            background: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            white-space: normal;
            max-width: 300px;
            pointer-events: none;
            transform: translateY(-100%);
        }
    `;
    document.head.appendChild(style);

    // 2. 监控 DOM 变化，自动应用样式
    // 假设列表项在特定的容器中，或者我们通过特定的特征识别
    // 由于不知道确切类名，我们查找所有包含长文本的 td 或 li 元素
    function optimizeListItems() {
        // 查找可能是列表项的元素 (根据经验猜测：td, 或者具有特定 tailwind 类的 div)
        // 这里主要针对表格单元格和列表项
        // 针对发明专利列表的特定类名进行优化
        const candidates = document.querySelectorAll('td, .list-item, [role="cell"]');
        
        candidates.forEach(el => {
            if (el.dataset.optProcessed) return; // 避免重复处理
            
            // 检查内容长度
            const text = el.innerText;
            if (text.length > 20) { // 简单阈值
                el.classList.add('opt-line-clamp');
                el.setAttribute('title', text); // 使用原生 Tooltip
                el.dataset.optProcessed = 'true';
            }
        });
    }

    // 等待 body 元素出现后再启动观察
    function startObserver() {
        if (!document.body) {
            setTimeout(startObserver, 50); // 50ms 后重试
            return;
        }

        const observer = new MutationObserver((mutations) => {
            // 简单防抖，避免频繁执行
            optimizeListItems();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        
        // 立即执行一次以处理已存在的元素
        optimizeListItems();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }
})();
