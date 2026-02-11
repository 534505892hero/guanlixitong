
// ==========================================
// 数据库持久化同步脚本 (Database Persistence)
// ==========================================
(function() {
    const API_BASE = '/api';
    const LOGIN_API = `${API_BASE}/login`;
    const DATA_API = `${API_BASE}/data`;
    const CHANGE_PASS_API = `${API_BASE}/change_password`;

    // 样式注入：美化登录页面 (Tech Blue Theme)
    const authStyle = document.createElement('style');
    authStyle.textContent = `
        :root {
            --tech-blue-dark: #0f172a;
            --tech-blue-light: #3b82f6;
            --tech-accent: #0ea5e9;
            --glass-bg: rgba(15, 23, 42, 0.6);
            --glass-border: rgba(255, 255, 255, 0.1);
        }
        
        #login-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: radial-gradient(circle at top right, #1e293b, #0f172a);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            overflow: hidden;
        }

        /* 动态背景微粒 */
        #login-overlay::before {
            content: '';
            position: absolute;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 50%);
            animation: pulse 10s infinite alternate;
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 0.5; }
            100% { transform: scale(1.2); opacity: 0.8; }
        }

        .login-card {
            background: rgba(30, 41, 59, 0.7);
            padding: 3.5rem;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            width: 100%;
            max-width: 420px;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            z-index: 1;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .login-header {
            text-align: center;
            margin-bottom: 3rem;
        }

        .login-header h2 {
            font-size: 1.8rem;
            font-weight: 700;
            color: #f8fafc;
            margin: 0;
            letter-spacing: -0.025em;
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .login-header p {
            margin-top: 0.75rem;
            color: #94a3b8;
            font-size: 0.95rem;
            font-weight: 300;
        }

        .form-group {
            margin-bottom: 1.75rem;
            position: relative;
        }

        .form-group label {
            position: absolute;
            left: 1rem;
            top: 1rem;
            color: #94a3b8;
            font-size: 1rem;
            transition: all 0.2s ease;
            pointer-events: none;
            background: transparent;
            padding: 0 0.25rem;
        }

        .form-input {
            width: 100%;
            padding: 1rem 1rem;
            border: 1px solid #334155;
            border-radius: 12px;
            font-size: 1rem;
            outline: none;
            transition: all 0.2s;
            background: rgba(15, 23, 42, 0.6);
            color: #f1f5f9;
            box-sizing: border-box;
        }

        .form-input:focus {
            border-color: var(--tech-blue-light);
            background: rgba(15, 23, 42, 0.8);
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        /* Floating Label Logic */
        .form-input:focus ~ label,
        .form-input:not(:placeholder-shown) ~ label {
            top: -0.6rem;
            left: 0.8rem;
            font-size: 0.8rem;
            color: var(--tech-accent);
            background: #1e293b; 
            font-weight: 600;
        }

        .login-btn {
            width: 100%;
            padding: 1rem;
            background: linear-gradient(135deg, var(--tech-blue-light), var(--tech-accent));
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 1.5rem;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
            position: relative;
            overflow: hidden;
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.5);
        }

        .login-btn:active {
            transform: scale(0.98);
        }

        .login-btn::after {
            content: '';
            position: absolute;
            top: 0; left: -100%;
            width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: 0.5s;
        }
        
        .login-btn:hover::after {
            left: 100%;
        }

        .error-msg {
            color: #fca5a5;
            font-size: 0.9rem;
            margin-top: 1.5rem;
            text-align: center;
            padding: 0.75rem;
            background: rgba(239, 68, 68, 0.1);
            border-radius: 8px;
            border: 1px solid rgba(239, 68, 68, 0.2);
            display: none;
            animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }

        @keyframes shake {
            10%, 90% { transform: translate3d(-1px, 0, 0); }
            20%, 80% { transform: translate3d(2px, 0, 0); }
            30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
            40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        /* 隐藏主应用内容 */
        body.is-locked #root,
        body.is-locked > div:not(#login-overlay):not(#change-pass-overlay) {
            display: none !important;
        }
        
        #change-pass-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            font-size: 13px;
            color: #64748b;
            cursor: pointer;
            z-index: 1000;
            background: rgba(255,255,255,0.9);
            padding: 8px 16px;
            border-radius: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: all 0.2s;
        }
        #change-pass-trigger:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.15);
            color: #0f172a;
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
                    <p>请登录以继续访问</p>
                </div>
                <form id="login-form" onsubmit="handleLoginSubmit(event)">
                    <div class="form-group">
                        <label for="opt-username">用户名</label>
                        <input type="text" id="opt-username" class="form-input" placeholder="请输入用户名" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="opt-password">密码</label>
                        <input type="password" id="opt-password" class="form-input" placeholder="请输入密码" required autocomplete="current-password">
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
            e.stopPropagation(); // 阻止事件冒泡，防止 React 应用捕获
            
            const username = document.getElementById('opt-username').value;
            const password = document.getElementById('opt-password').value;
            const errorDiv = document.getElementById('login-error');
            
            errorDiv.style.display = 'none';
            
            console.log('[Login] Attempting login for:', username);
            
            try {
                const res = await fetch(LOGIN_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                console.log('[Login] Response status:', res.status);
                const data = await res.json();
                console.log('[Login] Response data:', data);
                
                if (res.ok) {
                    token = data.token;
                    localStorage.setItem('auth_token', token);
                    
                    // 按钮状态更新
                    const btn = e.target.querySelector('button[type="submit"]');
                    if(btn) btn.textContent = '登录成功，正在跳转...';

                    // 销毁登录页
                    overlay.remove();
                    document.body.classList.remove('is-locked');
                    
                    // 同步数据并刷新
                    await restoreData();
                    window.location.reload();
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

    // 全局暴露 Logout
    window.logout = function() {
        token = null;
        localStorage.removeItem('auth_token');
        document.getElementById('change-pass-overlay')?.remove();
        // 强制刷新以重置状态
        window.location.reload();
    };

    // 显示修改密码界面 (挂载到 window 以便 onclick 调用)
    window.showChangePassModal = function() {
        if (!token) return;
        
        const existing = document.getElementById('change-pass-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'change-pass-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 20001;
        `;
        
        // 阻止点击背景冒泡
        overlay.onclick = (e) => e.stopPropagation();
        
        overlay.innerHTML = `
            <div class="login-card" style="position: relative;">
                <button id="close-cp-btn" style="position: absolute; right: 15px; top: 10px; border: none; background: none; font-size: 20px; cursor: pointer;">&times;</button>
                <div class="login-header">
                    <h2>修改密码</h2>
                </div>
                <form id="cp-form">
                    <div class="form-group">
                        <label>旧密码</label>
                        <input type="password" id="old-pass" class="form-input" required autocomplete="current-password">
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <input type="password" id="new-pass" class="form-input" required minlength="6" autocomplete="new-password">
                    </div>
                    <button type="submit" id="cp-submit-btn" class="login-btn">确认修改</button>
                    <div id="cp-msg" class="error-msg" style="color: green; display: none;"></div>
                    <div id="cp-error" class="error-msg"></div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // 绑定关闭按钮
        document.getElementById('close-cp-btn').onclick = (e) => {
            e.stopPropagation();
            overlay.remove();
        };

        // 绑定表单提交
        const form = document.getElementById('cp-form');
        const submitBtn = document.getElementById('cp-submit-btn');
        const errorDiv = document.getElementById('cp-error');
        const msgDiv = document.getElementById('cp-msg');

        form.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡
            
            const oldPass = document.getElementById('old-pass').value;
            const newPass = document.getElementById('new-pass').value;
            
            // 重置状态
            errorDiv.style.display = 'none';
            msgDiv.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '提交中...';

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
                    msgDiv.textContent = '密码修改成功，即将跳转登录...';
                    msgDiv.style.display = 'block';
                    msgDiv.style.color = 'green';
                    
                    // 延迟跳转
                    setTimeout(() => {
                        window.logout();
                    }, 1500);
                } else {
                    errorDiv.textContent = data.error || '修改失败，请重试';
                    errorDiv.style.display = 'block';
                    // 恢复按钮状态，允许再次提交
                    submitBtn.disabled = false;
                    submitBtn.textContent = '确认修改';
                }
            } catch (err) {
                console.error('Change password error:', err);
                errorDiv.textContent = '网络错误，请检查连接';
                errorDiv.style.display = 'block';
                // 恢复按钮状态
                submitBtn.disabled = false;
                submitBtn.textContent = '确认修改';
            }
        };
    };

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
        // 重新读取 token，防止闭包中的 token 过期
        token = localStorage.getItem('auth_token');
        console.log('[Init] Token found:', token ? token.substring(0, 10) + '...' : 'null');
        
        // 如果没有 token，立即显示登录页
        if (!token) {
            console.log('[Init] No token, showing login page');
            showLoginPage();
        } else {
            console.log('[Init] Token exists, restoring data');
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
            // 过滤掉我们自己的 UI 变化，避免无限循环或不必要的处理
            const shouldProcess = mutations.some(mutation => {
                if (mutation.type !== 'childList') return false;
                // 检查添加的节点是否是我们自己的模态框
                for (let node of mutation.addedNodes) {
                    if (node.id === 'login-overlay' || node.id === 'change-pass-overlay' || node.id === 'auth-modal') {
                        return false;
                    }
                }
                return true;
            });

            if (shouldProcess) {
                // 简单防抖，避免频繁执行
                optimizeListItems();
            }
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
