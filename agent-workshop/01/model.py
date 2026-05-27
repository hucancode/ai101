import os, boto3

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "How to buy Fujifilm X-E5 for cheap")

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

def chat(user, system=None):
    kw = {"modelId": MODEL, "messages": [{"role": "user", "content": [{"text": user}]}],
          "inferenceConfig": {"maxTokens": 1024}}
    if system: kw["system"] = [{"text": system}]
    return client.converse(**kw)["output"]["message"]["content"][0]["text"]

if __name__ == "__main__":
    print(chat(Q))
    # print(chat(Q, "Reply with a numbered list of browser steps. No prose."))
    # print(chat(Q, 'Reply ONLY valid JSON: {"steps":[...]}. No fences.'))
