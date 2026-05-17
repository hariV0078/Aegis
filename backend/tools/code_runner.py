async def code_runner(input_data: str = "", code: str = "", **kwargs):
    try:
        if code:
            local_vars = {"input_data": input_data, "result": None}
            exec(code, {}, local_vars)
            if local_vars.get("result") is not None:
                return str(local_vars["result"])
    except Exception as e:
        return f"[Code Runner Error] {e}\nRaw Data:\n{input_data}"
    return input_data
