const API_BASE = "https://njdo.ig999x.workers.dev";

const NajdAPI = {

  async request(endpoint, options = {}) {

    const token = localStorage.getItem("najd_token");

    const headers = {
      "Content-Type": "application/json",
      ...(token
        ? {
            "Authorization": `Bearer ${token}`
          }
        : {}),
      ...(options.headers || {})
    };

    try {

      const response = await fetch(
        `${API_BASE}${endpoint}`,
        {
          ...options,
          headers
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          message: "الخادم أعاد استجابة غير صالحة",
          raw: text
        };
      }

      return data;

    } catch (error) {

      console.error("Najd API Error:", error);

      return {
        success: false,
        message: "تعذر الاتصال بالخادم"
      };
    }
  },


  register(username, password, display_name) {

    return this.request(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          display_name: display_name.trim()
        })
      }
    );
  },


  login(username, password) {

    return this.request(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      }
    );
  },


  getStories() {

    return this.request(
      "/api/stories"
    );
  },


  postStory(media_url, media_type, caption) {

    return this.request(
      "/api/stories",
      {
        method: "POST",
        body: JSON.stringify({
          media_url,
          media_type,
          caption
        })
      }
    );
  }

};
