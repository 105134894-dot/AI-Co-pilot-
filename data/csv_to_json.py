import csv
import json

csv_file = "KnowledgeMapv2.csv"
json_file = "KnowledgeMapv2.json"

data = []

with open(csv_file, newline='', encoding="cp1252") as f:
    reader = csv.DictReader(f)
    for row in reader:
        data.append(row)

with open(json_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Saved KnowledgeMapv2.json")