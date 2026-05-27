import os, requests, boto3

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "What's the weather in Tokyo?")

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

def weather(city=""):
    print(f"Fetching weather for {city or 'your location'}...")
    r = requests.get(f"https://wttr.in/{city}", params={"format": 4},
                     headers={"User-Agent": "curl/8"}, timeout=10)
    return r.text.strip()

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

TOOLS = [
    spec("weather", "Weather for a city. If no city is given, uses the user's current location.",  {"city": {"type": "string"}}, []),
]
DISPATCH = {"weather": weather}

def run(user_msg):
    r = client.converse(modelId=MODEL,
        messages=[{"role": "user", "content": [{"text": user_msg}]}],
        toolConfig={"tools": TOOLS}, inferenceConfig={"maxTokens": 1024})
    for b in r["output"]["message"]["content"]:
        if "toolUse" not in b: continue
        t = b["toolUse"]
        print(f"MODEL: {t['name']}({t['input']})")
        print(f"RESULT: {DISPATCH[t['name']](**t['input'])}\n")

if __name__ == "__main__":
    run(Q)
