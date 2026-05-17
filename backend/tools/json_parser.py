import json

async def json_parser(input_data: str = "", query: str = "", **kwargs):
    try:
        data = json.loads(input_data)
        if query:
            parts = query.split(".")
            for part in parts:
                if isinstance(data, dict):
                    data = data.get(part, data)
                elif isinstance(data, list):
                    try:
                        data = data[int(part)]
                    except Exception:
                        pass
            return str(data)
        return json.dumps(data, indent=2)
    except Exception:
        pass
    return input_data
