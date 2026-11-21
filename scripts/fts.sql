-- FTS5 全文索引（幂等：每次启动都可重跑）
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  bookmark_id UNINDEXED,
  title,
  description,
  url,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- 重建内容（先清空，避免重复行）
DELETE FROM bookmarks_fts;

INSERT INTO bookmarks_fts (bookmark_id, title, description, url, tags)
SELECT
  b.id,
  b.title,
  COALESCE(b.description, ''),
  b.url,
  COALESCE((SELECT group_concat(t.name, ' ') FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.bookmark_id = b.id), '')
FROM bookmarks b;

CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts (bookmark_id, title, description, url, tags)
  VALUES (new.id, new.title, COALESCE(new.description, ''), new.url, '');
END;

CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  DELETE FROM bookmarks_fts WHERE bookmark_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE OF title, description, url ON bookmarks BEGIN
  UPDATE bookmarks_fts
  SET title = new.title,
      description = COALESCE(new.description, ''),
      url = new.url
  WHERE bookmark_id = new.id;
END;
