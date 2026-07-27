document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("najd_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const user = JSON.parse(localStorage.getItem("najd_user") || "{}");
  if (user.display_name) {
    document.getElementById("userName").textContent = user.display_name;
    document.getElementById("userAvatar").src = user.avatar_url;
  }

  // Load Stories
  const storiesContainer = document.getElementById("storiesContainer");
  const res = await NajdAPI.getStories();

  if (res.success && res.stories.length > 0) {
    storiesContainer.innerHTML = res.stories.map(story => `
      <div style="background: var(--najd-card); border-radius: 16px; padding: 12px; border: 1px solid var(--najd-border);">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="${story.avatar_url}" style="width: 28px; height: 28px; border-radius: 50%;">
          <span style="font-weight: bold; font-size: 14px;">${story.display_name}</span>
        </div>
        <div style="border-radius: 12px; overflow: hidden; background: #000;">
          <img src="${story.media_url}" style="width: 100%; max-height: 300px; object-fit: cover;">
        </div>
        ${story.caption ? `<p style="margin-top: 8px; font-size: 14px; color: #ddd;">${story.caption}</p>` : ''}
      </div>
    `).join('');
  } else {
    storiesContainer.innerHTML = `<p style="text-align: center; color: var(--najd-gray); margin-top: 40px;">لا توجد قصص نشطة حالياً</p>`;
  }
});
