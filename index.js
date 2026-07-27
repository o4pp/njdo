export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>نجد | Najd Snap</title>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --najd-gold: #d4af37;
            --najd-dark: #121212;
            --najd-surface: #1e1e1e;
            --najd-card: #2a2a2a;
            --najd-border: #333333;
            --najd-text: #ffffff;
            --najd-muted: #aaaaaa;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Tajawal', sans-serif;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            background-color: #000;
            color: var(--najd-text);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            height: 100dvh;
            overflow: hidden;
        }

        .app-container {
            width: 100%;
            max-width: 430px;
            height: 100%;
            background-color: var(--najd-dark);
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 25px rgba(212, 175, 55, 0.15);
        }

        @media (min-width: 431px) {
            .app-container {
                height: 90vh;
                border-radius: 24px;
                border: 2px solid var(--najd-border);
            }
        }

        /* Main Viewport Slider */
        .views-wrapper {
            display: flex;
            width: 300%;
            height: calc(100% - 70px);
            transform: translateX(33.333%);
            transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .view {
            width: 33.3333%;
            height: 100%;
            position: relative;
            overflow-y: auto;
            background-color: var(--najd-dark);
        }

        /* Header Bar */
        .top-bar {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
            z-index: 10;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        }

        .brand-title {
            font-weight: 900;
            font-size: 22px;
            color: var(--najd-gold);
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .brand-title span {
            font-size: 12px;
            background: rgba(212, 175, 55, 0.2);
            padding: 2px 8px;
            border-radius: 10px;
            border: 1px solid var(--najd-gold);
        }

        /* Bottom Navigation */
        .nav-bar {
            height: 70px;
            background-color: var(--najd-surface);
            display: flex;
            justify-content: space-around;
            align-items: center;
            border-top: 1px solid var(--najd-border);
            z-index: 20;
        }

        .nav-item {
            background: none;
            border: none;
            color: var(--najd-muted);
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            transition: color 0.2s;
        }

        .nav-item.active {
            color: var(--najd-gold);
        }

        .nav-item svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
        }

        /* 1. Chat View (Left) */
        .chat-container {
            padding: 70px 15px 20px 15px;
        }

        .section-header {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 15px;
            color: var(--najd-gold);
            border-right: 4px solid var(--najd-gold);
            padding-right: 8px;
        }

        .chat-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .chat-item {
            background-color: var(--najd-card);
            padding: 12px 15px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            transition: background 0.2s;
            border: 1px solid var(--najd-border);
        }

        .chat-item:active {
            background-color: #333;
        }

        .avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--najd-gold), #8b5a2b);
            display: flex;
            justify-content: center;
            align-items: center;
            font-weight: 900;
            font-size: 18px;
            color: #000;
            flex-shrink: 0;
        }

        .chat-info {
            flex-grow: 1;
            overflow: hidden;
        }

        .chat-name {
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 3px;
        }

        .chat-preview {
            font-size: 13px;
            color: var(--najd-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* 2. Camera View (Center) */
        .camera-view {
            background-color: #000;
            position: relative;
        }

        #camera-stream {
            width: 100%;
            height: 100%;
            object-fit: cover;
            position: absolute;
            top: 0;
            left: 0;
        }

        .camera-overlay {
            position: absolute;
            bottom: 40px;
            left: 0;
            right: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            z-index: 5;
        }

        .najdi-sticker {
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid var(--najd-gold);
            padding: 8px 16px;
            border-radius: 20px;
            color: var(--najd-gold);
            font-weight: 700;
            font-size: 14px;
            backdrop-filter: blur(5px);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .capture-btn-container {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: 4px solid #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.2);
            transition: transform 0.1s;
        }

        .capture-btn-container:active {
            transform: scale(0.92);
        }

        .capture-inner {
            width: 64px;
            height: 64px;
            background-color: #fff;
            border-radius: 50%;
        }

        /* 3. Stories View (Right) */
        .stories-container {
            padding: 70px 15px 20px 15px;
        }

        .story-card {
            background: linear-gradient(145deg, var(--najd-card), var(--najd-surface));
            border-radius: 16px;
            padding: 15px;
            margin-bottom: 12px;
            border: 1px solid var(--najd-border);
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .story-ring {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            padding: 3px;
            background: linear-gradient(45deg, var(--najd-gold), #ff8c00);
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .story-avatar-inner {
            width: 100%;
            height: 100%;
            background-color: var(--najd-dark);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-weight: bold;
            color: var(--najd-gold);
        }

        /* Flash Effect for Snapshot */
        .flash {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #fff;
            opacity: 0;
            pointer-events: none;
            z-index: 100;
            transition: opacity 0.3s ease-out;
        }
        .flash.active {
            opacity: 1;
        }
    </style>
</head>
<body>

    <div class="app-container">
        <!-- Top Bar -->
        <div class="top-bar">
            <div class="brand-title">
                نَجْد <span>نجدي أصيل</span>
            </div>
            <div style="color: var(--najd-gold); font-weight: 700; font-size: 14px;" id="status-indicator">● متصل</div>
        </div>

        <!-- Flash Element -->
        <div class="flash" id="flash-effect"></div>

        <!-- Views Wrapper (Chat [0], Camera [1], Stories [2]) -->
        <div class="views-wrapper" id="viewsWrapper">
            
            <!-- Chat View -->
            <div class="view" id="chatView">
                <div class="chat-container">
                    <div class="section-header">الدردشة والرسائل</div>
                    <div class="chat-list" id="chatList">
                        <!-- Dynamic items -->
                    </div>
                </div>
            </div>

            <!-- Camera View -->
            <div class="view camera-view" id="cameraView">
                <video id="camera-stream" autoplay playsinline muted></video>
                <div class="camera-overlay">
                    <div class="najdi_sticker">
                        🛡️ طويق العز • نجد الحبيبة
                    </div>
                    <div class="capture-btn-container" id="captureBtn">
                        <div class="capture-inner"></div>
                    </div>
                </div>
            </div>

            <!-- Stories View -->
            <div class="view" id="storiesView">
                <div class="stories-container">
                    <div class="section-header">قصص نجد اليومية</div>
                    <div id="storiesList">
                        <!-- Dynamic items -->
                    </div>
                </div>
            </div>

        </div>

        <!-- Bottom Navigation Bar -->
        <div class="nav-bar">
            <button class="nav-item" id="navChat" onclick="switchView(0)">
                <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                الدردشة
            </button>
            <button class="nav-item active" id="navCamera" onclick="switchView(1)">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                الكاميرا
            </button>
            <button class="nav-item" id="navStories" onclick="switchView(2)">
                <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 20.55c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l2.12-2.12C9.42 20.37 10.68 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/></svg>
                القصص
            </button>
        </div>
    </div>

    <script>
        const viewsWrapper = document.getElementById('viewsWrapper');
        const navItems = [
            document.getElementById('navChat'),
            document.getElementById('navCamera'),
            document.getElementById('navStories')
        ];

        let currentViewIndex = 1; // Start at Camera

        function switchView(index) {
            currentViewIndex = index;
            // Calculate translation percentage (Center is 33.333% offset)
            const translateX = (1 - index) * 33.333;
            viewsWrapper.style.transform = \`translateX(\${translateX}%)\`;

            navItems.forEach((item, idx) => {
                if (idx === index) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }

        // Initialize Camera Stream with graceful fallback
        async function initCamera() {
            const videoElement = document.getElementById('camera-stream');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'user' }, 
                    audio: false 
                });
                videoElement.srcObject = stream;
            } catch (err) {
                console.warn('Camera access denied or unavailable:', err);
                // Fallback background if camera unavailable
                videoElement.style.backgroundColor = '#111';
            }
        }

        // Snapshot Flash Trigger
        document.getElementById('captureBtn').addEventListener('click', () => {
            const flash = document.getElementById('flash-effect');
            flash.classList.add('active');
            setTimeout(() => {
                flash.classList.remove('active');
                alert('تم التقاط لقطة نجد بنجاح! 📸');
            }, 300);
        });

        // Load mock chat data
        const chats = [
            { name: 'بدر (مسعف)', preview: 'أهلين، كيف الشغل اليوم؟', initial: 'ب' },
            { name: 'سند الرويلي', preview: 'أبشرك الأمور طيبة وعالية العال', initial: 'س' },
            { name: 'سَجى الرويلي', preview: 'محاضرة التمريض بدأت الحين', initial: 'س' },
            { name: 'رنا (النادي)', preview: 'لا تنسى التمرين اليوم بالصالة 💪', initial: 'ر' }
        ];

        const chatListEl = document.getElementById('chatList');
        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-item';
            item.innerHTML = \`
                <div class="avatar">\${chat.initial}</div>
                <div class="chat-info">
                    <div class="chat-name">\${chat.name}</div>
                    <div class="chat-preview">\${chat.preview}</div>
                </div>
            \`;
            item.onclick = () => alert('فتح محادثة مع ' + chat.name);
            chatListEl.appendChild(item);
        });

        // Load mock stories data
        const stories = [
            { name: 'قصص أصدقاء نجد', time: 'منذ ساعتين', initial: 'ن' },
            { name: 'فعاليات الجامعة', time: 'منذ 4 ساعات', initial: 'ج' },
            { name: 'أجواء الرياض ونجد', time: 'قبل قليل', initial: 'ر' }
        ];

        const storiesListEl = document.getElementById('storiesList');
        stories.forEach(story => {
            const item = document.createElement('div');
            item.className = 'story-card';
            item.innerHTML = \`
                <div class="story-ring">
                    <div class="story-avatar-inner">\${story.initial}</div>
                </div>
                <div>
                    <div style="font-weight: 700; font-size: 15px;">\${story.name}</div>
                    <div style="font-size: 12px; color: var(--najd-muted); margin-top: 4px;">\${story.time}</div>
                </div>
            \`;
            item.onclick = () => alert('عرض قصص: ' + story.name);
            storiesListEl.appendChild(item);
        });

        // Run camera on load
        window.addEventListener('DOMContentLoaded', () => {
            initCamera();
            switchView(1); // Default to Camera screen
        });
    </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Status": "dynamic"
      },
    });
  },
};
