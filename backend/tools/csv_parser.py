import csv
import io

async def csv_parser(input_data: str = "", **kwargs):
    try:
        f = io.StringIO(input_data.strip())
        reader = csv.reader(f)
        rows = list(reader)
        if rows:
            return "\n".join([", ".join(row) for row in rows])
    except Exception:
        pass
    return input_data
