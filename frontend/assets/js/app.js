document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("najd_token");
  if (!token) { window.location.href = "login.html"; return; }

  const user = JSON.parse(localStorage.getItem("najd_user") || "{}");
  if (user.display_name) {
    document.getElementById("userName").textContent = user.display_name;
  }

  const container = document.getElementById("storiesContainer");
  const res = await NajdAPI.getStories();

  if (res.success && res.stories.length > 0) {
    container.innerHTML = res.stories.map(s => `
      <div style="background: var(--najd-card); border-radius: 16px; padding: 12px; border: 1px solid var(--najd-border);">
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px;">${s.display_name}</div>
        ${s.media_url ? `<img src="${s.media_url}" style="width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px;">` : ''}
        ${s.caption ? `<p style="margin-top: 8px; font-size: 14px; color: #ddd;">${s.caption}</p>` : ''}
      </div>
    `).join('');
  } else {
    container.innerHTML = `<p style="text-align: center; color: var(--najd-gray); margin-top: 40px;">لا توجد قصص نشطة حالياً</p>`;
  }
});
