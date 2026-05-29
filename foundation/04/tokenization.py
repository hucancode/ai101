import tiktoken

enc = tiktoken.get_encoding("cl100k_base")
for text in ["hello world", "antidisestablishmentarianism", "你好世界", "🚀🌙"]:
    ids = enc.encode(text)
    pieces = [enc.decode([i]) for i in ids]
    print(f"{text!r:40}  {len(ids)} tokens  {pieces}")
