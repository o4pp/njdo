DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS friendships;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT DEFAULT 'https://api.iconify.design/solar:user-bold-duotone.svg',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL, -- 'image' or 'video'
    caption TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE friendships (
    user_id TEXT,
    friend_id TEXT,
    status TEXT DEFAULT 'accepted',
    PRIMARY KEY (user_id, friend_id)
);
