import os, boto3

MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "How to buy Fujifilm X-E5 for cheap")
SYS        = os.environ.get("SYS", "")

client = boto3.client("bedrock-runtime")

def chat(user, system=None):
    kw = {"modelId": MODEL, "messages": [{"role": "user", "content": [{"text": user}]}]}
    if system: kw["system"] = [{"text": system}]
    return client.converse(**kw)["output"]["message"]["content"][0]["text"]

if __name__ == "__main__":
    print(chat(Q, SYS))
