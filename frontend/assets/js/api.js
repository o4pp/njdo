const API_BASE = "https://njdo.ig999x.workers.dev";

const NajdAPI = {

async request(endpoint, options = {}) {

```
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
  } catch (error) {
    console.error("Invalid JSON response:", text);

    return {
      success: false,
      message: "استجابة غير صالحة من الخادم",
      raw: text
    };
  }

  return data;

} catch (error) {

  console.error("API Request Error:", error);

  return {
    success: false,
    message: "تعذر الاتصال بالخادم"
  };
}
```

},

async register(username, password, display_name) {

```
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
```

},

async login(username, password) {

```
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
```

},

async getStories() {

```
return this.request(
  "/api/stories",
  {
    method: "GET"
  }
);
```

},

async postStory(media_url, media_type, caption = "") {

```
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
```

},

logout() {

```
localStorage.removeItem("najd_token");
localStorage.removeItem("najd_user");

window.location.href = "login.html";
```

},

getCurrentUser() {

```
const user = localStorage.getItem("najd_user");

if (!user) {
  return null;
}

try {
  return JSON.parse(user);
} catch {
  return null;
}
```

},

isLoggedIn() {

```
return Boolean(
  localStorage.getItem("najd_token")
);
```

}

};
