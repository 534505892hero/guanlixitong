
// ==========================================
// 数据库持久化同步脚本 (Database Persistence)
// ==========================================
(function() {
    const API_BASE = '/api';
    const LOGIN_API = `${API_BASE}/login`;
    const DATA_API = `${API_BASE}/data`;
    const CHANGE_PASS_API = `${API_BASE}/change_password`;

    // 样式注入：登录弹窗
    const authStyle = document.createElement('style');
    authStyle.textContent = `
        #auth-modal {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }
        .auth-box {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            width: 300px;
            text-align: center;
        }
        .auth-box h3 { margin-top: 0; }
        .auth-box input {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .auth-box button {
            width: 100%;
            padding: 8px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .auth-box button:hover { background: #1d4ed8; }
        .auth-error { color: red; font-size: 0.8rem; margin-top: 5px; display: none; }
        
        #change-pass-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.6);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            z-index: 9999;
        }
    `;
    document.head.appendChild(authStyle);

    let token = localStorage.getItem('auth_token');

    // 创建登录弹窗
    function showLoginModal(isChangePass = false) {
        if (document.getElementById('auth-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        
        const content = isChangePass 
            ? `
                <h3>修改密码</h3>
                <input type="password" id="old-pass" placeholder="当前密码">
                <input type="password" id="new-pass" placeholder="新密码">
                <button onclick="handleChangePass()">确认修改</button>
                <button onclick="closeModal()" style="margin-top:5px;background:#666">取消</button>
              `
            : `
                <h3>系统登录</h3>
                <p style="font-size:12px;color:#666;margin-bottom:10px">请输入管理员密码以同步数据</p>
                <input type="password" id="login-pass" placeholder="密码">
                <button onclick="handleLogin()">登录</button>
              `;

        modal.innerHTML = `
            <div class="auth-box">
                ${content}
                <div id="auth-error" class="auth-error"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 绑定事件
        window.handleLogin = async () => {
            const pass = document.getElementById('login-pass').value;
            try {
                const res = await fetch(LOGIN_API, {
                    method: 'POST',
                    body: JSON.stringify({ password: pass })
                });
                const data = await res.json();
                if (res.ok) {
                    token = data.token;
                    localStorage.setItem('auth_token', token);
                    closeModal();
                    restoreData(); // 登录成功后立即同步
                } else {
                    showError(data.error || '登录失败');
                }
            } catch (e) {
                showError('网络错误');
            }
        };

        window.handleChangePass = async () => {
            const oldPass = document.getElementById('old-pass').value;
            const newPass = document.getElementById('new-pass').value;
            try {
                const res = await fetch(CHANGE_PASS_API, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ old_password: oldPass, new_password: newPass })
                });
                const data = await res.json();
                if (res.ok) {
                    alert('密码修改成功，请重新登录');
                    token = null;
                    localStorage.removeItem('auth_token');
                    closeModal();
                    showLoginModal();
                } else {
                    showError(data.error || '修改失败');
                }
            } catch (e) {
                showError('网络错误');
            }
        };

        window.closeModal = () => modal.remove();
        
        function showError(msg) {
            const err = document.getElementById('auth-error');
            err.textContent = msg;
            err.style.display = 'block';
        }
    }

    // 添加修改密码按钮
    function addChangePassBtn() {
        const btn = document.createElement('div');
        btn.id = 'change-pass-btn';
        btn.textContent = '修改密码';
        btn.onclick = () => showLoginModal(true);
        document.body.appendChild(btn);
    }

    // 1. 初始化：从服务器加载数据并恢复到 localStorage
    async function restoreData() {
        if (!token) {
            showLoginModal();
            return;
        }
        try {
            const response = await fetch(DATA_API, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401) {
                token = null;
                localStorage.removeItem('auth_token');
                showLoginModal();
                return;
            }

            if (response.ok) {
                const data = await response.json();
                console.log('[DB Sync] Restoring data from server...', Object.keys(data).length, 'items');
                Object.keys(data).forEach(key => {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                });
            }
        } catch (e) {
            console.error('[DB Sync] Failed to restore data:', e);
        }
    }

    // 2. 拦截 localStorage.setItem 以同步保存到服务器
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);

        if (!key.startsWith('debug_') && key !== 'auth_token') {
            if (!token) return; // 未登录不保存到服务器

            fetch(DATA_API, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ [key]: JSON.parse(value) })
            }).catch(e => console.error('[DB Sync] Sync failed:', e));
        }
    };

    // 等待 DOM 加载后初始化 UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            restoreData();
            addChangePassBtn();
        });
    } else {
        restoreData();
        addChangePassBtn();
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
